import crypto from "crypto";
import { Pool } from "pg";
import type { Express, Request, Response } from "express";
import nodemailer from "nodemailer";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString("hex");
}

function makePasswordHash(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${hashPassword(password, salt)}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}

async function getUniqueFriendCode(): Promise<string> {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < 30; i++) {
    let code = "";
    for (let j = 0; j < 6; j++) code += chars[Math.floor(Math.random() * chars.length)];
    const { rows } = await pool.query("SELECT 1 FROM users WHERE friend_code = $1", [code]);
    if (!rows.length) return code;
  }
  throw new Error("Could not generate unique friend code");
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

export async function getUserByToken(token: string) {
  const { rows } = await pool.query(
    "SELECT * FROM users WHERE session_token = $1",
    [token]
  );
  return rows[0] ?? null;
}

async function sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
  if (!process.env.SENDER_EMAIL || !process.env.SENDER_APP_PASSWORD) {
    throw new Error("Password reset email delivery is not configured.");
  }
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SENDER_EMAIL,
      pass: process.env.SENDER_APP_PASSWORD,
    },
  });
  await transporter.sendMail({
    from: `"Taskschedular AI" <${process.env.SENDER_EMAIL}>`,
    to,
    subject: "Reset your Taskschedular AI password",
    html: `
      <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto">
        <h2>Password Reset</h2>
        <p>Use this code in the app to reset your password. It expires in <strong>1 hour</strong>.</p>
        <div style="font-size:32px;letter-spacing:8px;font-weight:bold;padding:20px;background:#F0F4FF;border-radius:12px;text-align:center">
          ${resetToken.slice(0, 8).toUpperCase()}
        </div>
        <p style="color:#666;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
      </div>`,
  });
}

