# Taskschedular AI

A comprehensive mobile productivity app for students built with Expo (React Native).

## Architecture

- **Framework**: Expo with Expo Router (file-based routing)
- **Backend**: Express.js (port 5000) - serves landing page and API
- **Frontend**: Expo Go compatible, runs on port 8081
- **Storage**: AsyncStorage for all persistent data (tasks, XP, rank, history)
- **State Management**: React Context (AppContext)

## App Structure

### Tabs
- **Home** (`app/(tabs)/index.tsx`) - Today's timetable, current/upcoming activity, stats
- **History** (`app/(tabs)/history.tsx`) - Past tasks with date/status filters, metrics
- **Upcoming** (`app/(tabs)/upcoming.tsx`) - Future timetable planner (14 days ahead)
- **Analysis** (`app/(tabs)/analysis.tsx`) - Subject-wise study hours, weekly bar chart, heatmap
- **Rank** (`app/(tabs)/rank.tsx`) - XP & rank system, Records, Achievements sub-tabs

### Screens
- **Create Timetable** (`app/create-timetable.tsx`) - Paste schedule parser + manual entry
- **Settings** (`app/settings.tsx`) - Dark/light mode, XP info, reset button
- **Daily Report** (`app/daily-report.tsx`) - End-of-day summary

### Core Files
- `context/AppContext.tsx` - Main state, AsyncStorage persistence, XP logic, notifications
- `constants/colors.ts` - Full light/dark color palette

## Features

1. Smart schedule parser - paste timetable text and auto-detect tasks
2. Manual task entry with date selector
3. Complete/skip tasks with XP rewards (+5/−5, +50 perfect day)
4. Rank system: Beginner → Grinder → Warrior → Master → Legend
5. Subject detection: Physics, Chemistry, Mathematics auto-tagged
6. Push notifications 5 min before each task (expo-notifications)
7. Study heatmap (84 days) + weekly bar charts
8. Achievements & Records tracking
9. Full light/dark mode
10. Streak tracking

## Running

- Start Backend: `npm run server:dev` (port 5000)
- Start Frontend: `npm run expo:dev` (port 8081)
