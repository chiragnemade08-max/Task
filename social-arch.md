---
name: Social feature architecture
description: How the Profile/Friends social layer is built — device ID identity, DB schema, context structure
---

Device ID is generated on first launch (stored in AsyncStorage key `social_profile_v1`), no user auth required. Each device registers with the PostgreSQL backend to get a 6-char alphanumeric friend code.

**DB tables:** `users`, `friend_requests`, `friendships` — all keyed by `device_id` (TEXT), not UUID.

**Backend routes prefix:** `/api/social/...` (registered in `server/social.ts`, imported in `server/routes.ts`)

**Frontend context:** `SocialProvider` wraps at root layout inside `AppProvider`. `useSocial()` hook exposes profile, friends, requests.

**Why:** No login reduces friction for students; friend code system enables discovery without sharing private info.

**How to apply:** When adding social features, always use `deviceId` as the identifier. Stats are synced to backend via `syncStats()` called from Profile screen's useEffect watching `state.xp` and `state.streak`.
