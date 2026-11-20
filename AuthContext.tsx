import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";
import type { AppState } from "./AppContext";

const AUTH_KEY = "taskschedular_auth_v1";
const PENDING_SYNC_KEY = "taskschedular_pending_cloud_sync_v1";
const API_TIMEOUT_MS = 5000;

function pendingSyncKey(deviceId: string): string {
  return `${PENDING_SYNC_KEY}_${deviceId}`;
}

export interface AuthUser {
  device_id: string;
  name: string;
  username: string | null;
  email: string | null;
  friend_code: string;
  avatar_color: string | null;
  avatar_uri: string | null;
  bio: string | null;
  xp: number;
  streak: number;
  created_at?: string;
}

interface StoredAuth {
  token: string;
  user: AuthUser;
}

interface PendingSync {
  deviceId: string;
  appState: AppState;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  authLoading: boolean;
  isOnline: boolean;
  cloudAppState: AppState | null;
  clearCloudAppState: () => void;
  login: (identifier: string, password: string) => Promise<{ error?: string; appState?: AppState | null }>;
  register: (opts: { email?: string; username?: string; password: string; deviceId?: string }) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<{ error?: string }>;
  resetPassword: (code: string, newPassword: string) => Promise<{ error?: string }>;
  syncToCloud: (appState: AppState) => Promise<void>;
  updateUsername: (newUsername: string) => Promise<{ error?: string }>;
  setUser: (user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function apiBase(): string {
  return getApiUrl();
}

async function apiFetch(path: string, opts?: RequestInit): Promise<Response> {
  const base = apiBase().replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(`${base}${path}`, {
      ...opts,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [cloudAppState, setCloudAppState] = useState<AppState | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  const clearCloudAppState = useCallback(() => setCloudAppState(null), []);

  // Load persisted session on mount
  useEffect(() => {
    (async () => {
      let cachedSession: StoredAuth | null = null;
      try {
        const raw = await AsyncStorage.getItem(AUTH_KEY);
        if (raw) {
          cachedSession = JSON.parse(raw) as StoredAuth;
          // Hydrate from local storage first so a temporary network outage
          // does not lock the user out of their locally saved study data.
          setUserState(cachedSession.user);
          setToken(cachedSession.token);

          try {
            const res = await apiFetch("/api/auth/me", {
              headers: { Authorization: `Bearer ${cachedSession.token}` },
            });
            if (res.ok) {
              const data = await res.json();
              setIsOnline(true);
              setUserState(data.user);
              if (data.appState) setCloudAppState(data.appState);
              await AsyncStorage.setItem(AUTH_KEY, JSON.stringify({
                token: cachedSession.token,
                user: data.user,
              }));
            } else if (res.status === 401 || res.status === 403) {
              // The server explicitly rejected the session. A network error
              // must not take this branch.
              setUserState(null);
              setToken(null);
              await AsyncStorage.removeItem(AUTH_KEY);
            } else {
              setIsOnline(false);
            }
          } catch {
            setIsOnline(false);
          }
        }
      } catch {
        setIsOnline(false);
      }
      setAuthLoading(false);
    })();
  }, []);

  const flushPendingSync = useCallback(async (activeToken: string, deviceId: string) => {
    try {
      const storageKey = pendingSyncKey(deviceId);
      const raw = await AsyncStorage.getItem(storageKey);
      if (!raw) return;
      const pending = JSON.parse(raw) as PendingSync;
      if (pending.deviceId !== deviceId) return;

      const res = await apiFetch("/api/auth/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${activeToken}` },
        body: JSON.stringify({ appState: pending.appState }),
      });
      if (!res.ok) return;
      await AsyncStorage.removeItem(storageKey);
      setIsOnline(true);
    } catch {
      setIsOnline(false);
    }
  }, []);

  // Retry queued local changes when the server becomes reachable again.
  useEffect(() => {
    if (!token || !user?.device_id) return;
    const deviceId = user.device_id;
    const checkConnection = async () => {
      try {
        const res = await apiFetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setIsOnline(true);
          await flushPendingSync(token, deviceId);
        }
      } catch {
        setIsOnline(false);
      }
    };
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, [token, user?.device_id, flushPendingSync]);

  const persistAuth = async (t: string, u: AuthUser) => {
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify({ token: t, user: u }));
  };

  const login = useCallback(async (
    identifier: string,
    password: string
  ): Promise<{ error?: string; appState?: AppState | null }> => {
    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || "Login failed." };
      setIsOnline(true);
      setUserState(data.user);
      setToken(data.token);
      setCloudAppState(data.appState ?? null);
      await persistAuth(data.token, data.user);
      return { appState: data.appState ?? null };
    } catch {
      return { error: "Network error. Check your connection." };
    }
  }, []);

