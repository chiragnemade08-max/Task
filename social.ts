import { Pool } from "pg";
import type { Express, Request, Response } from "express";
import { getUserByToken } from "./auth";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function buildStudyStats(appState: any) {
  const tasks = Array.isArray(appState?.tasks) ? appState.tasks : [];
  const completed = tasks.filter((task: any) => task?.status === "completed");
  const dailyMinutes: Record<string, number> = {};
  const subjectMinutes: Record<string, number> = {};

  for (const task of completed) {
    const minutes = Number(task.duration) || 0;
    if (task.date) dailyMinutes[task.date] = (dailyMinutes[task.date] || 0) + minutes;
    if (task.subject) subjectMinutes[task.subject] = (subjectMinutes[task.subject] || 0) + minutes;
  }

  return {
    totalMinutes: completed.reduce((sum: number, task: any) => sum + (Number(task.duration) || 0), 0),
    completedTasks: completed.length,
    dailyMinutes,
    subjectMinutes,
  };
}

function mergeStudyStats(accountStats: any, legacyStats: any) {
  const account = accountStats && typeof accountStats === "object" ? accountStats : {};
  const legacy = legacyStats && typeof legacyStats === "object" ? legacyStats : {};
  const mergeBuckets = (key: "dailyMinutes" | "subjectMinutes") => {
    const merged = { ...(account[key] ?? {}) };
    for (const [name, value] of Object.entries(legacy[key] ?? {})) {
      merged[name] = Math.max(Number(merged[name]) || 0, Number(value) || 0);
    }
    return merged;
  };
  return {
    ...account,
    ...legacy,
    totalMinutes: Math.max(Number(account.totalMinutes) || 0, Number(legacy.totalMinutes) || 0),
    completedTasks: Math.max(Number(account.completedTasks) || 0, Number(legacy.completedTasks) || 0),
    dailyMinutes: mergeBuckets("dailyMinutes"),
    subjectMinutes: mergeBuckets("subjectMinutes"),
  };
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  return auth?.startsWith("Bearer ") ? auth.slice(7) : null;
}

async function getAuthenticatedUser(req: Request, res: Response) {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  const user = await getUserByToken(token);
  if (!user) {
    res.status(401).json({ error: "Session expired" });
    return null;
  }
  return user;
}

function requireOwnDevice(user: any, deviceId: string | undefined, res: Response): boolean {
  if (deviceId !== user.device_id) {
    res.status(403).json({ error: "You can only access your own account data" });
    return false;
  }
  return true;
}

function socialUserPayload(user: any) {
  return {
    device_id: user.device_id,
    name: user.name,
    username: user.username,
    bio: user.bio,
    avatar_color: user.avatar_color,
    friend_code: user.friend_code,
    xp: user.xp,
    streak: user.streak,
    study_hours: user.study_hours,
    tasks_completed: user.tasks_completed,
    longest_streak: user.longest_streak,
    study_stats: user.study_stats ?? {},
  };
}

