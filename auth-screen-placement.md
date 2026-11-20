---
name: Auth screen placement
description: Why AuthScreen lives in components/ not app/
---
`components/AuthScreen.tsx` — must NOT be in `app/` directory.

**Why:** Expo Router treats every file in `app/` as a route. Putting AuthScreen in `app/auth.tsx` AND importing it as a component in `_layout.tsx` creates a circular/conflicting route registration. Moving it to `components/` avoids this while keeping it importable.
**How to apply:** Any full-screen component imported directly (not navigated to) must live in `components/`, not `app/`.
