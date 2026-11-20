---
name: Local date pattern
description: How to get today's date string without UTC timezone bugs (critical for IST +5:30)
---

**Rule:** Always compute date strings using `getFullYear()/getMonth()/getDate()` — never `toISOString().split("T")[0]`.

**Why:** `toISOString()` returns UTC time. In IST (UTC+5:30), times before 05:30 return yesterday's date, causing tasks to appear on wrong days.

**How to apply:** Use the `localDateStr(d: Date)` helper already in AppContext for any date-to-string conversion. All date comparison keys must use this pattern consistently.
