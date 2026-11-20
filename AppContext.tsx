import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { useAuth } from "./AuthContext";

let Notifications: typeof import("expo-notifications") | null = null;
if (Platform.OS !== "web") {
  try {
    Notifications = require("expo-notifications");
  } catch {
    Notifications = null;
  }
}

export type TaskStatus = "pending" | "completed" | "skipped";
export type Category =
  | "physics" | "chemistry" | "mathematics" | "biology"
  | "english" | "computer_science" | "history" | "geography"
  | "homework" | "revision" | "mock_test" | "coaching"
  | "reading" | "exercise" | "sleep" | "meal"
  | "break_time" | "travel" | "meeting" | "other";
// Backward-compat alias
export type Subject = Category;

export interface Task {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  duration: number;
  date: string;
  status: TaskStatus;
  subject: Subject;
  notificationId?: string;
  notes?: string;
}

export interface DailyRecord {
  date: string;
  tasksCompleted: number;
  tasksSkipped: number;
  studyMinutes: number;
  xpEarned: number;
  isPerfectDay: boolean;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  difficulty: "easy" | "medium" | "hard" | "legendary";
  unlocked: boolean;
  unlockedAt?: string;
}

export interface AppState {
  tasks: Task[];
  xp: number;
  streak: number;
  lastActiveDate: string;
  dailyRecords: DailyRecord[];
  perfectDayBonusDates: string[];
  achievements: Achievement[];
  theme: "light" | "dark" | "system";
}

interface AppContextValue {
  state: AppState;
  loading: boolean;
  addTasks: (tasks: Omit<Task, "id" | "status" | "notificationId">[]) => Promise<void>;
  completeTask: (id: string) => Promise<void>;
  skipTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  updateTaskTime: (id: string, startTime: string, endTime: string) => Promise<void>;
  updateTask: (id: string, title: string, startTime: string, endTime: string) => Promise<void>;
  resetApp: () => Promise<void>;
  resetTodayProgress: () => Promise<void>;
  resetTodayTimetable: () => Promise<void>;
  resetAllNotifications: () => Promise<void>;
  resetPreferences: () => Promise<void>;
  loadCloudState: (cloudState: AppState) => Promise<void>;
  restoreCloudStateIfEmpty: (cloudState: AppState) => Promise<void>;
  setTheme: (theme: "light" | "dark" | "system") => Promise<void>;
  getTodayTasks: () => Task[];
  getTasksForDate: (date: string) => Task[];
  getXPToNextRank: () => { current: number; needed: number; rankName: string; nextRank: string };
  getCurrentRank: () => string;
}

const AppContext = createContext<AppContextValue | null>(null);

const STORAGE_KEY = "taskschedular_v3";
const SOCIAL_PROFILE_KEY = "social_profile_v1";

function accountStorageKey(deviceId: string): string {
  return `${STORAGE_KEY}_account_${deviceId}`;
}

async function claimLegacyState(
  deviceId: string,
  isCurrent: () => boolean,
): Promise<string | null> {
  try {
    const legacyState = await AsyncStorage.getItem(STORAGE_KEY);
    if (!legacyState || !isCurrent()) return null;
    const rawProfile = await AsyncStorage.getItem(SOCIAL_PROFILE_KEY);
    let legacyDeviceId: string | undefined;
    if (rawProfile) {
      try {
        legacyDeviceId = (JSON.parse(rawProfile) as { deviceId?: string }).deviceId;
      } catch {}
    }
    const destination = legacyDeviceId
      ? accountStorageKey(legacyDeviceId)
      : `${STORAGE_KEY}_unclaimed_legacy`;
    const existing = await AsyncStorage.getItem(destination);
    if (!isCurrent()) return null;
    if (!existing) await AsyncStorage.setItem(destination, legacyState);
    if (!isCurrent()) return null;
    await AsyncStorage.removeItem(STORAGE_KEY);
    return legacyDeviceId === deviceId ? existing ?? legacyState : null;
  } catch {
    return null;
  }
}

