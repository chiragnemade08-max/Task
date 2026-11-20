import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "./AuthContext";
import { useApp } from "./AppContext";

const SOCIAL_KEY = "social_profile_v1";
const SOCIAL_FRIENDS_KEY = "social_friends_v1";
const SOCIAL_REQUESTS_KEY = "social_requests_v1";

export interface SocialProfile {
  deviceId: string;
  name: string;
  username: string;
  bio: string;
  avatarColor: string;
  friendCode: string;
  avatarUri?: string;
}

export interface SocialUser {
  device_id: string;
  name: string;
  username: string | null;
  bio: string;
  avatar_color: string;
  friend_code: string;
  xp: number;
  streak: number;
  study_hours: number;
  tasks_completed: number;
  longest_streak: number;
  study_stats?: {
    totalMinutes: number;
    completedTasks: number;
    dailyMinutes: Record<string, number>;
    subjectMinutes: Record<string, number>;
  };
}

export interface FriendRequest {
  id: string;
  from_device_id: string;
  name: string;
  username: string | null;
  avatar_color: string;
  friend_code: string;
  xp: number;
  streak: number;
}

interface SocialContextValue {
  profile: SocialProfile | null;
  friends: SocialUser[];
  requests: FriendRequest[];
  loading: boolean;
  syncing: boolean;
  updateProfile: (updates: Partial<Pick<SocialProfile, "name" | "username" | "bio" | "avatarColor" | "avatarUri">>) => Promise<{ error?: string }>;
  checkUsername: (username: string) => Promise<{ available: boolean; suggestion?: string }>;
  addFriendByCode: (code: string) => Promise<{ success: boolean; message: string }>;
  addFriendByUsername: (username: string) => Promise<{ success: boolean; message: string }>;
  acceptRequest: (requestId: string) => Promise<void>;
  rejectRequest: (requestId: string) => Promise<void>;
  removeFriend: (friendDeviceId: string) => Promise<void>;
  refreshFriends: () => Promise<void>;
  syncStats: (stats: {
    xp: number;
    streak: number;
    studyHours: number;
    tasksCompleted: number;
    longestStreak: number;
    studyStats: {
      totalMinutes: number;
      completedTasks: number;
      dailyMinutes: Record<string, number>;
      subjectMinutes: Record<string, number>;
    };
  }) => Promise<void>;
}

const SocialContext = createContext<SocialContextValue | null>(null);