  const register = useCallback(async (opts: {
    email?: string; username?: string; password: string; deviceId?: string;
  }): Promise<{ error?: string }> => {
    try {
      // Link a newly created account to the existing local social profile so
      // signup does not create a second friend identity.
      let deviceId = opts.deviceId;
      if (!deviceId) {
        const socialRaw = await AsyncStorage.getItem("social_profile_v1");
        if (socialRaw) {
          deviceId = (JSON.parse(socialRaw) as { deviceId?: string }).deviceId;
        }
      }
      const res = await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ ...opts, deviceId }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || "Registration failed." };
      setIsOnline(true);
      setUserState(data.user);
      setToken(data.token);
      setCloudAppState(null);
      await persistAuth(data.token, data.user);
      return {};
    } catch {
      return { error: "Network error. Check your connection." };
    }
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      apiFetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    setUserState(null);
    setToken(null);
    setCloudAppState(null);
    await AsyncStorage.removeItem(AUTH_KEY);
  }, [token]);

  const forgotPassword = useCallback(async (email: string): Promise<{ error?: string }> => {
    try {
      const res = await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error };
      return {};
    } catch {
      return { error: "Network error." };
    }
  }, []);

  const resetPassword = useCallback(async (
    code: string,
    newPassword: string
  ): Promise<{ error?: string }> => {
    try {
      const res = await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ code, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error };
      if (data.token && data.user) {
        setUserState(data.user);
        setToken(data.token);
        setCloudAppState(null);
        await persistAuth(data.token, data.user);
      }
      return {};
    } catch {
      return { error: "Network error." };
    }
  }, []);

  const syncToCloud = useCallback(async (appState: AppState): Promise<void> => {
    if (!token || !user?.device_id) return;
    const deviceId = user.device_id;
    const storageKey = pendingSyncKey(deviceId);
    try {
      const res = await apiFetch("/api/auth/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ appState }),
      });
      if (!res.ok) throw new Error(`Cloud sync failed (${res.status})`);
      setIsOnline(true);
      await AsyncStorage.removeItem(storageKey);
    } catch {
      // Local state remains authoritative while offline. Keep the newest
      // version so it can be uploaded after connectivity returns.
      await AsyncStorage.setItem(storageKey, JSON.stringify({ deviceId, appState }));
      setIsOnline(false);
    }
  }, [token, user?.device_id]);

  const updateUsername = useCallback(async (newUsername: string): Promise<{ error?: string }> => {
    if (!token) return { error: "Not logged in." };
    try {
      const res = await apiFetch("/api/auth/username", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username: newUsername }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || "Update failed." };
      const updatedUser: AuthUser = { ...(user!), username: newUsername.trim().toLowerCase() };
      setUserState(updatedUser);
      await persistAuth(token, updatedUser);
      return {};
    } catch {
      return { error: "Network error." };
    }
  }, [token, user]);

  const setUser = useCallback((u: AuthUser) => {
    setUserState(u);
  }, []);

  const value = useMemo(() => ({
    user,
    token,
    authLoading,
    isOnline,
    cloudAppState,
    clearCloudAppState,
    login,
    register,
    logout,
    forgotPassword,
    resetPassword,
    syncToCloud,
    updateUsername,
    setUser,
  }), [user, token, authLoading, isOnline, cloudAppState, clearCloudAppState, login, register, logout, forgotPassword, resetPassword, syncToCloud, updateUsername, setUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
