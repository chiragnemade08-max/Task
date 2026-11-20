---
name: Expo package quirks
description: Known compatibility issues and workarounds in this Expo project
---

- **expo-notifications trigger:** Must cast trigger to `as any` — `{ seconds: N, repeats: false } as any`
- **UUID generation:** Do NOT use `uuid` package (crashes native). Use `Date.now().toString(36) + Math.random().toString(36).substr(2,9)` or prefix with a string (`"dev_"`) to avoid collisions.
- **expo-clipboard:** Not in the default scaffold — must install separately with `npm install expo-clipboard`.
- **Notification guards:** All `Notifications.*` calls must be guarded with null checks due to expo-notifications v55 mismatch.
- **AsyncStorage keys:** `taskschedular_v3` (main app state), `social_profile_v1` (social context). Never change these without migration.