const ALL_ACHIEVEMENTS: Achievement[] = [
  // Easy
  { id: "first_step", title: "First Step", description: "Complete your first task", icon: "footsteps-outline", difficulty: "easy", unlocked: false },
  { id: "early_bird", title: "Early Bird", description: "Complete a task before 7 AM", icon: "sunny-outline", difficulty: "easy", unlocked: false },
  { id: "night_owl", title: "Night Owl", description: "Complete a task after 10 PM", icon: "moon-outline", difficulty: "easy", unlocked: false },
  { id: "perfect_day", title: "Perfect Day", description: "Complete all tasks in a day", icon: "star-outline", difficulty: "easy", unlocked: false },
  { id: "first_xp", title: "XP Earned", description: "Earn your first 10 XP", icon: "flash-outline", difficulty: "easy", unlocked: false },
  { id: "three_streak", title: "On a Roll", description: "Maintain a 3-day streak", icon: "flame-outline", difficulty: "easy", unlocked: false },
  { id: "physics_start", title: "Physicist", description: "Complete 1 hour of Physics", icon: "nuclear-outline", difficulty: "easy", unlocked: false },
  { id: "chem_start", title: "Chemist", description: "Complete 1 hour of Chemistry", icon: "flask-outline", difficulty: "easy", unlocked: false },
  { id: "math_start", title: "Mathematician", description: "Complete 1 hour of Mathematics", icon: "calculator-outline", difficulty: "easy", unlocked: false },
  { id: "ten_tasks", title: "Task Taker", description: "Complete 10 tasks total", icon: "checkmark-circle-outline", difficulty: "easy", unlocked: false },

  // Medium
  { id: "five_streak", title: "Five Day Fire", description: "Maintain a 5-day streak", icon: "flame", difficulty: "medium", unlocked: false },
  { id: "week_streak", title: "Week Warrior", description: "Maintain a 7-day streak", icon: "calendar-outline", difficulty: "medium", unlocked: false },
  { id: "fifty_tasks", title: "Task Collector", description: "Complete 50 tasks total", icon: "list-outline", difficulty: "medium", unlocked: false },
  { id: "two_perfect", title: "Double Perfect", description: "2 perfect days in a row", icon: "star", difficulty: "medium", unlocked: false },
  { id: "grinder_rank", title: "Grinder", description: "Reach Grinder rank (200 XP)", icon: "trending-up-outline", difficulty: "medium", unlocked: false },
  { id: "warrior_rank", title: "Warrior", description: "Reach Warrior rank (500 XP)", icon: "shield-outline", difficulty: "medium", unlocked: false },
  { id: "triple_subject", title: "All-Rounder", description: "Study all 3 subjects in one day", icon: "school-outline", difficulty: "medium", unlocked: false },
  { id: "physics_5h", title: "Physics Pro", description: "Complete 5 hours of Physics", icon: "planet-outline", difficulty: "medium", unlocked: false },
  { id: "chem_5h", title: "Chemistry Pro", description: "Complete 5 hours of Chemistry", icon: "color-filter-outline", difficulty: "medium", unlocked: false },
  { id: "math_5h", title: "Math Pro", description: "Complete 5 hours of Mathematics", icon: "git-branch-outline", difficulty: "medium", unlocked: false },
  { id: "study_marathon", title: "Study Marathon", description: "Study 6 hours in one day", icon: "timer-outline", difficulty: "medium", unlocked: false },
  { id: "ten_streak", title: "Decade Streak", description: "Maintain a 10-day streak", icon: "ribbon-outline", difficulty: "medium", unlocked: false },
  { id: "morning_person", title: "Morning Person", description: "Complete 3 tasks before 9 AM", icon: "partly-sunny-outline", difficulty: "medium", unlocked: false },
  { id: "night_grinder", title: "Night Grinder", description: "Complete 3 tasks after 9 PM", icon: "telescope-outline", difficulty: "medium", unlocked: false },
  { id: "xp_500", title: "XP Collector", description: "Earn 500 XP total", icon: "diamond-outline", difficulty: "medium", unlocked: false },
  { id: "five_perfect", title: "5 Perfect Days", description: "Achieve 5 perfect days total", icon: "trophy-outline", difficulty: "medium", unlocked: false },
  { id: "hundred_tasks", title: "Task Master", description: "Complete 100 tasks total", icon: "medal-outline", difficulty: "medium", unlocked: false },
  { id: "physics_10h", title: "Physics Expert", description: "Complete 10 hours of Physics", icon: "flash", difficulty: "medium", unlocked: false },
  { id: "chem_10h", title: "Chemistry Expert", description: "Complete 10 hours of Chemistry", icon: "flask", difficulty: "medium", unlocked: false },
  { id: "math_10h", title: "Math Expert", description: "Complete 10 hours of Mathematics", icon: "calculator", difficulty: "medium", unlocked: false },
  { id: "twenty_streak", title: "3 Week Warrior", description: "Maintain a 21-day streak", icon: "infinite-outline", difficulty: "medium", unlocked: false },

  // Hard
  { id: "master_rank", title: "Master", description: "Reach Master rank (1000 XP)", icon: "crown-outline", difficulty: "hard", unlocked: false },
  { id: "ten_perfect", title: "10 Perfect Days", description: "Achieve 10 perfect days total", icon: "sparkles-outline", difficulty: "hard", unlocked: false },
  { id: "two_hundred_tasks", title: "Task Champion", description: "Complete 200 tasks total", icon: "trophy", difficulty: "hard", unlocked: false },
  { id: "xp_1000", title: "XP Warrior", description: "Earn 1000 XP total", icon: "star", difficulty: "hard", unlocked: false },
  { id: "thirty_streak", title: "Month Master", description: "Maintain a 30-day streak", icon: "calendar", difficulty: "hard", unlocked: false },
  { id: "physics_25h", title: "Physics Master", description: "Complete 25 hours of Physics", icon: "nuclear", difficulty: "hard", unlocked: false },
  { id: "chem_25h", title: "Chemistry Master", description: "Complete 25 hours of Chemistry", icon: "color-filter", difficulty: "hard", unlocked: false },
  { id: "math_25h", title: "Math Master", description: "Complete 25 hours of Mathematics", icon: "git-branch", difficulty: "hard", unlocked: false },
  { id: "study_50h", title: "Study Pro", description: "Complete 50 hours of study total", icon: "book", difficulty: "hard", unlocked: false },
  { id: "fifteen_perfect", title: "Perfection Seeker", description: "Achieve 15 perfect days total", icon: "diamond", difficulty: "hard", unlocked: false },
  { id: "three_hundred_tasks", title: "Task Legend", description: "Complete 300 tasks total", icon: "layers", difficulty: "hard", unlocked: false },
  { id: "study_marathon_8", title: "Iron Student", description: "Study 8 hours in one day", icon: "barbell-outline", difficulty: "hard", unlocked: false },
  { id: "xp_1500", title: "XP Master", description: "Earn 1500 XP total", icon: "medal", difficulty: "hard", unlocked: false },
  { id: "balanced_student", title: "Balanced Student", description: "5h+ each of Physics, Chemistry, Maths", icon: "scale-outline", difficulty: "hard", unlocked: false },
  { id: "consistency_king", title: "Consistency King", description: "45-day streak", icon: "shield", difficulty: "hard", unlocked: false },

  // Legendary
  { id: "legend_rank", title: "Legend", description: "Reach Legend rank (1500 XP)", icon: "flame", difficulty: "legendary", unlocked: false },
  { id: "physics_50h", title: "Physics Legend", description: "Complete 50 hours of Physics", icon: "nuclear", difficulty: "legendary", unlocked: false },
  { id: "chem_50h", title: "Chemistry Legend", description: "Complete 50 hours of Chemistry", icon: "flask", difficulty: "legendary", unlocked: false },
  { id: "math_50h", title: "Math Legend", description: "Complete 50 hours of Mathematics", icon: "calculator", difficulty: "legendary", unlocked: false },
  { id: "study_100h", title: "Scholar", description: "Complete 100 hours of study total", icon: "school", difficulty: "legendary", unlocked: false },
  { id: "five_hundred_tasks", title: "Task God", description: "Complete 500 tasks total", icon: "trophy", difficulty: "legendary", unlocked: false },
  { id: "sixty_streak", title: "2-Month Streak", description: "Maintain a 60-day streak", icon: "infinite", difficulty: "legendary", unlocked: false },
  { id: "hundred_perfect", title: "Absolute Perfectionist", description: "Achieve 50 perfect days total", icon: "sparkles", difficulty: "legendary", unlocked: false },
  { id: "xp_3000", title: "XP God", description: "Earn 3000 XP total", icon: "diamond", difficulty: "legendary", unlocked: false },
  { id: "study_200h", title: "Elite Scholar", description: "Complete 200 hours of study total", icon: "ribbon", difficulty: "legendary", unlocked: false },
];

