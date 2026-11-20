---
name: Cloud sync for account data
description: Why account data (tasks/XP/streak) could vanish after redeploys/reinstalls, and how it's now kept in sync with the cloud.
---

All app state (tasks, XP, streak, daily records, achievements) is stored in AsyncStorage/localStorage on-device only by default. Logging into an account does NOT automatically back that data up unless something explicitly calls the sync endpoint.

**Why this matters:** a `user_app_data` table existed in Postgres (`device_id`, `app_state` JSONB) with a working `/api/auth/sync` and `/api/auth/me` (returns `appState`) on the backend, but nothing on the frontend ever called `syncToCloud` automatically, and the startup token-validation flow discarded the `appState` field from `/api/auth/me`. Result: the table had 0 rows in both dev and prod even with real accounts — any local storage wipe (reinstall, browser cache clear, new deploy origin) permanently lost that account's data with nothing to restore from.

**How to apply / verify in this app:** `context/AppContext.tsx`'s `AppProvider` reconciles with the cloud after local state and `AuthContext`'s session validation finish, and repeats reconciliation when the account token changes. Reset-all-data must bypass the normal 1.5s debounce and await the cloud write, because users commonly reset and log out immediately. Every other `saveState` call debounce-syncs to the cloud via `syncToCloud` when a token is present. Before assuming "sync" works for any account-based app, check whether the sync function is actually wired into state mutations, reset actions, and startup.
