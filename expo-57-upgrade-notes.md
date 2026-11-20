---
name: Expo SDK 57 upgrade notes
description: App config and Expo Asset changes verified during the SDK 54 to 57 upgrade.
---

For this app on Expo SDK 57, the config schema rejects `newArchEnabled` and the top-level `splash` field. Configure the splash image and colors through the `expo-splash-screen` config plugin instead. The installed `expo-asset` already contains the HTTPS development-server scheme handling previously carried by the old patch, so that patch is obsolete.

**Why:** The upgrade's Expo Doctor check caught the removed config fields, and the current `expo-asset` implementation already included the old patch's behavior.

**How to apply:** After a future Expo SDK upgrade, run Expo Doctor and inspect the installed package before retaining or updating old package patches.