const INITIAL_STATE: AppState = {
  tasks: [],
  xp: 0,
  streak: 0,
  lastActiveDate: "",
  dailyRecords: [],
  perfectDayBonusDates: [],
  achievements: ALL_ACHIEVEMENTS,
  theme: "system",
};

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

export function detectCategory(title: string): Category {
  const t = title.toLowerCase();
  // Sleep / rest (high priority — catches "sleep" before "break")
  if (/\bsleep\b|\bnap\b|\brest\b|bedtime/.test(t)) return "sleep";
  // Meals
  if (/breakfast|lunch|dinner|\bsnack\b|\beat\b|\bfood\b|\bmeal\b|tiffin/.test(t)) return "meal";
  // Exercise
  if (/\bgym\b|workout|exercise|\brun\b|\bjog\b|\bwalk\b|\bsport\b|\byoga\b|meditat|fitness/.test(t)) return "exercise";
  // Physics
  if (/physics|phys\b|optics|motion|mechanics|wave|circuit|electro|quantum|nuclear|thermo|kinetic|\bforce\b|\benergy\b|gravit|magneti/.test(t)) return "physics";
  // Chemistry
  if (/chem|organic|inorganic|periodic|bonding|reaction|titrat|equilibri|\bacid\b|\bbase\b|\bsalt\b|polymer|compound|\batom\b|molecule/.test(t)) return "chemistry";
  // Mathematics
  if (/math|trig|algebra|calculus|geometr|statistic|probab|differentiat|integrat|vector|matrix|sequence|series|\bfunction\b|equation|\blimit\b|\blog\b/.test(t)) return "mathematics";
  // Biology
  if (/bio\b|biology|\bcell\b|organism|genetic|evolut|ecolog|photosyn|respir|nervous|immune|\bdna\b|protein|mitosis|bacteria|virus/.test(t)) return "biology";
  // English / Literature
  if (/english|essay|grammar|literatur|poem|\bprose\b|story|comprehen|vocabul|writing|\bnovel\b|\bspeech\b/.test(t)) return "english";
  // Computer Science
  if (/comput|coding|program|algorithm|data struct|python|\bjava\b|\bc\+\+\b|debug|software|hardware|network|\bcode\b/.test(t)) return "computer_science";
  // Mock test / exam
  if (/mock|full test|practice test|jee|neet|\bboard\b|\bexam\b|\btest\b|\bquiz\b|\bpaper\b|\bmcq\b/.test(t)) return "mock_test";
  // Revision
  if (/revision|review|revisit|recap|revise/.test(t)) return "revision";
  // Homework / assignment
  if (/homework|assignment|worksheet|\bdpp\b|\bsheet\b|problem set/.test(t)) return "homework";
  // Coaching / class
  if (/coaching|tuition|\bclass\b|lecture|tutorial|institute|school|college/.test(t)) return "coaching";
  // Reading
  if (/\bread\b|reading|\bbook\b|\bnovel\b|textbook|chapter|\bnotes\b/.test(t)) return "reading";
  // Break / leisure
  if (/break|free time|leisure|relax|entertain|\bhobby\b|\bgame\b/.test(t)) return "break_time";
  // Travel
  if (/travel|commute|\bbus\b|\btrain\b|\bdrive\b|journey|\btrip\b|transit/.test(t)) return "travel";
  // Meeting
  if (/meeting|\bcall\b|discuss|seminar|webinar/.test(t)) return "meeting";
  // History / Geography (common Indian exam subjects)
  if (/history|histor/.test(t)) return "history";
  if (/geography|geograph/.test(t)) return "geography";
  return "other";
}
// Backward-compat alias
export function detectSubject(title: string): Subject { return detectCategory(title); }

// Older builds could accidentally save every manually-created task as
// Physics. Repair only records where the title clearly identifies another
// category; keep explicit categories and genuinely generic titles unchanged.
function normalizeTaskSubject(task: Task): Task {
  const detected = detectSubject(task.title);
  if (task.subject === "physics" && detected !== "physics" && detected !== "other") {
    return { ...task, subject: detected };
  }
  return { ...task, subject: task.subject || detected };
}

/** Returns YYYY-MM-DD in LOCAL time — toISOString() gives UTC which is wrong in non-UTC timezones */
export function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function setupNotifications(): Promise<boolean> {
  if (!Notifications) return false;
  try {
    // Android: create a high-importance channel for reminders
    if (Platform.OS === "android") {
      await (Notifications as any).setNotificationChannelAsync?.("task-reminders", {
        name: "Task Reminders",
        importance: 5, // HIGH
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#1A6BFF",
        sound: "default",
      });
    }

    // Configure notification presentation options
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    // Request permission
    const { status: existing } = await Notifications.getPermissionsAsync();
    let granted = existing === "granted";
    if (!granted) {
      const { status } = await Notifications.requestPermissionsAsync();
      granted = status === "granted";
    }
    return granted;
  } catch {
    return false;
  }
}

async function scheduleTaskNotification(task: Task): Promise<string | undefined> {
  if (!Notifications) return undefined;
  try {
    // Calculate fire time: task start minus 5 minutes
    const [h, m] = task.startTime.split(":").map(Number);
    const taskStart = new Date(task.date + "T00:00:00");
    taskStart.setHours(h, m, 0, 0);

    const fireTime = new Date(taskStart.getTime() - 5 * 60 * 1000);
    const secondsUntil = Math.round((fireTime.getTime() - Date.now()) / 1000);

    // Don't schedule if the reminder time has already passed
    if (secondsUntil <= 0) return undefined;

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Task Reminder",
        body: `${task.title} starts in 5 minutes`,
        sound: true,
        ...(Platform.OS === "android" ? { channelId: "task-reminders" } : {}),
        data: { taskId: task.id, date: task.date },
      },
      // A Date trigger avoids timer drift and remains accurate when the app
      // is backgrounded or the device sleeps.
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireTime,
      },
    });
    return id;
  } catch {
    return undefined;
  }
}