function generateDeviceId(): string {
  return "dev_" + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function accountSocialKey(accountDeviceId: string): string {
  return `${SOCIAL_KEY}_${accountDeviceId}`;
}

function socialRequest(
  token: string | null | undefined,
  method: string,
  route: string,
  data?: unknown,
) {
  if (!token) throw new Error("An account session is required");
  return apiRequest(method, route, data, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

function emptyProfile(deviceId: string, user?: { name?: string; username?: string | null; bio?: string | null; avatar_color?: string | null; friend_code?: string }) : SocialProfile {
  return {
    deviceId,
    name: user?.name ?? "Student",
    username: user?.username ?? "",
    bio: user?.bio ?? "",
    avatarColor: user?.avatar_color ?? "#1A6BFF",
    friendCode: user?.friend_code ?? "",
  };
}

function profileFromServer(user: any, fallback: SocialProfile, deviceId: string): SocialProfile {
  return {
    ...fallback,
    deviceId,
    name: user?.name ?? fallback.name,
    username: user?.username ?? fallback.username,
    bio: user?.bio ?? fallback.bio,
    avatarColor: user?.avatar_color ?? fallback.avatarColor,
    friendCode: user?.friend_code ?? fallback.friendCode,
  };
}

export function SocialProvider({ children }: { children: React.ReactNode }) {
  const { user: authUser, token: authToken, authLoading, cloudAppState } = useAuth();
  const { state, loading: appLoading, restoreCloudStateIfEmpty } = useApp();
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [friends, setFriends] = useState<SocialUser[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const initGenerationRef = useRef(0);

  useEffect(() => {
    if (authLoading) return;
    const generation = ++initGenerationRef.current;
    setLoading(true);
    setProfile(null);
    setFriends([]);
    setRequests([]);
    void initProfile(authUser?.device_id, authToken, generation);
    return () => {
      if (initGenerationRef.current === generation) initGenerationRef.current++;
    };
  }, [authLoading, authUser?.device_id, authToken]);

  async function initProfile(
    accountDeviceId?: string,
    accountToken?: string | null,
    generation = initGenerationRef.current,
  ) {
    const isCurrent = () => generation === initGenerationRef.current;
    try {
      const accountKey = accountDeviceId ? accountSocialKey(accountDeviceId) : SOCIAL_KEY;
      let stored = await AsyncStorage.getItem(accountKey);
      // A global legacy profile belongs to an account only when its stable
      // identity already matches that account. Never borrow another login's
      // display name, username, or friend code.
      if (!stored && accountDeviceId) {
        const legacy = await AsyncStorage.getItem(SOCIAL_KEY);
        if (legacy) {
          const legacyProfile = JSON.parse(legacy) as SocialProfile;
          if (legacyProfile.deviceId === accountDeviceId) {
            stored = legacy;
            await AsyncStorage.setItem(accountKey, legacy);
          }
        }
      }

      if (!isCurrent()) return;
      let p: SocialProfile;
      if (stored) {
        p = JSON.parse(stored) as SocialProfile;
        if (accountDeviceId && p.deviceId !== accountDeviceId) {
          const legacyProfile = p;
          p = emptyProfile(accountDeviceId, authUser ?? undefined);
          if (accountToken && legacyProfile.deviceId.startsWith("dev_")) {
            try {
              const migrateResponse = await socialRequest(
                accountToken,
                "POST",
                "/api/social/users/migrate",
                { legacyDeviceId: legacyProfile.deviceId, accountDeviceId },
              );
              const data = await migrateResponse.json();
              if (!isCurrent()) return;
              if (data.appState && typeof data.appState === "object") {
                await restoreCloudStateIfEmpty(data.appState);
              }
              p = profileFromServer(
                data.user,
                data.migrated ? legacyProfile : p,
                accountDeviceId,
              );
            } catch {}
          }
        } else if (accountDeviceId) {
          p = { ...p, deviceId: accountDeviceId };
        }
      } else if (accountDeviceId) {
        p = emptyProfile(accountDeviceId, authUser ?? undefined);
        if (accountToken) {
          try {
            const migrateResponse = await socialRequest(
              accountToken,
              "POST",
              "/api/social/users/migrate",
              { accountDeviceId },
            );
            const data = await migrateResponse.json();
            if (!isCurrent()) return;
            if (data.appState && typeof data.appState === "object") {
              await restoreCloudStateIfEmpty(data.appState);
            }
            p = profileFromServer(data.user, p, accountDeviceId);
          } catch {}
        }
      } else {
        p = emptyProfile(generateDeviceId());
      }

      if (!isCurrent()) return;
      setProfile(p);
      await AsyncStorage.setItem(accountKey, JSON.stringify(p));
      const [cachedFriends, cachedRequests] = accountDeviceId
        ? await Promise.all([
            AsyncStorage.getItem(`${SOCIAL_FRIENDS_KEY}_${accountDeviceId}`),
            AsyncStorage.getItem(`${SOCIAL_REQUESTS_KEY}_${accountDeviceId}`),
          ])
        : [null, null];
      if (!isCurrent()) return;
      setFriends(cachedFriends ? JSON.parse(cachedFriends) : []);
      setRequests(cachedRequests ? JSON.parse(cachedRequests) : []);
      setLoading(false);

      if (!accountDeviceId || !accountToken) return;
      try {
        const res = await socialRequest(accountToken, "POST", "/api/social/users/register", {
          deviceId: accountDeviceId,
          name: p.name,
          username: p.username || undefined,
          bio: p.bio,
          avatarColor: p.avatarColor,
        });
        const data = await res.json();
        if (!isCurrent()) return;
        const updated = profileFromServer(data.user, p, accountDeviceId);
        setProfile(updated);
        await AsyncStorage.setItem(accountKey, JSON.stringify(updated));
      } catch {}
      await Promise.all([
        fetchFriends(accountDeviceId, accountToken, generation),
        fetchRequests(accountDeviceId, accountToken, generation),
      ]);
    } catch (err) {
      console.error("SocialContext init error:", err);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }

  async function fetchFriends(
    deviceId: string,
    token: string | null = authToken,
    generation = initGenerationRef.current,
  ) {
    if (!token) return;
    try {
      const res = await socialRequest(token, "GET", `/api/social/friends/${deviceId}`);
      const data = await res.json();
      if (generation !== initGenerationRef.current) return;
      setFriends(data);
      await AsyncStorage.setItem(`${SOCIAL_FRIENDS_KEY}_${deviceId}`, JSON.stringify(data));
    } catch {}
  }

  async function fetchRequests(
    deviceId: string,
    token: string | null = authToken,
    generation = initGenerationRef.current,
  ) {
    if (!token) return;
    try {
      const res = await socialRequest(token, "GET", `/api/social/friends/requests/${deviceId}`);
      const data = await res.json();
      if (generation !== initGenerationRef.current) return;
      setRequests(data);
      await AsyncStorage.setItem(`${SOCIAL_REQUESTS_KEY}_${deviceId}`, JSON.stringify(data));
    } catch {}
  }

  const updateProfile = useCallback(async (updates: Partial<Pick<SocialProfile, "name" | "username" | "bio" | "avatarColor" | "avatarUri">>) => {
    if (!profile) return { error: "No profile" };
    if (authUser && profile.deviceId !== authUser.device_id) {
      return { error: "The active profile does not match your signed-in account." };
    }
    const updated = { ...profile, ...updates };
    if (authToken && authUser) {
      try {
        await socialRequest(authToken, "POST", "/api/social/users/register", {
          deviceId: profile.deviceId,
          name: updated.name,
          username: updated.username || undefined,
          bio: updated.bio,
          avatarColor: updated.avatarColor,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (/username already taken|unique/i.test(message)) {
          return { error: "Username already taken" };
        }
        return { error: "Network error. Your profile was not changed." };
      }
    }
    setProfile(updated);
    const storageKey = authUser
      ? accountSocialKey(authUser.device_id)
      : SOCIAL_KEY;
    await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
    if (authUser) {
      try {
        const legacy = await AsyncStorage.getItem(SOCIAL_KEY);
        if (legacy && (JSON.parse(legacy) as SocialProfile).deviceId === authUser.device_id) {
          await AsyncStorage.setItem(SOCIAL_KEY, JSON.stringify(updated));
        }
      } catch {}
    }
    return {};
  }, [profile, authUser, authToken]);

  const syncStats = useCallback(async (stats: {
    xp: number;
    streak: number;
    studyHours: number;
    tasksCompleted: number;
    longestStreak: number;
    studyStats: {
      totalMinutes: number;
      completedTasks: number;
      dailyMinutes: Record<string, number>;
      subjectMinutes: Record<string, number>;
    };
  }) => {
    if (
      !profile?.deviceId ||
      !authUser ||
      !authToken ||
      authLoading ||
      appLoading ||
      cloudAppState ||
      profile.deviceId !== authUser.device_id
    ) return;
    setSyncing(true);
    try {
      await socialRequest(authToken, "POST", "/api/social/users/stats", {
        deviceId: profile.deviceId,
        ...stats,
      });
    } catch {} finally {
      setSyncing(false);
    }
  }, [profile, authUser, authToken, authLoading, appLoading, cloudAppState]);

  // Keep friend progress current even when the user never opens Profile.
  useEffect(() => {
    if (
      !profile?.deviceId ||
      !authUser ||
      !authToken ||
      authLoading ||
      appLoading ||
      cloudAppState ||
      profile.deviceId !== authUser.device_id
    ) return;
    const completedTasks = state.tasks.filter((task) => task.status === "completed");
    const dailyMinutes: Record<string, number> = {};
    const subjectMinutes: Record<string, number> = {};
    for (const task of completedTasks) {
      dailyMinutes[task.date] = (dailyMinutes[task.date] || 0) + task.duration;
      subjectMinutes[task.subject] = (subjectMinutes[task.subject] || 0) + task.duration;
    }
    const totalMinutes = completedTasks.reduce((sum, task) => sum + task.duration, 0);
    syncStats({
      xp: state.xp,
      streak: state.streak,
      studyHours: Math.round((totalMinutes / 60) * 10) / 10,
      tasksCompleted: completedTasks.length,
      longestStreak: state.streak,
      studyStats: {
        totalMinutes,
        completedTasks: completedTasks.length,
        dailyMinutes,
        subjectMinutes,
      },
    });
  }, [profile?.deviceId, state.tasks, state.xp, state.streak, syncStats, authUser, authToken, authLoading, appLoading, cloudAppState]);

  const checkUsername = useCallback(async (username: string): Promise<{ available: boolean; suggestion?: string }> => {
    if (!profile?.deviceId || !authUser || !authToken || profile.deviceId !== authUser.device_id) {
      return { available: true };
    }
    try {
      const res = await socialRequest(
        authToken,
        "GET",
        `/api/social/check/username/${encodeURIComponent(username)}?deviceId=${encodeURIComponent(profile.deviceId)}`,
      );
      return await res.json();
    } catch {}
    return { available: true };
  }, [profile, authUser, authToken]);

  const addFriendByCode = useCallback(async (code: string): Promise<{ success: boolean; message: string }> => {
    if (!profile) return { success: false, message: "No profile" };
    if (!authUser || !authToken || profile.deviceId !== authUser.device_id) {
      return { success: false, message: "Sign in to manage your friends." };
    }
    try {
      const findRes = await apiRequest("GET", `/api/social/find/code/${code.toUpperCase()}`);
      const target: SocialUser = await findRes.json();
      if (target.device_id === profile.deviceId) return { success: false, message: "That's your own friend code!" };
      const res = await socialRequest(authToken, "POST", "/api/social/friends/request", {
        fromDeviceId: profile.deviceId,
        toDeviceId: target.device_id,
      });
      const data = await res.json();
      if (data.status === "accepted") {
        await fetchFriends(profile.deviceId, authToken);
        return { success: true, message: `You and ${target.name} are now friends!` };
      }
      return { success: true, message: `Friend request sent to ${target.name}` };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("404:")) {
        return { success: false, message: "No user found with that friend code" };
      }
      return { success: false, message: "Network error. Try again." };
    }
  }, [profile, authUser, authToken]);

  const addFriendByUsername = useCallback(async (username: string): Promise<{ success: boolean; message: string }> => {
    if (!profile) return { success: false, message: "No profile" };
    if (!authUser || !authToken || profile.deviceId !== authUser.device_id) {
      return { success: false, message: "Sign in to manage your friends." };
    }
    try {
      const findRes = await apiRequest("GET", `/api/social/find/username/${encodeURIComponent(username.trim().toLowerCase())}`);
      const target: SocialUser = await findRes.json();
      if (target.device_id === profile.deviceId) return { success: false, message: "That's your own profile!" };
      const res = await socialRequest(authToken, "POST", "/api/social/friends/request", {
        fromDeviceId: profile.deviceId,
        toDeviceId: target.device_id,
      });
      const data = await res.json();
      if (data.status === "accepted") {
        await fetchFriends(profile.deviceId, authToken);
        return { success: true, message: `You and ${target.name} are now friends!` };
      }
      return { success: true, message: `Friend request sent to ${target.name}` };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("404:")) {
        return { success: false, message: "No user found with that username" };
      }
      return { success: false, message: "Network error. Try again." };
    }
  }, [profile, authUser, authToken]);

  const acceptRequest = useCallback(async (requestId: string) => {
    if (!profile || !authUser || !authToken || profile.deviceId !== authUser.device_id) return;
    try {
      await socialRequest(authToken, "PUT", `/api/social/friends/requests/${requestId}/accept`, { deviceId: profile.deviceId });
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      await fetchFriends(profile.deviceId, authToken);
    } catch {}
  }, [profile, authUser, authToken]);

  const rejectRequest = useCallback(async (requestId: string) => {
    if (!profile || !authUser || !authToken || profile.deviceId !== authUser.device_id) return;
    try {
      await socialRequest(authToken, "PUT", `/api/social/friends/requests/${requestId}/reject`, {});
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch {}
  }, [profile, authUser, authToken]);

  const removeFriend = useCallback(async (friendDeviceId: string) => {
    if (!profile || !authUser || !authToken || profile.deviceId !== authUser.device_id) return;
    try {
      await socialRequest(authToken, "DELETE", `/api/social/friends/${profile.deviceId}/${friendDeviceId}`);
      setFriends((prev) => prev.filter((f) => f.device_id !== friendDeviceId));
    } catch {}
  }, [profile, authUser, authToken]);

  const refreshFriends = useCallback(async () => {
    if (!profile || !authUser || !authToken || profile.deviceId !== authUser.device_id) return;
    const generation = initGenerationRef.current;
    await fetchFriends(profile.deviceId, authToken, generation);
    await fetchRequests(profile.deviceId, authToken, generation);
  }, [profile, authUser, authToken]);

  const value = useMemo(() => ({
    profile,
    friends,
    requests,
    loading,
    syncing,
    updateProfile,
    checkUsername,
    addFriendByCode,
    addFriendByUsername,
    acceptRequest,
    rejectRequest,
    removeFriend,
    refreshFriends,
    syncStats,
  }), [profile, friends, requests, loading, syncing, updateProfile, checkUsername, addFriendByCode, addFriendByUsername, acceptRequest, rejectRequest, removeFriend, refreshFriends, syncStats]);

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial() {
  const ctx = useContext(SocialContext);
  if (!ctx) throw new Error("useSocial must be used inside SocialProvider");
  return ctx;
}
