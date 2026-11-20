---
name: Auth architecture
description: How authentication is implemented in this Expo + Express project
---
- Uses Node.js built-in `crypto.pbkdf2` (NOT bcrypt) — no native module needed for Expo Go compat
- Session tokens: 64-char random hex stored in `users` table, sent as Bearer token
- Password reset: 8-char code (first 8 of 64-char hex) sent via nodemailer/Gmail
- Token stored client-side in AsyncStorage key `taskschedular_auth_v1`
- Cloud sync table: `user_app_data (device_id TEXT PK, app_state JSONB, updated_at TIMESTAMPTZ)`
- `ALTER TABLE` migrations run at startup inside `initAuthDB()`
- Env secrets: `SESSION_SECRET`, `SENDER_EMAIL`, `SENDER_APP_PASSWORD`

**Why:** bcrypt requires native binaries incompatible with Expo Go; PBKDF2 is pure Node crypto.
**How to apply:** Always use `crypto.pbkdf2` for any new password hashing in this project.