// ─── Routes ──────────────────────────────────────────────────────────────────
export function registerAuthRoutes(app: Express): void {

  // POST /api/auth/register
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { email, username, password, deviceId } = req.body as {
        email?: string; username?: string; password: string; deviceId?: string;
      };

      if (!password || password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters." });
      }
      if (!email && !username) {
        return res.status(400).json({ error: "Email address or username is required." });
      }

      const emailClean = email?.trim().toLowerCase() || null;
      const usernameClean = username?.trim().toLowerCase() || null;

      // Only an unclaimed legacy guest identity can be attached during signup.
      // Account device IDs are not credentials and must never be enough to
      // reset an existing account's password.
      const legacyDeviceId = typeof deviceId === "string" && deviceId.startsWith("dev_")
        ? deviceId
        : null;
      let legacyUser: Record<string, any> | null = null;
      let legacyDeviceIdExists = false;
      if (legacyDeviceId) {
        const { rows } = await pool.query(
          "SELECT * FROM users WHERE device_id = $1",
          [legacyDeviceId],
        );
        legacyDeviceIdExists = rows.length > 0;
        const candidate = rows[0];
        if (
          candidate &&
          candidate.password_hash == null &&
          candidate.email == null &&
          candidate.session_token == null
        ) {
          legacyUser = candidate;
        }
      }

      // Check email uniqueness
      if (emailClean) {
        const { rows } = await pool.query(
          "SELECT 1 FROM users WHERE LOWER(email) = $1",
          [emailClean]
        );
        if (rows.length) return res.status(409).json({ error: "An account with this email already exists." });
      }

      // Check username uniqueness
      if (usernameClean) {
        const { rows } = await pool.query(
          `SELECT 1 FROM users
           WHERE LOWER(username) = $1
             AND ($2::text IS NULL OR device_id <> $2)`,
          [usernameClean, legacyUser?.device_id ?? null]
        );
        if (rows.length) return res.status(409).json({ error: "Username is already taken." });
      }

      const passwordHash = makePasswordHash(password);
      const sessionToken = generateToken();

      // Preserve the old guest identity and its friend code when this device
      // proves possession by presenting its locally stored dev_* ID.
      if (legacyUser) {
        const { rows: updated } = await pool.query(
          `UPDATE users SET
             email = COALESCE($1, email),
             username = COALESCE(NULLIF($2,''), username),
             password_hash = $3,
             session_token = $4
           WHERE device_id = $5
           RETURNING *`,
          [emailClean, usernameClean || "", passwordHash, sessionToken, legacyUser.device_id]
        );
        return res.json({ token: sessionToken, user: sanitizeUser(updated[0]) });
      }

      // Create brand-new account
      const newDeviceId = legacyDeviceId && !legacyDeviceIdExists
        ? legacyDeviceId
        : generateToken();
      const friendCode = await getUniqueFriendCode();
      const displayName = usernameClean || emailClean?.split("@")[0] || "Student";

      const { rows } = await pool.query(
        `INSERT INTO users
           (device_id, name, username, email, password_hash, session_token, friend_code,
            xp, streak, study_hours, tasks_completed, longest_streak)
         VALUES ($1,$2,$3,$4,$5,$6,$7, 0,0,0,0,0)
         RETURNING *`,
        [newDeviceId, displayName, usernameClean, emailClean, passwordHash, sessionToken, friendCode]
      );

      return res.json({ token: sessionToken, user: sanitizeUser(rows[0]) });
    } catch (err: any) {
      console.error("Register error:", err);
      if (err?.code === "28000" || /endpoint has been disabled|database.*(frozen|disabled)/i.test(err?.message ?? "")) {
        return res.status(503).json({
          error: "Account service is temporarily unavailable. Please try again shortly.",
        });
      }
      return res.status(500).json({ error: "Registration failed. Please try again." });
    }
  });

  // POST /api/auth/login
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { identifier, password } = req.body as { identifier: string; password: string };
      if (!identifier || !password) {
        return res.status(400).json({ error: "Email/username and password are required." });
      }

      const id = identifier.trim().toLowerCase();
      const { rows } = await pool.query(
        "SELECT * FROM users WHERE LOWER(email) = $1 OR LOWER(username) = $1",
        [id]
      );
      if (!rows.length) {
        return res.status(401).json({ error: "No account found with that email or username." });
      }

      const user = rows[0];
      if (!user.password_hash) {
        return res.status(401).json({ error: "This account has no password. Please sign up again." });
      }
      if (!verifyPassword(password, user.password_hash)) {
        return res.status(401).json({ error: "Incorrect password." });
      }

      const sessionToken = generateToken();
      await pool.query(
        "UPDATE users SET session_token = $1 WHERE device_id = $2",
        [sessionToken, user.device_id]
      );

      // Load cloud app state
      const { rows: dataRows } = await pool.query(
        "SELECT app_state FROM user_app_data WHERE device_id = $1",
        [user.device_id]
      );

      return res.json({
        token: sessionToken,
        user: sanitizeUser({ ...user, session_token: sessionToken }),
        appState: dataRows[0]?.app_state ?? null,
      });
    } catch (err: any) {
      console.error("Login error:", err);
      if (err?.code === "28000" || /endpoint has been disabled|database.*(frozen|disabled)/i.test(err?.message ?? "")) {
        return res.status(503).json({
          error: "Account service is temporarily unavailable. Please try again shortly.",
        });
      }
      return res.status(500).json({ error: "Login failed. Please try again." });
    }
  });

  // POST /api/auth/logout
  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    const token = getBearerToken(req);
    if (token) {
      await pool.query("UPDATE users SET session_token = NULL WHERE session_token = $1", [token]).catch(() => {});
    }
    return res.json({ ok: true });
  });

  // GET /api/auth/me
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "No token." });
    const user = await getUserByToken(token);
    if (!user) return res.status(401).json({ error: "Session expired. Please log in again." });

    const { rows: dataRows } = await pool.query(
      "SELECT app_state FROM user_app_data WHERE device_id = $1",
      [user.device_id]
    );
    return res.json({ user: sanitizeUser(user), appState: dataRows[0]?.app_state ?? null });
  });

  // POST /api/auth/sync  (save full app state to cloud)
  app.post("/api/auth/sync", async (req: Request, res: Response) => {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "No token." });
    const user = await getUserByToken(token);
    if (!user) return res.status(401).json({ error: "Session expired." });

    const { appState } = req.body;
    await pool.query(
      `INSERT INTO user_app_data (device_id, app_state, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (device_id) DO UPDATE SET app_state = $2, updated_at = NOW()`,
      [user.device_id, JSON.stringify(appState)]
    );
    return res.json({ ok: true });
  });

  // POST /api/auth/forgot-password
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    const { email } = req.body as { email: string };
    if (!email) return res.status(400).json({ error: "Email is required." });

    const { rows } = await pool.query(
      "SELECT * FROM users WHERE LOWER(email) = LOWER($1)",
      [email.trim()]
    );
    // Always say OK to prevent enumeration
    if (!rows.length) return res.json({ ok: true });

    const resetToken = generateToken();
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    await pool.query(
      "UPDATE users SET reset_token = $1, reset_expires = $2 WHERE device_id = $3",
      [resetToken, expires, rows[0].device_id]
    );

    try {
      await sendPasswordResetEmail(email, resetToken);
    } catch (err) {
      console.error("Email send error:", err);
      return res.status(503).json({
        error: "Password reset email could not be sent. Please try again later.",
      });
    }

    return res.json({ ok: true });
  });

  // PUT /api/auth/username  — update login username
  app.put("/api/auth/username", async (req: Request, res: Response) => {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "Not authenticated." });
    const currentUser = await getUserByToken(token);
    if (!currentUser) return res.status(401).json({ error: "Session expired." });

    const { username } = req.body as { username?: string };
    if (!username?.trim()) return res.status(400).json({ error: "Username is required." });
    const clean = username.trim().toLowerCase();
    if (!/^[a-zA-Z0-9_.]{3,30}$/.test(clean)) {
      return res.status(400).json({ error: "Username must be 3–30 chars: letters, numbers, _ and ." });
    }
    // Allow keeping same username
    if (clean !== currentUser.username) {
      const { rows } = await pool.query(
        "SELECT 1 FROM users WHERE LOWER(username) = $1 AND device_id != $2",
        [clean, currentUser.device_id]
      );
      if (rows.length) return res.status(409).json({ error: "Username already taken." });
    }
    await pool.query("UPDATE users SET username = $1 WHERE device_id = $2", [clean, currentUser.device_id]);
    const { rows: updated } = await pool.query("SELECT * FROM users WHERE device_id = $1", [currentUser.device_id]);
    return res.json({ ok: true, user: sanitizeUser(updated[0]) });
  });

  // POST /api/auth/reset-password
  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    const { code, newPassword } = req.body as { code: string; newPassword: string };
    if (!code || !newPassword) return res.status(400).json({ error: "Code and new password required." });
    if (newPassword.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });

    // Match first 8 chars of the token (what was shown in email)
    const { rows } = await pool.query(
      "SELECT * FROM users WHERE UPPER(LEFT(reset_token, 8)) = UPPER($1) AND reset_expires > NOW()",
      [code.trim()]
    );
    if (!rows.length) return res.status(400).json({ error: "Invalid or expired code." });

    const passwordHash = makePasswordHash(newPassword);
    const sessionToken = generateToken();
    await pool.query(
      "UPDATE users SET password_hash = $1, session_token = $2, reset_token = NULL, reset_expires = NULL WHERE device_id = $3",
      [passwordHash, sessionToken, rows[0].device_id]
    );

    return res.json({ ok: true, token: sessionToken, user: sanitizeUser(rows[0]) });
  });
}

function sanitizeUser(user: Record<string, any>) {
  const { password_hash, reset_token, reset_expires, session_token, ...safe } = user;
  return safe;
}