async function cancelNotification(notificationId?: string) {
  if (notificationId && Notifications) {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch {}
  }
}

// Notification IDs belong to one device installation. Cloud-restored tasks
// must not reuse IDs created by another installation.
async function rescheduleAllPendingNotifications(tasks: Task[]): Promise<Task[]> {
  if (Notifications) {
    try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch {}
  }
  const now = new Date();
  const updatedTasks = await Promise.all(
    tasks.map(async (task) => {
      const taskWithoutStaleNotificationId = { ...task, notificationId: undefined };
      if (task.status !== "pending") return taskWithoutStaleNotificationId;

      // Check if task is in the future
      const [h, m] = task.startTime.split(":").map(Number);
      const taskStart = new Date(task.date + "T00:00:00");
      taskStart.setHours(h, m, 0, 0);
      if (taskStart <= now) return taskWithoutStaleNotificationId; // Already passed, skip

      const notId = await scheduleTaskNotification(taskWithoutStaleNotificationId);
      return { ...taskWithoutStaleNotificationId, notificationId: notId };
    })
  );
  return updatedTasks;
}

function checkAchievements(s: AppState, context: { completedToday?: boolean; hour?: number }): Achievement[] {
  const totalCompleted = s.tasks.filter((t) => t.status === "completed").length;
  const totalStudyMins = s.tasks.filter((t) => t.status === "completed").reduce((a, t) => a + t.duration, 0);
  const physMins = s.tasks.filter((t) => t.status === "completed" && t.subject === "physics").reduce((a, t) => a + t.duration, 0);
  const chemMins = s.tasks.filter((t) => t.status === "completed" && t.subject === "chemistry").reduce((a, t) => a + t.duration, 0);
  const mathMins = s.tasks.filter((t) => t.status === "completed" && t.subject === "mathematics").reduce((a, t) => a + t.duration, 0);
  const perfectDays = s.dailyRecords.filter((r) => r.isPerfectDay).length;
  const hour = context.hour ?? new Date().getHours();

  const today = todayString();
  const todayTasks = s.tasks.filter((t) => t.date === today);
  const todayCompleted = todayTasks.filter((t) => t.status === "completed");
  const todaySubjects = new Set(todayCompleted.map((t) => t.subject));

  const allPerfect = todayTasks.length > 0 && todayTasks.every((t) => t.status === "completed");

  const todayStudyMins = todayCompleted.reduce((a, t) => a + t.duration, 0);

  return s.achievements.map((a) => {
    if (a.unlocked) return a;
    let shouldUnlock = false;

    switch (a.id) {
      case "first_step": shouldUnlock = totalCompleted >= 1; break;
      case "early_bird": shouldUnlock = hour < 7 && context.completedToday === true; break;
      case "night_owl": shouldUnlock = hour >= 22 && context.completedToday === true; break;
      case "perfect_day": shouldUnlock = allPerfect; break;
      case "first_xp": shouldUnlock = s.xp >= 10; break;
      case "three_streak": shouldUnlock = s.streak >= 3; break;
      case "five_streak": shouldUnlock = s.streak >= 5; break;
      case "week_streak": shouldUnlock = s.streak >= 7; break;
      case "ten_streak": shouldUnlock = s.streak >= 10; break;
      case "twenty_streak": shouldUnlock = s.streak >= 21; break;
      case "thirty_streak": shouldUnlock = s.streak >= 30; break;
      case "consistency_king": shouldUnlock = s.streak >= 45; break;
      case "sixty_streak": shouldUnlock = s.streak >= 60; break;
      case "ten_tasks": shouldUnlock = totalCompleted >= 10; break;
      case "fifty_tasks": shouldUnlock = totalCompleted >= 50; break;
      case "hundred_tasks": shouldUnlock = totalCompleted >= 100; break;
      case "two_hundred_tasks": shouldUnlock = totalCompleted >= 200; break;
      case "three_hundred_tasks": shouldUnlock = totalCompleted >= 300; break;
      case "five_hundred_tasks": shouldUnlock = totalCompleted >= 500; break;
      case "grinder_rank": shouldUnlock = s.xp >= 200; break;
      case "warrior_rank": shouldUnlock = s.xp >= 500; break;
      case "master_rank": shouldUnlock = s.xp >= 1000; break;
      case "legend_rank": shouldUnlock = s.xp >= 1500; break;
      case "xp_500": shouldUnlock = s.xp >= 500; break;
      case "xp_1000": shouldUnlock = s.xp >= 1000; break;
      case "xp_1500": shouldUnlock = s.xp >= 1500; break;
      case "xp_3000": shouldUnlock = s.xp >= 3000; break;
      case "two_perfect": shouldUnlock = perfectDays >= 2; break;
      case "five_perfect": shouldUnlock = perfectDays >= 5; break;
      case "ten_perfect": shouldUnlock = perfectDays >= 10; break;
      case "fifteen_perfect": shouldUnlock = perfectDays >= 15; break;
      case "hundred_perfect": shouldUnlock = perfectDays >= 50; break;
      case "physics_start": shouldUnlock = physMins >= 60; break;
      case "chem_start": shouldUnlock = chemMins >= 60; break;
      case "math_start": shouldUnlock = mathMins >= 60; break;
      case "physics_5h": shouldUnlock = physMins >= 300; break;
      case "chem_5h": shouldUnlock = chemMins >= 300; break;
      case "math_5h": shouldUnlock = mathMins >= 300; break;
      case "physics_10h": shouldUnlock = physMins >= 600; break;
      case "chem_10h": shouldUnlock = chemMins >= 600; break;
      case "math_10h": shouldUnlock = mathMins >= 600; break;
      case "physics_25h": shouldUnlock = physMins >= 1500; break;
      case "chem_25h": shouldUnlock = chemMins >= 1500; break;
      case "math_25h": shouldUnlock = mathMins >= 1500; break;
      case "physics_50h": shouldUnlock = physMins >= 3000; break;
      case "chem_50h": shouldUnlock = chemMins >= 3000; break;
      case "math_50h": shouldUnlock = mathMins >= 3000; break;
      case "study_50h": shouldUnlock = totalStudyMins >= 3000; break;
      case "study_100h": shouldUnlock = totalStudyMins >= 6000; break;
      case "study_200h": shouldUnlock = totalStudyMins >= 12000; break;
      case "study_marathon": shouldUnlock = todayStudyMins >= 360; break;
      case "study_marathon_8": shouldUnlock = todayStudyMins >= 480; break;
      case "triple_subject":
        shouldUnlock = todaySubjects.has("physics") && todaySubjects.has("chemistry") && todaySubjects.has("mathematics");
        break;
      case "morning_person":
        shouldUnlock = todayCompleted.filter((t) => {
          const h2 = parseInt(t.startTime.split(":")[0], 10);
          return h2 < 9;
        }).length >= 3;
        break;
      case "night_grinder":
        shouldUnlock = todayCompleted.filter((t) => {
          const h2 = parseInt(t.startTime.split(":")[0], 10);
          return h2 >= 21;
        }).length >= 3;
        break;
      case "balanced_student":
        shouldUnlock = physMins >= 300 && chemMins >= 300 && mathMins >= 300;
        break;
    }

    if (shouldUnlock) return { ...a, unlocked: true, unlockedAt: new Date().toISOString() };
    return a;
  });
}

