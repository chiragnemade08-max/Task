---
name: Category system
description: 20-category system that replaced the old 3-subject system
---
Categories: physics|chemistry|mathematics|biology|english|computer_science|history|geography|homework|revision|mock_test|coaching|reading|exercise|sleep|meal|break_time|travel|meeting|other
- `Subject` type is a `= Category` alias for backward compat
- `getSubjectColor/Icon` are aliases for `getCategoryColor/Icon`
- `detectCategory()` replaces `detectSubject()` (kept as alias)
- AsyncStorage main key: `taskschedular_v3`

**Why:** Expanded from 3 to 20 to cover all student activity types with keyword detection.
**How to apply:** Use Category type for all new task fields; never use string literals for categories.
