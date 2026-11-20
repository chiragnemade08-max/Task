---
name: Offline-first behavior
description: Requirements for keeping the study app usable during network outages.
---

The local session and app state are authoritative for offline use. A failed server check must not remove a cached session, and local study changes must remain usable without authentication requests completing.

**Why:** Users need to open and work on their timetable while traveling or temporarily disconnected; treating a network failure as an invalid login locks them out of data already stored on the device.

Cloud sync failures must retain the newest app state in a persisted pending queue and retry when the server becomes reachable. Network calls should have finite timeouts so offline social screens do not wait indefinitely.

**How to apply:** Keep cloud sync asynchronous to local saves, preserve cached social/profile data, and treat explicit authentication rejection differently from transport failure.