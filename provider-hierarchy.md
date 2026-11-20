---
name: Provider hierarchy
description: Correct React context nesting order in app/_layout.tsx
---
QueryClientProvider > AuthProvider > AppProvider > SocialProvider > GestureHandlerRootView > KeyboardProvider > AuthGate

AuthGate renders AuthScreen (or children) based on auth state.
AuthScreen is imported from `components/AuthScreen.tsx` — NOT from `app/auth.tsx`.

**Why:** AuthGate needs useAuth() so it must be inside AuthProvider; AppProvider & SocialProvider need to be inside AuthProvider so they can call auth methods.
**How to apply:** Wrap any new provider inside SocialProvider (innermost before GestureHandlerRootView).