function hasMeaningfulData(s: AppState): boolean {
  return (s.tasks?.length ?? 0) > 0 || (s.xp ?? 0) > 0 || (s.dailyRecords?.length ?? 0) > 0;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [loading, setLoading] = useState(true);
  const [notificationsReady, setNotificationsReady] = useState(false);
  const { user: authUser, token, authLoading, cloudAppState, clearCloudAppState, syncToCloud } = useAuth();
  const localHadDataRef = useRef(false);
  const cloudPullAttemptedRef = useRef(false);
  const migratedCloudStateRef = useRef<AppState | null>(null);
  const lastAccountTokenRef = useRef<string | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeStorageKeyRef = useRef(STORAGE_KEY);
  const loadGenerationRef = useRef(0);

  useEffect(() => {
    void setupNotifications().catch(() => {}).finally(() => setNotificationsReady(true));
  }, []);

  useEffect(() => {
    if (authLoading || !notificationsReady) return;
    const generation = ++loadGenerationRef.current;
    const accountDeviceId = authUser?.device_id;
    activeStorageKeyRef.current = accountDeviceId
      ? accountStorageKey(accountDeviceId)
      : STORAGE_KEY;
    migratedCloudStateRef.current = null;
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    localHadDataRef.current = false;
    setLoading(true);
    setState(INITIAL_STATE);
    void loadState(accountDeviceId, activeStorageKeyRef.current, generation);
    return () => {
      if (loadGenerationRef.current === generation) loadGenerationRef.current++;
    };
  }, [authLoading, notificationsReady, authUser?.device_id]);

  // A token changes on every successful login. Allow the new account's cloud
  // state to be reconciled instead of keeping the previous account's result.
  useEffect(() => {
    if (lastAccountTokenRef.current === token) return;
    lastAccountTokenRef.current = token;
    cloudPullAttemptedRef.current = false;
  }, [token]);

  // Once both local state and auth session have finished loading, reconcile
  // with the cloud copy of this account's data. This is what lets a logged-in
  // account recover its tasks/XP/streak after a reinstall, cache clear, or
  // fresh deploy wiped local device storage.
  useEffect(() => {
    if (loading || authLoading || cloudPullAttemptedRef.current) return;
    cloudPullAttemptedRef.current = true;

    if (!token) return;

    if (!hasMeaningfulData(state) && cloudAppState && hasMeaningfulData(cloudAppState)) {
      // Local storage is empty (or was wiped) but the account has cloud data — restore it.
      void loadCloudState(cloudAppState).finally(clearCloudAppState);
    } else if (hasMeaningfulData(state)) {
      // Local device has real progress — make sure the cloud has an up-to-date copy.
      void syncToCloud(state).finally(clearCloudAppState);
    } else {
      clearCloudAppState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, authLoading, token, cloudAppState, state]);

  async function loadState(
    accountDeviceId: string | undefined,
    storageKey: string,
    generation: number,
  ) {
    try {
      let raw = await AsyncStorage.getItem(storageKey);
      // Older releases used one device-wide key. Move it under the identity
      // stored with the legacy profile, never under whichever account logs in.
      if (accountDeviceId) {
        const legacyState = await claimLegacyState(
          accountDeviceId,
          () => generation === loadGenerationRef.current,
        );
        if (!raw) raw = legacyState;
      }
      if (raw) {
        const parsed = JSON.parse(raw) as AppState;
        // Merge achievements to include new ones added later
        const mergedAchievements = ALL_ACHIEVEMENTS.map((a) => {
          const saved = parsed.achievements?.find((s) => s.id === a.id);
          return saved ? { ...a, ...saved } : a;
        });
        const normalizedTasks = (parsed.tasks ?? []).map(normalizeTaskSubject);
        let merged: AppState = {
          ...INITIAL_STATE,
          ...parsed,
          tasks: normalizedTasks,
          achievements: mergedAchievements,
        };

        // Reschedule notifications for all pending future tasks
        // (restores reminders that were lost when app was killed)
        const rescheduledTasks = await rescheduleAllPendingNotifications(merged.tasks);
        const hasNotificationChanges = rescheduledTasks.some((t, i) => t.notificationId !== merged.tasks[i]?.notificationId);
        const hasSubjectChanges = normalizedTasks.some((t, i) => t.subject !== parsed.tasks?.[i]?.subject);
        if (hasNotificationChanges || hasSubjectChanges) {
          merged = { ...merged, tasks: rescheduledTasks };
          await AsyncStorage.setItem(storageKey, JSON.stringify(merged));
        }

        if (generation !== loadGenerationRef.current) return;
        localHadDataRef.current = hasMeaningfulData(merged);
        setState(merged);
      } else {
        if (generation !== loadGenerationRef.current) return;
        setState(INITIAL_STATE);
      }
    } catch {}
    if (generation === loadGenerationRef.current) setLoading(false);
  }

  function scheduleCloudSync(newState: AppState) {
    if (!token) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncToCloud(newState).catch(() => {});
    }, 1500);
  }

  async function saveState(newState: AppState) {
    setState(newState);
    scheduleCloudSync(newState);
    try {
      await AsyncStorage.setItem(activeStorageKeyRef.current, JSON.stringify(newState));
    } catch {}
  }

  const addTasks = useCallback(
    async (newTasks: Omit<Task, "id" | "status" | "notificationId">[]) => {
      const withIds: Task[] = await Promise.all(
        newTasks.map(async (t) => {
          const task: Task = {
            ...t,
            id: generateId(),
            status: "pending",
            // Preserve the category selected in the timetable editor.
            subject: t.subject || detectSubject(t.title),
          };
          const notId = await scheduleTaskNotification(task);
          return { ...task, notificationId: notId };
        })
      );

      const newState = { ...state, tasks: [...state.tasks, ...withIds] };
      await saveState(newState);
    },
    [state]
  );

  const completeTask = useCallback(
    async (id: string) => {
      const task = state.tasks.find((t) => t.id === id);
      if (!task) return;

      const today = todayString();
      const hour = new Date().getHours();

      const updatedTasks = state.tasks.map((t) =>
        t.id === id ? { ...t, status: "completed" as TaskStatus } : t
      );

      const xpGain = 5;
      const todayTasks = updatedTasks.filter((t) => t.date === today);
      const allCompleted = todayTasks.length > 0 && todayTasks.every((t) => t.status === "completed");
      const perfectDayBonusDates = state.perfectDayBonusDates ?? [];
      const earnsPerfectDayBonus = allCompleted && !perfectDayBonusDates.includes(today);
      const perfectBonus = earnsPerfectDayBonus ? 50 : 0;
      const newXp = state.xp + xpGain + perfectBonus;
      const newPerfectDayBonusDates = earnsPerfectDayBonus
        ? [...perfectDayBonusDates, today]
        : perfectDayBonusDates;

      let newStreak = state.streak;
      let newLastActiveDate = state.lastActiveDate;
      if (state.lastActiveDate !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
        newStreak = state.lastActiveDate === yStr ? state.streak + 1 : 1;
        newLastActiveDate = today;
      }

      let dailyRecords = [...state.dailyRecords];
      const recIdx = dailyRecords.findIndex((r) => r.date === today);
      const xpToday = xpGain + perfectBonus;
      if (recIdx >= 0) {
        dailyRecords[recIdx] = {
          ...dailyRecords[recIdx],
          tasksCompleted: dailyRecords[recIdx].tasksCompleted + 1,
          studyMinutes: dailyRecords[recIdx].studyMinutes + task.duration,
          xpEarned: dailyRecords[recIdx].xpEarned + xpToday,
          isPerfectDay: allCompleted,
        };
      } else {
        dailyRecords.push({ date: today, tasksCompleted: 1, tasksSkipped: 0, studyMinutes: task.duration, xpEarned: xpToday, isPerfectDay: allCompleted });
      }

      await cancelNotification(task.notificationId);

      const tempState: AppState = {
        ...state,
        tasks: updatedTasks,
        xp: newXp,
        streak: newStreak,
        lastActiveDate: newLastActiveDate,
        dailyRecords,
        perfectDayBonusDates: newPerfectDayBonusDates,
      };
      const newAchievements = checkAchievements(tempState, { completedToday: true, hour });

      const newState: AppState = { ...tempState, achievements: newAchievements };
      await saveState(newState);
    },
    [state]
  );

  const skipTask = useCallback(
    async (id: string) => {
      const task = state.tasks.find((t) => t.id === id);
      if (!task) return;

      const today = todayString();
      const updatedTasks = state.tasks.map((t) =>
        t.id === id ? { ...t, status: "skipped" as TaskStatus } : t
      );

      const newXp = Math.max(0, state.xp - 5);

      let dailyRecords = [...state.dailyRecords];
      const recIdx = dailyRecords.findIndex((r) => r.date === today);
      if (recIdx >= 0) {
        dailyRecords[recIdx] = { ...dailyRecords[recIdx], tasksSkipped: dailyRecords[recIdx].tasksSkipped + 1 };
      } else {
        dailyRecords.push({ date: today, tasksCompleted: 0, tasksSkipped: 1, studyMinutes: 0, xpEarned: -5, isPerfectDay: false });
      }

      await cancelNotification(task.notificationId);

      const newState: AppState = { ...state, tasks: updatedTasks, xp: newXp, dailyRecords };
      await saveState(newState);
    },
    [state]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      const task = state.tasks.find((t) => t.id === id);
      await cancelNotification(task?.notificationId);
      const newState = { ...state, tasks: state.tasks.filter((t) => t.id !== id) };
      await saveState(newState);
    },
    [state]
  );

  const updateTaskTime = useCallback(
    async (id: string, startTime: string, endTime: string) => {
      const task = state.tasks.find((t) => t.id === id);
      if (!task) return;
      await cancelNotification(task.notificationId);
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      let dur = (eh * 60 + em) - (sh * 60 + sm);
      if (dur <= 0) dur += 24 * 60;
      const updatedTask: Task = { ...task, startTime, endTime, duration: dur };
      const notId = await scheduleTaskNotification(updatedTask);
      const updatedTasks = state.tasks.map((t) =>
        t.id === id ? { ...updatedTask, notificationId: notId } : t
      );
      await saveState({ ...state, tasks: updatedTasks });
    },
    [state]
  );

  const updateTask = useCallback(
    async (id: string, title: string, startTime: string, endTime: string) => {
      const task = state.tasks.find((t) => t.id === id);
      if (!task) return;
      await cancelNotification(task.notificationId);
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      let dur = (eh * 60 + em) - (sh * 60 + sm);
      if (dur <= 0) dur += 24 * 60;
      const updatedTask: Task = { ...task, title: title.trim() || task.title, startTime, endTime, duration: dur };
      const notId = await scheduleTaskNotification(updatedTask);
      const updatedTasks = state.tasks.map((t) =>
        t.id === id ? { ...updatedTask, notificationId: notId } : t
      );
      await saveState({ ...state, tasks: updatedTasks });
    },
    [state]
  );

  const resetApp = useCallback(async () => {
    if (Notifications) {
      try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch {}
    }
    const fresh: AppState = { ...INITIAL_STATE, achievements: ALL_ACHIEVEMENTS.map(a => ({ ...a, unlocked: false })) };
    // Do not leave the reset in the debounce queue: users commonly reset and
    // log out immediately afterwards. Persist locally and overwrite the cloud
    // copy before allowing the reset action to finish.
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    setState(fresh);
    localHadDataRef.current = false;
    await AsyncStorage.setItem(activeStorageKeyRef.current, JSON.stringify(fresh));
    if (token) {
      await syncToCloud(fresh);
    }
  }, [syncToCloud, token]);

  const resetTodayProgress = useCallback(async () => {
    const today = todayString();
    const updatedTasks = state.tasks.map((t) =>
      t.date === today && t.status !== "pending"
        ? { ...t, status: "pending" as TaskStatus }
        : t
    );
    const updatedRecords = state.dailyRecords.filter((r) => r.date !== today);
    const rescheduledTasks = await rescheduleAllPendingNotifications(updatedTasks);
    await saveState({ ...state, tasks: rescheduledTasks, dailyRecords: updatedRecords });
  }, [state]);

  const resetTodayTimetable = useCallback(async () => {
    const today = todayString();
    const tasksToCancel = state.tasks.filter((t) => t.date === today);
    for (const t of tasksToCancel) await cancelNotification(t.notificationId);
    const updatedTasks = state.tasks.filter((t) => t.date !== today);
    const updatedRecords = state.dailyRecords.filter((r) => r.date !== today);
    await saveState({ ...state, tasks: updatedTasks, dailyRecords: updatedRecords });
  }, [state]);

  const resetAllNotifications = useCallback(async () => {
    if (Notifications) {
      try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch {}
    }
    const clearIds = state.tasks.map((t) => ({ ...t, notificationId: undefined }));
    const rescheduled = await rescheduleAllPendingNotifications(clearIds);
    await saveState({ ...state, tasks: rescheduled });
  }, [state]);

  const resetPreferences = useCallback(async () => {
    await saveState({ ...state, theme: "system" });
  }, [state]);

  const loadCloudState = useCallback(async (cloudState: AppState) => {
    const mergedAchievements = ALL_ACHIEVEMENTS.map((a) => {
      const saved = cloudState.achievements?.find((s) => s.id === a.id);
      return saved ? { ...a, ...saved } : a;
    });
    const merged: AppState = {
      ...INITIAL_STATE,
      ...cloudState,
      tasks: (cloudState.tasks ?? []).map(normalizeTaskSubject),
      perfectDayBonusDates: cloudState.perfectDayBonusDates ?? [],
      achievements: mergedAchievements,
    };
    const rescheduledTasks = await rescheduleAllPendingNotifications(merged.tasks);
    localHadDataRef.current = hasMeaningfulData(merged);
    await saveState({ ...merged, tasks: rescheduledTasks });
  }, []);

  const restoreCloudStateIfEmpty = useCallback(async (cloudState: AppState) => {
    if (loading) {
      migratedCloudStateRef.current = cloudState;
      return;
    }
    if (!hasMeaningfulData(state)) await loadCloudState(cloudState);
  }, [loading, state, loadCloudState]);

  useEffect(() => {
    if (loading || !migratedCloudStateRef.current) return;
    const migratedState = migratedCloudStateRef.current;
    migratedCloudStateRef.current = null;
    if (!hasMeaningfulData(state)) void loadCloudState(migratedState);
  }, [loading, state, loadCloudState]);

  const setTheme = useCallback(
    async (theme: "light" | "dark" | "system") => {
      const newState = { ...state, theme };
      await saveState(newState);
    },
    [state]
  );

  const getTodayTasks = useCallback(() => {
    return state.tasks
      .filter((t) => t.date === todayString())
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [state.tasks]);

  const getTasksForDate = useCallback(
    (date: string) => {
      return state.tasks
        .filter((t) => t.date === date)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
    },
    [state.tasks]
  );

  const getCurrentRank = useCallback(() => {
    if (state.xp >= 1500) return "Legend";
    if (state.xp >= 1000) return "Master";
    if (state.xp >= 500) return "Warrior";
    if (state.xp >= 200) return "Grinder";
    return "Beginner";
  }, [state.xp]);

  const getXPToNextRank = useCallback(() => {
    const xp = state.xp;
    if (xp < 200) return { current: xp, needed: 200, rankName: "Beginner", nextRank: "Grinder" };
    if (xp < 500) return { current: xp - 200, needed: 300, rankName: "Grinder", nextRank: "Warrior" };
    if (xp < 1000) return { current: xp - 500, needed: 500, rankName: "Warrior", nextRank: "Master" };
    if (xp < 1500) return { current: xp - 1000, needed: 500, rankName: "Master", nextRank: "Legend" };
    return { current: xp, needed: xp, rankName: "Legend", nextRank: "Legend" };
  }, [state.xp]);

  const value = useMemo(
    () => ({
      state,
      loading,
      addTasks,
      completeTask,
      skipTask,
      deleteTask,
      updateTaskTime,
      updateTask,
      resetApp,
      resetTodayProgress,
      resetTodayTimetable,
      resetAllNotifications,
      resetPreferences,
      loadCloudState,
      restoreCloudStateIfEmpty,
      setTheme,
      getTodayTasks,
      getTasksForDate,
      getXPToNextRank,
      getCurrentRank,
    }),
    [state, loading, addTasks, completeTask, skipTask, deleteTask, updateTaskTime, updateTask,
     resetApp, resetTodayProgress, resetTodayTimetable, resetAllNotifications, resetPreferences,
      loadCloudState, restoreCloudStateIfEmpty, setTheme, getTodayTasks, getTasksForDate, getXPToNextRank, getCurrentRank]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

export function formatTime12(time: string): string {
  if (!time) return "";
  const [hStr, mStr] = time.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const period = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${String(m).padStart(2, "0")} ${period}`;
}

export function calcDuration(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  let [eh, em] = end.split(":").map(Number);
  let startMins = sh * 60 + sm;
  let endMins = eh * 60 + em;
  if (endMins < startMins) endMins += 24 * 60;
  return endMins - startMins;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const CATEGORY_COLOR: Record<Category, string> = {
  physics:          "#4C6EF5",
  chemistry:        "#20C997",
  mathematics:      "#F59F00",
  biology:          "#51CF66",
  english:          "#CC5DE8",
  computer_science: "#339AF0",
  history:          "#FF8787",
  geography:        "#66D9E8",
  homework:         "#FAB005",
  revision:         "#A9E34B",
  mock_test:        "#FF6B6B",
  coaching:         "#74C0FC",
  reading:          "#B197FC",
  exercise:         "#FF8C42",
  sleep:            "#748FFC",
  meal:             "#F06595",
  break_time:       "#63E6BE",
  travel:           "#FCC419",
  meeting:          "#9A9A9A",
  other:            "#8A9BB5",
};

const CATEGORY_ICON: Record<Category, string> = {
  physics:          "flash",
  chemistry:        "flask",
  mathematics:      "calculator",
  biology:          "leaf",
  english:          "pencil",
  computer_science: "desktop",
  history:          "time",
  geography:        "earth",
  homework:         "documents",
  revision:         "refresh-circle",
  mock_test:        "clipboard",
  coaching:         "school",
  reading:          "book",
  exercise:         "fitness",
  sleep:            "moon",
  meal:             "restaurant",
  break_time:       "cafe",
  travel:           "car",
  meeting:          "people",
  other:            "ellipsis-horizontal",
};

export function getCategoryColor(cat: Category): string {
  return CATEGORY_COLOR[cat] ?? "#8A9BB5";
}

export function getCategoryIcon(cat: Category): string {
  return CATEGORY_ICON[cat] ?? "ellipsis-horizontal";
}

// Vibrant palette for unrecognized ("other") tasks — consistent per title
const OTHER_PALETTE = [
  "#1A6BFF", "#FF6B35", "#2ECC71", "#9B59B6", "#E74C3C",
  "#F39C12", "#1ABC9C", "#E91E63", "#FF5722", "#00BCD4",
  "#7C4DFF", "#FF6D00", "#00C853", "#D500F9", "#0091EA",
  "#FF1744", "#00BFA5", "#FFAB00", "#6200EA", "#00B8D4",
];

export function getTaskColor(title: string, category: Category): string {
  if (category !== "other") return CATEGORY_COLOR[category] ?? "#8A9BB5";
  let hash = 0;
  const s = title.trim().toLowerCase() || "task";
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return OTHER_PALETTE[Math.abs(hash) % OTHER_PALETTE.length];
}

// Backward-compat aliases
export function getSubjectColor(subject: Subject): string { return getCategoryColor(subject); }
export function getSubjectIcon(subject: Subject): string { return getCategoryIcon(subject); }

export function getRankIcon(rank: string): string {
  switch (rank) {
    case "Legend": return "diamond";
    case "Master": return "trophy";
    case "Warrior": return "flash";
    case "Grinder": return "trending-up";
    default: return "star";
  }
}

export function getRankColor(rank: string): string {
  switch (rank) {
    case "Legend": return "#FF6B35";
    case "Master": return "#7B2FF7";
    case "Warrior": return "#1A6BFF";
    case "Grinder": return "#00C48C";
    default: return "#8A9BB5";
  }
}

export function getAchievementColor(difficulty: string): string {
  switch (difficulty) {
    case "easy": return "#00C48C";
    case "medium": return "#F59F00";
    case "hard": return "#FF4D6A";
    case "legendary": return "#7B2FF7";
    default: return "#8A9BB5";
  }
}

export function parseScheduleText(text: string, date: string): Omit<Task, "id" | "status" | "notificationId">[] {
  const tasks: Omit<Task, "id" | "status" | "notificationId">[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const timePattern = /(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?\s*[-–—to]+\s*(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/i;

  for (const line of lines) {
    const match = line.match(timePattern);
    if (!match) continue;

    let [, sh, sm, sp, eh, em, ep] = match;
    let startH = parseInt(sh, 10);
    let startM = parseInt(sm, 10);
    let endH = parseInt(eh, 10);
    let endM = parseInt(em, 10);

    if (sp) {
      const isPM = sp.toUpperCase() === "PM";
      const isAM = sp.toUpperCase() === "AM";
      if (isPM && startH !== 12) startH += 12;
      if (isAM && startH === 12) startH = 0;
    }
    if (ep) {
      const isPM = ep.toUpperCase() === "PM";
      const isAM = ep.toUpperCase() === "AM";
      if (isPM && endH !== 12) endH += 12;
      if (isAM && endH === 12) endH = 0;
    }

    const startTime = `${String(startH).padStart(2, "0")}:${sm.padStart(2, "0")}`;
    const endTime = `${String(endH).padStart(2, "0")}:${em.padStart(2, "0")}`;

    const titlePart = line.replace(timePattern, "").replace(/^[→\-–—►:.\s]+/, "").replace(/[→\-–—►:.\s]+$/, "").trim();
    const cleanTitle = titlePart
      .replace(/^(Slot\s*\d+\s*:?\s*)/i, "")
      .replace(/[\u{1F300}-\u{1FAD6}]/gu, "")
      .trim() || "Task";

    const duration = calcDuration(startTime, endTime);
    if (duration <= 0 || duration > 720) continue;

    tasks.push({
      title: cleanTitle,
      startTime,
      endTime,
      duration,
      date,
      subject: detectSubject(cleanTitle),
    });
  }

  return tasks;
}