export function registerSocialRoutes(app: Express) {

  // Move the pre-account local social identity onto the permanent account ID.
  // Older app versions generated a random dev_* ID before signup/login.
  app.post("/api/social/users/migrate", async (req: Request, res: Response) => {
    const authUser = await getAuthenticatedUser(req, res);
    if (!authUser) return;
    const { legacyDeviceId, accountDeviceId } = req.body;
    if (!accountDeviceId) {
      return res.status(400).json({ error: "Migration details required" });
    }
    if (!requireOwnDevice(authUser, accountDeviceId, res)) return;
    if (legacyDeviceId && legacyDeviceId === accountDeviceId) {
      const { rows } = await pool.query(
        "SELECT app_state FROM user_app_data WHERE device_id = $1",
        [accountDeviceId],
      );
      return res.json({
        user: socialUserPayload(authUser),
        appState: rows[0]?.app_state ?? null,
        migrated: false,
      });
    }
    if (legacyDeviceId && !String(legacyDeviceId).startsWith("dev_")) {
      return res.status(400).json({ error: "Only a legacy guest profile can be linked" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      let oldResult;
      if (legacyDeviceId) {
        oldResult = await client.query(
          `SELECT * FROM users
           WHERE device_id = $1
             AND password_hash IS NULL
             AND email IS NULL
             AND session_token IS NULL
           FOR UPDATE`,
          [legacyDeviceId],
        );
      } else if (authUser.username) {
        // Recover older installs that lost their local profile during an
        // uninstall, when the old social row has the same username.
        oldResult = await client.query(
          `SELECT * FROM users
           WHERE device_id <> $1
             AND password_hash IS NULL
             AND email IS NULL
              AND LEFT(device_id, 4) = 'dev_'
             AND LOWER(username) = LOWER($2)
           ORDER BY created_at ASC
           LIMIT 1
           FOR UPDATE`,
          [accountDeviceId, authUser.username],
        );
      } else {
        oldResult = { rows: [] } as any;
      }
      const accountResult = await client.query(
        "SELECT * FROM users WHERE device_id = $1 FOR UPDATE",
        [accountDeviceId],
      );
      if (!accountResult.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Account not found" });
      }
      if (!oldResult.rows.length) {
        const { rows: stateRows } = await client.query(
          "SELECT app_state FROM user_app_data WHERE device_id = $1",
          [accountDeviceId],
        );
        await client.query("COMMIT");
        return res.json({
          user: socialUserPayload(accountResult.rows[0]),
          appState: stateRows[0]?.app_state ?? null,
          migrated: false,
        });
      }

      const oldUser = oldResult.rows[0];
      const oldIdentity = oldUser.device_id;
      const accountUser = accountResult.rows[0];
      const oldUsername = oldUser.username?.trim().toLowerCase() || null;
      let mergedUsername = accountUser.username;
      if (oldUsername && oldUsername !== accountUser.username) {
        const usernameConflict = await client.query(
          "SELECT 1 FROM users WHERE LOWER(username) = $1 AND device_id NOT IN ($2, $3)",
          [oldUsername, oldIdentity, accountDeviceId],
        );
        if (!usernameConflict.rows.length) mergedUsername = oldUsername;
      }

      // Move all accepted friendships to the permanent account identity.
      await client.query(
        `INSERT INTO friendships (device_id1, device_id2)
         SELECT LEAST(
                  CASE WHEN device_id1 = $1 THEN $2 ELSE device_id1 END,
                  CASE WHEN device_id2 = $1 THEN $2 ELSE device_id2 END
                ),
                GREATEST(
                  CASE WHEN device_id1 = $1 THEN $2 ELSE device_id1 END,
                  CASE WHEN device_id2 = $1 THEN $2 ELSE device_id2 END
                )
         FROM friendships
         WHERE (device_id1 = $1 OR device_id2 = $1)
           AND NOT (
             (device_id1 = $1 AND device_id2 = $2) OR
             (device_id1 = $2 AND device_id2 = $1)
           )
         ON CONFLICT DO NOTHING`,
        [oldIdentity, accountDeviceId],
      );
      await client.query(
        "DELETE FROM friendships WHERE device_id1 = $1 OR device_id2 = $1",
        [oldIdentity],
      );

      // Preserve pending requests as well as accepted friendships.
      await client.query(
        `INSERT INTO friend_requests (from_device_id, to_device_id, status, created_at)
         SELECT CASE WHEN from_device_id = $1 THEN $2 ELSE from_device_id END,
                CASE WHEN to_device_id = $1 THEN $2 ELSE to_device_id END,
                status, created_at
         FROM friend_requests
         WHERE (from_device_id = $1 OR to_device_id = $1)
           AND NOT (
             (from_device_id = $1 AND to_device_id = $2) OR
             (from_device_id = $2 AND to_device_id = $1)
           )
         ON CONFLICT DO NOTHING`,
        [oldIdentity, accountDeviceId],
      );
      await client.query(
        "DELETE FROM friend_requests WHERE from_device_id = $1 OR to_device_id = $1",
        [oldIdentity],
      );

      // Keep the account's app state if it already exists; otherwise preserve
      // the old local profile's cloud state.
      await client.query(
        `INSERT INTO user_app_data (device_id, app_state, updated_at)
         SELECT $2, app_state, updated_at FROM user_app_data
         WHERE device_id = $1
         ON CONFLICT (device_id) DO NOTHING`,
        [oldIdentity, accountDeviceId],
      );
      await client.query("DELETE FROM user_app_data WHERE device_id = $1", [oldIdentity]);

      await client.query("DELETE FROM users WHERE device_id = $1", [oldIdentity]);
      const mergedStats = mergeStudyStats(accountUser.study_stats, oldUser.study_stats);
      const { rows } = await client.query(
        `UPDATE users SET
           name = $2,
           username = $3,
           bio = $4,
           avatar_color = $5,
           friend_code = $6,
           xp = GREATEST(COALESCE(xp, 0), $7),
           streak = GREATEST(COALESCE(streak, 0), $8),
           study_hours = GREATEST(COALESCE(study_hours, 0), $9),
           tasks_completed = GREATEST(COALESCE(tasks_completed, 0), $10),
           longest_streak = GREATEST(COALESCE(longest_streak, 0), $11),
           study_stats = $12,
           updated_at = NOW()
         WHERE device_id = $1
         RETURNING *`,
        [
          accountDeviceId,
          oldUser.name || accountUser.name,
          mergedUsername,
          oldUser.bio ?? accountUser.bio,
          oldUser.avatar_color ?? accountUser.avatar_color,
          oldUser.friend_code || accountUser.friend_code,
          Number(oldUser.xp) || 0,
          Number(oldUser.streak) || 0,
          Number(oldUser.study_hours) || 0,
          Number(oldUser.tasks_completed) || 0,
          Number(oldUser.longest_streak) || 0,
          JSON.stringify(mergedStats),
        ],
      );

      const { rows: stateRows } = await client.query(
        "SELECT app_state FROM user_app_data WHERE device_id = $1",
        [accountDeviceId],
      );
      await client.query("COMMIT");
      return res.json({
        user: socialUserPayload(rows[0]),
        appState: stateRows[0]?.app_state ?? null,
        migrated: true,
      });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Social identity migration error:", err);
      return res.status(500).json({ error: "Could not preserve the existing social identity" });
    } finally {
      client.release();
    }
  });

  // Register or update user profile
  app.post("/api/social/users/register", async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req, res);
      if (!authUser) return;
      const { deviceId, name, username, bio, avatarColor } = req.body;
      if (!deviceId) return res.status(400).json({ error: "deviceId required" });
      if (!requireOwnDevice(authUser, deviceId, res)) return;
      const usernameClean = username === undefined
        ? undefined
        : (String(username).trim().toLowerCase() || null);

      const { rows } = await pool.query(
        `UPDATE users SET
          name = COALESCE($2, name),
          username = COALESCE($3, username),
          bio = COALESCE($4, bio),
          avatar_color = COALESCE($5, avatar_color),
          updated_at = NOW()
         WHERE device_id = $1
         RETURNING *`,
        [authUser.device_id, name, usernameClean, bio, avatarColor],
      );
      if (!rows.length) return res.status(404).json({ error: "Account not found" });
      return res.json({ user: socialUserPayload(rows[0]), created: false });
    } catch (err: any) {
      if (err.code === "23505") return res.status(409).json({ error: "Username already taken" });
      console.error("Register error:", err);
      return res.status(500).json({ error: "Server error" });
    }
  });

  // Update only the authenticated account's progress. Profile identity fields
  // are deliberately handled by the profile endpoint above.
  app.post("/api/social/users/stats", async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req, res);
      if (!authUser) return;
      const { deviceId, xp, streak, studyHours, tasksCompleted, longestStreak, studyStats } = req.body;
      if (!deviceId) return res.status(400).json({ error: "deviceId required" });
      if (!requireOwnDevice(authUser, deviceId, res)) return;
      const numericStats = [xp, streak, studyHours, tasksCompleted, longestStreak];
      if (numericStats.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) {
        return res.status(400).json({ error: "Progress values must be non-negative numbers" });
      }
      if (studyStats !== undefined && (studyStats === null || typeof studyStats !== "object" || Array.isArray(studyStats))) {
        return res.status(400).json({ error: "Study stats must be an object" });
      }
      const { rows } = await pool.query(
        `UPDATE users SET
          xp = $2,
          streak = $3,
          study_hours = $4,
          tasks_completed = $5,
          longest_streak = $6,
          study_stats = COALESCE($7, study_stats, '{}'::jsonb),
          updated_at = NOW()
         WHERE device_id = $1
         RETURNING *`,
        [authUser.device_id, xp, streak, studyHours, tasksCompleted, longestStreak, studyStats ?? null],
      );
      if (!rows.length) return res.status(404).json({ error: "Account not found" });
      return res.json({ user: socialUserPayload(rows[0]) });
    } catch (err) {
      console.error("Progress sync error:", err);
      return res.status(500).json({ error: "Could not sync study progress" });
    }
  });

  // Get own profile
  app.get("/api/social/users/:deviceId", async (req: Request, res: Response) => {
    const authUser = await getAuthenticatedUser(req, res);
    const requestedDeviceId = String(req.params.deviceId);
    if (!authUser || !requireOwnDevice(authUser, requestedDeviceId, res)) return;
    const { rows } = await pool.query("SELECT * FROM users WHERE device_id = $1", [authUser.device_id]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    return res.json(socialUserPayload(rows[0]));
  });

  // Find by friend code
  app.get("/api/social/find/code/:code", async (req: Request, res: Response) => {
    const { rows } = await pool.query("SELECT * FROM users WHERE UPPER(friend_code) = UPPER($1)", [req.params.code]);
    if (!rows.length) return res.status(404).json({ error: "No user found with that code" });
    return res.json(socialUserPayload(rows[0]));
  });

  // Find by username
  app.get("/api/social/find/username/:username", async (req: Request, res: Response) => {
    const { rows } = await pool.query("SELECT * FROM users WHERE LOWER(username) = LOWER($1)", [req.params.username]);
    if (!rows.length) return res.status(404).json({ error: "No user found with that username" });
    return res.json(socialUserPayload(rows[0]));
  });

  // Check username availability + suggest alternative
  app.get("/api/social/check/username/:username", async (req: Request, res: Response) => {
    const authUser = await getAuthenticatedUser(req, res);
    if (!authUser) return;
    const raw = String(req.params.username).toLowerCase().replace(/[^a-z0-9_.]/g, "");
    const excludeDeviceId = req.query.deviceId as string | undefined;
    if (!requireOwnDevice(authUser, excludeDeviceId, res)) return;

    const { rows } = await pool.query(
      "SELECT device_id FROM users WHERE LOWER(username) = $1",
      [raw]
    );
    const takenByOther = rows.length > 0 && rows[0].device_id !== excludeDeviceId;

    if (!takenByOther) return res.json({ available: true, username: raw });

    // Generate suggestion: append numbers until available
    for (let i = 1; i <= 99; i++) {
      const candidate = `${raw}${i}`;
      const { rows: r2 } = await pool.query(
        "SELECT 1 FROM users WHERE LOWER(username) = $1",
        [candidate]
      );
      if (!r2.length) return res.json({ available: false, suggestion: candidate });
    }
    return res.json({ available: false, suggestion: `${raw}${Math.floor(Math.random() * 9000) + 1000}` });
  });

  // Send friend request
  app.post("/api/social/friends/request", async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req, res);
      if (!authUser) return;
      const { fromDeviceId, toDeviceId } = req.body;
      if (!fromDeviceId || !toDeviceId) return res.status(400).json({ error: "Both device IDs required" });
      if (!requireOwnDevice(authUser, fromDeviceId, res)) return;
      if (fromDeviceId === toDeviceId) return res.status(400).json({ error: "Cannot add yourself" });

      const target = await pool.query("SELECT 1 FROM users WHERE device_id = $1", [toDeviceId]);
      if (!target.rows.length) return res.status(404).json({ error: "Friend account not found" });

      // Check not already friends
      const friends = await pool.query(
        "SELECT 1 FROM friendships WHERE (device_id1=$1 AND device_id2=$2) OR (device_id1=$2 AND device_id2=$1)",
        [fromDeviceId, toDeviceId]
      );
      if (friends.rows.length) return res.status(409).json({ error: "Already friends" });

      // Check reverse request exists → auto-accept
      const reverse = await pool.query(
        "SELECT * FROM friend_requests WHERE from_device_id=$1 AND to_device_id=$2 AND status='pending'",
        [toDeviceId, fromDeviceId]
      );
      if (reverse.rows.length) {
        await pool.query("UPDATE friend_requests SET status='accepted' WHERE id=$1", [reverse.rows[0].id]);
        const minId = fromDeviceId < toDeviceId ? fromDeviceId : toDeviceId;
        const maxId = fromDeviceId < toDeviceId ? toDeviceId : fromDeviceId;
        await pool.query("INSERT INTO friendships (device_id1, device_id2) VALUES ($1,$2) ON CONFLICT DO NOTHING", [minId, maxId]);
        return res.json({ status: "accepted", message: "Mutual request — now friends!" });
      }

      const { rows } = await pool.query(
        "INSERT INTO friend_requests (from_device_id, to_device_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING *",
        [fromDeviceId, toDeviceId]
      );
      return res.json({ status: "pending", request: rows[0] });
    } catch (err) {
      console.error("Friend request error:", err);
      return res.status(500).json({ error: "Server error" });
    }
  });

  // Get received friend requests
  app.get("/api/social/friends/requests/:deviceId", async (req: Request, res: Response) => {
    const authUser = await getAuthenticatedUser(req, res);
    const requestedDeviceId = String(req.params.deviceId);
    if (!authUser || !requireOwnDevice(authUser, requestedDeviceId, res)) return;
    const { rows } = await pool.query(
      `SELECT fr.*, u.name, u.username, u.avatar_color, u.friend_code, u.xp, u.streak
       FROM friend_requests fr
       JOIN users u ON u.device_id = fr.from_device_id
       WHERE fr.to_device_id = $1 AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
      [authUser.device_id]
    );
    return res.json(rows);
  });

  // Accept friend request
  app.put("/api/social/friends/requests/:id/accept", async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req, res);
      if (!authUser) return;
      if (req.body.deviceId && !requireOwnDevice(authUser, req.body.deviceId, res)) return;
      const req_ = await pool.query(
        "SELECT * FROM friend_requests WHERE id=$1 AND to_device_id=$2 AND status='pending'",
        [req.params.id, authUser.device_id],
      );
      if (!req_.rows.length) return res.status(404).json({ error: "Request not found" });

      const fr = req_.rows[0];
      await pool.query("UPDATE friend_requests SET status='accepted' WHERE id=$1", [fr.id]);
      const d1 = fr.from_device_id < fr.to_device_id ? fr.from_device_id : fr.to_device_id;
      const d2 = fr.from_device_id < fr.to_device_id ? fr.to_device_id : fr.from_device_id;
      await pool.query("INSERT INTO friendships (device_id1, device_id2) VALUES ($1,$2) ON CONFLICT DO NOTHING", [d1, d2]);
      return res.json({ success: true });
    } catch (err) {
      console.error("Accept error:", err);
      return res.status(500).json({ error: "Server error" });
    }
  });

  // Reject friend request
  app.put("/api/social/friends/requests/:id/reject", async (req: Request, res: Response) => {
    const authUser = await getAuthenticatedUser(req, res);
    if (!authUser) return;
    const { rowCount } = await pool.query(
      "UPDATE friend_requests SET status='rejected' WHERE id=$1 AND to_device_id=$2 AND status='pending'",
      [req.params.id, authUser.device_id],
    );
    if (!rowCount) return res.status(404).json({ error: "Request not found" });
    return res.json({ success: true });
  });

  // Get friends list
  app.get("/api/social/friends/:deviceId", async (req: Request, res: Response) => {
    const authUser = await getAuthenticatedUser(req, res);
    const requestedDeviceId = String(req.params.deviceId);
    if (!authUser || !requireOwnDevice(authUser, requestedDeviceId, res)) return;
    const { rows } = await pool.query(
      `SELECT u.device_id, u.name, u.username, u.bio, u.avatar_color, u.friend_code,
              u.xp, u.streak, u.study_hours, u.tasks_completed, u.longest_streak,
              u.study_stats, d.app_state AS app_state
       FROM friendships f
       JOIN users u ON u.device_id = CASE
         WHEN f.device_id1 = $1 THEN f.device_id2
         ELSE f.device_id1
       END
        LEFT JOIN user_app_data d ON d.device_id = u.device_id
       WHERE f.device_id1 = $1 OR f.device_id2 = $1
       ORDER BY u.xp DESC`,
      [authUser.device_id]
    );
    return res.json(rows.map(({ app_state, study_stats, ...user }) => ({
      ...user,
      study_stats: study_stats?.totalMinutes !== undefined
        ? study_stats
        : buildStudyStats(app_state),
    })));
  });

  // Remove friend
  app.delete("/api/social/friends/:deviceId/:friendDeviceId", async (req: Request, res: Response) => {
    const authUser = await getAuthenticatedUser(req, res);
    const requestedDeviceId = String(req.params.deviceId);
    if (!authUser || !requireOwnDevice(authUser, requestedDeviceId, res)) return;
    const { deviceId, friendDeviceId } = req.params;
    await pool.query(
      "DELETE FROM friendships WHERE (device_id1=$1 AND device_id2=$2) OR (device_id1=$2 AND device_id2=$1)",
      [authUser.device_id, friendDeviceId]
    );
    return res.json({ success: true });
  });
}
