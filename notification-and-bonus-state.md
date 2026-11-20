---
name: Notification and bonus state
description: Cross-device behavior for local notifications and one-time daily rewards.
---

Notification IDs are installation-local, not portable app data. When tasks are restored from cloud state, cancel the device's scheduled notifications, clear all serialized IDs, and recreate reminders for pending future tasks.

**Why:** Reusing an ID from another device can prevent a restored task reminder from being scheduled correctly, while clearing only missing IDs leaves stale device state behind.

One-time daily rewards need a persistent set of awarded calendar dates separate from daily progress records. Resetting today's progress must not remove the award marker; only a full app reset should clear it.

**Why:** Users can reset and redo today's tasks, so deriving the reward solely from current task completion or a deletable daily record can award the same bonus repeatedly.

**How to apply:** Keep these markers in the cloud-synced app state and preserve them when loading older state that does not have the new field.