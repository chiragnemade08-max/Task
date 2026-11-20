import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useApp, detectCategory, formatDuration, formatTime12, type Category, type Task } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import EditableBlockCard, { type TimetableColors } from "@/components/timetable/EditableBlockCard";
import {
  createEmptyBlock,
  parseManualTimePair,
  parseTimetableText,
  type RepeatMode,
  type TimeAlternative,
  type TimetableBlock,
} from "@/lib/timetable-parser";
import { apiRequest } from "@/lib/query-client";

type EntryMode = "paste" | "manual" | "capture";
type TimeDrafts = Record<string, { startDraft?: string; endDraft?: string }>;

const C: TimetableColors = {
  background: "#071326",
  surface: "#0D1C32",
  border: "#1B3556",
  text: "#F4F7FC",
  secondary: "#A6B7D1",
  muted: "#7185A4",
  primary: "#347CF6",
  warning: "#F3B84E",
  danger: "#FF657D",
  success: "#52D6B5",
};

const DAYS = [
  { short: "S", full: "Sunday" },
  { short: "M", full: "Monday" },
  { short: "T", full: "Tuesday" },
  { short: "W", full: "Wednesday" },
  { short: "T", full: "Thursday" },
  { short: "F", full: "Friday" },
  { short: "S", full: "Saturday" },
];
const CATEGORIES: Category[] = [
  "physics", "chemistry", "mathematics", "biology", "english", "computer_science",
  "history", "geography", "homework", "revision", "mock_test", "coaching",
  "reading", "exercise", "sleep", "meal", "break_time", "travel", "meeting", "other",
];
const REPEAT_CHOICES: { value: RepeatMode; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "every_day", label: "Every Day" },
  { value: "weekdays", label: "Weekdays" },
  { value: "custom_days", label: "Custom Days" },
];
const EXAMPLE_SCHEDULE = `6:00 AM - 7:00 AM Physics Revision
7:00 AM - 8:00 AM Mathematics - Trigonometry
8:30 AM - 9:30 AM Chemistry - Organic
10:00 AM - 11:00 AM Physics MCQs
2:00 PM - 3:00 PM Maths Practice
4:00 PM - 5:00 PM Chemistry Revision`;
const SCAN_STEPS = [
  "Finding the timetable area",
  "Reading text and handwriting",
  "Checking times and subjects",
  "Preparing editable blocks",
];

interface CapturedPhoto {
  uri: string;
  base64: string;
  width: number;
  height: number;
}

function localDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function todayString(): string {
  return localDateString(new Date());
}

function addDays(dateString: string, amount: number): string {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return localDateString(date);
}

function dateLabel(dateString: string): string {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function dateOrdinal(dateString: string): number {
  const [year, month, day] = dateString.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function minutesFromTime(time: string): number | null {
  const match = time.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function blockDuration(start: string, end: string): number {
  const startMinutes = minutesFromTime(start);
  const endMinutes = minutesFromTime(end);
  if (startMinutes === null || endMinutes === null) return 0;
  const difference = endMinutes - startMinutes;
  return difference > 0 ? difference : difference + 1440;
}

function expandScheduleDates(mode: RepeatMode, startDate: string, customDays: number[]): string[] {
  if (mode === "today") return [startDate];
  const wantedDays = mode === "every_day"
    ? new Set([0, 1, 2, 3, 4, 5, 6])
    : mode === "weekdays"
      ? new Set([1, 2, 3, 4, 5])
      : new Set(customDays);
  const dates: string[] = [];
  for (let offset = 0; offset < 7; offset++) {
    const date = addDays(startDate, offset);
    const day = new Date(`${date}T00:00:00`).getDay();
    if (wantedDays.has(day)) dates.push(date);
  }
  return dates;
}

function intervalsOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

function findOverlappingBlocks(
  blocks: TimetableBlock[],
  existingTasks: Task[],
  occurrenceDates: string[],
): Set<string> {
  const overlaps = new Set<string>();
  for (let i = 0; i < blocks.length; i++) {
    const current = blocks[i];
    const currentStart = minutesFromTime(current.startTime);
    const currentDuration = current.duration || blockDuration(current.startTime, current.endTime);
    if (currentStart === null || !currentDuration) continue;
    const currentDates = occurrenceDates.map((date) => addDays(date, current.dayOffset));

    for (let j = i + 1; j < blocks.length; j++) {
      const other = blocks[j];
      const otherStart = minutesFromTime(other.startTime);
      const otherDuration = other.duration || blockDuration(other.startTime, other.endTime);
      if (otherStart === null || !otherDuration) continue;
      const otherDates = occurrenceDates.map((date) => addDays(date, other.dayOffset));
      const sharedDate = currentDates.find((date) => otherDates.includes(date));
      if (!sharedDate) continue;
      const ordinal = dateOrdinal(sharedDate) * 1440;
      if (intervalsOverlap(
        ordinal + currentStart,
        ordinal + currentStart + currentDuration,
        ordinal + otherStart,
        ordinal + otherStart + otherDuration,
      )) {
        overlaps.add(current.id);
        overlaps.add(other.id);
      }
    }

    for (const task of existingTasks) {
      if (task.status !== "pending" || !currentDates.includes(task.date)) continue;
      const taskStart = minutesFromTime(task.startTime);
      if (taskStart === null || task.duration <= 0) continue;
      const ordinal = dateOrdinal(task.date) * 1440;
      if (intervalsOverlap(
        ordinal + currentStart,
        ordinal + currentStart + currentDuration,
        ordinal + taskStart,
        ordinal + taskStart + task.duration,
      )) overlaps.add(current.id);
    }
  }
  return overlaps;
}

function asRepeatMode(value: unknown): RepeatMode {
  return value === "every_day" || value === "weekdays" || value === "custom_days" ? value : "today";
}

function mapVisionBlocks(values: unknown): TimetableBlock[] {
  if (!Array.isArray(values)) return [];
  return values.slice(0, 30).map((value: any, index) => {
    const title = typeof value?.title === "string" ? value.title.trim().slice(0, 120) : "";
    const startTime = typeof value?.startTime === "string" && minutesFromTime(value.startTime) !== null
      ? value.startTime
      : "";
    const endTime = typeof value?.endTime === "string" && minutesFromTime(value.endTime) !== null
      ? value.endTime
      : "";
    const category = CATEGORIES.includes(value?.category) ? value.category as Category : detectCategory(title);
    const timeAlternatives: TimeAlternative[] = Array.isArray(value?.timeAlternatives)
      ? value.timeAlternatives
          .filter((option: any) => minutesFromTime(option?.startTime) !== null && minutesFromTime(option?.endTime) !== null)
          .slice(0, 3)
      : [];
    const confidenceValue = Number(value?.confidence);
    const confidence = value?.needsReview || confidenceValue < 0.78 || !title || !startTime || !endTime
      ? "review"
      : "high";
    const issue = timeAlternatives.length
      ? "The time is unclear. Choose the correct AM/PM option."
      : !startTime || !endTime
        ? "A start or end time could not be read."
        : !title
          ? "The activity could not be read."
          : confidence === "review"
            ? "Check this low-confidence reading."
            : undefined;
    const duration = blockDuration(startTime, endTime);
    return {
      id: `photo-${Date.now()}-${index}`,
      title,
      startTime,
      endTime,
      duration,
      dayOffset: Number.isInteger(value?.dayOffset) ? Math.max(0, Math.min(2, value.dayOffset)) : 0,
      subject: category,
      notes: typeof value?.notes === "string" ? value.notes.slice(0, 300) : "",
      confidence,
      issue,
      timeAlternatives: timeAlternatives.length ? timeAlternatives : undefined,
    };
  });
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("Photo parsing is not configured")) {
    return "AI photo parsing is not configured yet. You can still use Paste Schedule or Manual Entry.";
  }
  if (message.includes("401") || message.includes("Sign in")) {
    return "Sign in to use AI photo parsing. Paste Schedule and Manual Entry remain available.";
  }
  if (message.includes("413") || message.includes("too large")) {
    return "This photo is too large to process. Crop it or choose a smaller image.";
  }
  return "The photo could not be parsed. Try another photo, or use Paste Schedule or Manual Entry.";
}

export default function CreateTimetableScreen() {
  const insets = useSafeAreaInsets();
  const { addTasks, state } = useApp();
  const { token } = useAuth();
  const [mode, setMode] = useState<EntryMode>("paste");
  const [step, setStep] = useState<"input" | "review">("input");
  const [selectedDate, setSelectedDate] = useState(todayString);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("today");
  const [customDays, setCustomDays] = useState<number[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [blocks, setBlocks] = useState<TimetableBlock[]>(() => [createEmptyBlock(detectCategory)]);
  const [timeDrafts, setTimeDrafts] = useState<TimeDrafts>({});
  const [saving, setSaving] = useState(false);
  const [inputError, setInputError] = useState("");
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [photoUnreadable, setPhotoUnreadable] = useState(false);
  const [scanStage, setScanStage] = useState(0);

  const occurrenceDates = useMemo(
    () => expandScheduleDates(repeatMode, selectedDate, customDays),
    [repeatMode, selectedDate, customDays],
  );
  const overlappingIds = useMemo(
    () => findOverlappingBlocks(blocks, state.tasks, occurrenceDates),
    [blocks, state.tasks, occurrenceDates],
  );

  const setModeAndClearError = (nextMode: EntryMode) => {
    setMode(nextMode);
    setInputError("");
    setPhotoError("");
  };

  const chooseDate = (kind: "today" | "tomorrow" | "custom") => {
    const today = todayString();
    if (kind === "today") setSelectedDate(today);
    else if (kind === "tomorrow") setSelectedDate(addDays(today, 1));
    else if (selectedDate === today || selectedDate === addDays(today, 1)) setSelectedDate(addDays(today, 2));
  };

  const changeDate = (delta: number) => {
    const target = addDays(selectedDate, delta);
    if (target >= todayString()) setSelectedDate(target);
  };

  const handleParsePaste = () => {
    const parsed = parseTimetableText(pasteText, detectCategory);
    if (!parsed.blocks.length) {
      setInputError("No timetable blocks found. Try a line like “6:00 AM - 7:00 AM Physics”.");
      return;
    }
    setBlocks(parsed.blocks);
    setTimeDrafts({});
    setRepeatMode(parsed.repeatMode);
    setCustomDays(parsed.customDays);
    setInputError("");
    setStep("review");
    if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handlePatch = (id: string, updates: Partial<TimetableBlock>) => {
    setBlocks((previous) => previous.map((block) => {
      if (block.id !== id) return block;
      const next = { ...block, ...updates };
      if (updates.title !== undefined && block.subject === "other" && updates.title.trim()) {
        next.subject = detectCategory(updates.title);
      }
      return next;
    }));
  };

  const handleTimeDraft = (id: string, field: "startDraft" | "endDraft", value: string) => {
    setTimeDrafts((previous) => ({
      ...previous,
      [id]: { ...previous[id], [field]: value },
    }));
    setBlocks((previous) => previous.map((block) => block.id === id
      ? { ...block, issue: undefined, confidence: "review" }
      : block));
  };

  const handleTimeCommit = (id: string) => {
    const block = blocks.find((item) => item.id === id);
    if (!block) return;
    const drafts = timeDrafts[id] ?? {};
    const start = drafts.startDraft ?? formatTime12(block.startTime);
    const end = drafts.endDraft ?? formatTime12(block.endTime);
    if (!start.trim() || !end.trim()) {
      setBlocks((previous) => previous.map((item) => item.id === id
        ? { ...item, issue: "Enter both a start and end time.", confidence: "review" }
        : item));
      return;
    }
    const parsed = parseManualTimePair(start, end, block.title, detectCategory);
    if (!parsed) {
      setBlocks((previous) => previous.map((item) => item.id === id
        ? { ...item, issue: "Use a time such as 6:00 AM, 18:00, or 4 PM.", confidence: "review" }
        : item));
      return;
    }
    setBlocks((previous) => previous.map((item) => item.id === id
      ? { ...item, ...parsed, id, subject: item.subject }
      : item));
    setTimeDrafts((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  };

  const chooseTimeAlternative = (id: string, option: TimeAlternative) => {
    setBlocks((previous) => previous.map((block) => {
      if (block.id !== id) return block;
      const duration = blockDuration(option.startTime, option.endTime);
      return {
        ...block,
        startTime: option.startTime,
        endTime: option.endTime,
        duration,
        confidence: "high",
        issue: undefined,
        timeAlternatives: undefined,
      };
    }));
    setTimeDrafts((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  };

  const markReviewed = (id: string) => {
    setBlocks((previous) => previous.map((block) => block.id === id
      ? { ...block, confidence: "high", issue: undefined }
      : block));
  };

  const addBlock = () => setBlocks((previous) => [...previous, createEmptyBlock(detectCategory)]);

  const duplicateBlock = (id: string) => {
    setBlocks((previous) => {
      const index = previous.findIndex((block) => block.id === id);
      if (index < 0) return previous;
      const original = previous[index];
      const copy = { ...original, id: `copy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
      const next = [...previous];
      next.splice(index + 1, 0, copy);
      return next;
    });
  };

  const deleteBlock = (id: string) => {
    setBlocks((previous) => previous.filter((block) => block.id !== id));
    setTimeDrafts((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  };

  const moveBlock = (id: string, direction: -1 | 1) => {
    setBlocks((previous) => {
      const index = previous.findIndex((block) => block.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= previous.length) return previous;
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const confirmManualReview = () => {
    const usable = blocks.filter((block) => block.title.trim() || block.startTime || block.endTime);
    if (!usable.length) {
      setInputError("Add at least one activity and its start and end times.");
      return;
    }
    setBlocks(usable);
    setInputError("");
    setStep("review");
  };

  const createSchedule = async () => {
    if (!blocks.length) {
      setInputError("Add at least one block before creating a schedule.");
      return;
    }
    if (repeatMode === "custom_days" && customDays.length === 0) {
      setInputError("Choose at least one day for this schedule.");
      return;
    }
    const invalid = blocks.filter((block) =>
      !block.title.trim() ||
      minutesFromTime(block.startTime) === null ||
      minutesFromTime(block.endTime) === null ||
      block.confidence === "review" ||
      Boolean(block.timeAlternatives?.length),
    );
    if (invalid.length) {
      setInputError(`Review ${invalid.length} block${invalid.length === 1 ? "" : "s"} marked “Needs edit” before creating the schedule.`);
      return;
    }
    const dates = expandScheduleDates(repeatMode, selectedDate, customDays);
    if (!dates.length) {
      setInputError("No dates are selected for this schedule.");
      return;
    }
    const onConfirmCreate = async () => {
      setSaving(true);
      setInputError("");
      try {
        const tasks = blocks.flatMap((block) => {
          const duration = blockDuration(block.startTime, block.endTime);
          return dates.map((date) => ({
            title: block.title.trim(),
            startTime: block.startTime,
            endTime: block.endTime,
            duration,
            date: addDays(date, block.dayOffset),
            subject: block.subject,
            notes: block.notes.trim() || undefined,
          }));
        });
        await addTasks(tasks);
        if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      } catch {
        setInputError("The schedule could not be saved. Your existing schedule has not been changed.");
      } finally {
        setSaving(false);
      }
    };

    if (overlappingIds.size) {
      Alert.alert(
        "Overlapping blocks",
        `${overlappingIds.size} block${overlappingIds.size === 1 ? "" : "s"} overlap another block or an existing task. You can go back and adjust them, or create the schedule anyway.`,
        [
          { text: "Review", style: "cancel" },
          { text: "Create anyway", onPress: () => void onConfirmCreate() },
        ],
      );
      return;
    }
    await onConfirmCreate();
  };

  const preparePickedImage = async (asset: ImagePicker.ImagePickerAsset) => {
    const actions = asset.width > 1800 ? [{ resize: { width: 1800 } }] : [];
    const result = await ImageManipulator.manipulateAsync(
      asset.uri,
      actions,
      { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    if (!result.base64) throw new Error("Image could not be prepared.");
    setPhoto({ uri: result.uri, base64: result.base64, width: result.width, height: result.height });
    setPhotoUnreadable(false);
    setPhotoError("");
  };

  const chooseImage = async (source: "camera" | "library") => {
    setPhotoError("");
    try {
      const permission = source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setPhotoError(source === "camera"
          ? "Allow camera access in device settings to capture a timetable."
          : "Allow photo access in device settings to choose a timetable.");
        return;
      }
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            quality: 0.85,
            base64: false,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            quality: 0.85,
            base64: false,
          });
      if (result.canceled || !result.assets?.[0]) return;
      await preparePickedImage(result.assets[0]);
    } catch {
      setPhotoError("The photo could not be opened. Try choosing another image.");
    }
  };

  const cropPhoto = async () => {
    if (!photo) return;
    try {
      const cropWidth = Math.max(1, Math.floor(photo.width * 0.86));
      const cropHeight = Math.max(1, Math.floor(photo.height * 0.86));
      const result = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{
          crop: {
            originX: Math.floor((photo.width - cropWidth) / 2),
            originY: Math.floor((photo.height - cropHeight) / 2),
            width: cropWidth,
            height: cropHeight,
          },
        }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (result.base64) setPhoto({ uri: result.uri, base64: result.base64, width: result.width, height: result.height });
    } catch {
      setPhotoError("The photo could not be cropped. You can still continue with the original.");
    }
  };

  const rotatePhoto = async () => {
    if (!photo) return;
    try {
      const result = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ rotate: 90 }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (result.base64) setPhoto({ uri: result.uri, base64: result.base64, width: result.width, height: result.height });
    } catch {
      setPhotoError("The photo could not be rotated.");
    }
  };

  const analyzePhoto = async () => {
    if (!photo) return;
    if (!token) {
      setPhotoError("Sign in to use AI photo parsing. Paste Schedule and Manual Entry remain available.");
      return;
    }
    setPhotoBusy(true);
    setScanStage(0);
    setPhotoError("");
    setPhotoUnreadable(false);
    const timer = setInterval(() => setScanStage((stage) => Math.min(stage + 1, SCAN_STEPS.length - 1)), 1700);
    try {
      const response = await apiRequest(
        "POST",
        "/api/timetable/parse-image",
        { imageBase64: photo.base64, mimeType: "image/jpeg" },
        { headers: { Authorization: `Bearer ${token}` }, timeoutMs: 60_000 },
      );
      const result = await response.json();
      const parsedBlocks = mapVisionBlocks(result.blocks);
      if (parsedBlocks.length) setBlocks(parsedBlocks);
      if (result.repeatMode) setRepeatMode(asRepeatMode(result.repeatMode));
      if (Array.isArray(result.repeatDays)) {
        setCustomDays(result.repeatDays.filter((day: unknown) => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6));
      }
      if (result.readable && parsedBlocks.length) {
        setStep("review");
      } else {
        setPhotoUnreadable(true);
        if (!parsedBlocks.length) setBlocks([createEmptyBlock(detectCategory)]);
      }
    } catch (error) {
      setPhotoError(errorMessage(error));
    } finally {
      clearInterval(timer);
      setPhotoBusy(false);
    }
  };

  const reviewFoundBlocks = () => {
    if (!blocks.length) setBlocks([createEmptyBlock(detectCategory)]);
    setStep("review");
  };

  const toggleCustomDay = (day: number) => {
    setCustomDays((previous) => previous.includes(day)
      ? previous.filter((value) => value !== day)
      : [...previous, day].sort((a, b) => a - b));
  };

  const renderDateAndRepeat = () => (
    <>
      <Text style={styles.sectionEyebrow}>Schedule date</Text>
      <View style={styles.quickDateRow}>
        {([
          ["today", "Today"],
          ["tomorrow", "Tomorrow"],
          ["custom", "Custom"],
        ] as const).map(([key, label]) => {
          const today = todayString();
          const selected = key === "today"
            ? selectedDate === today
            : key === "tomorrow"
              ? selectedDate === addDays(today, 1)
              : selectedDate !== today && selectedDate !== addDays(today, 1);
          return (
            <Pressable
              key={key}
              onPress={() => chooseDate(key)}
              style={[styles.quickDatePill, { backgroundColor: selected ? C.primary : C.surface, borderColor: selected ? C.primary : C.border }]}
            >
              <Text style={[styles.quickDateText, { color: selected ? "#FFFFFF" : C.secondary }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.dateNavigator}>
        <Pressable
          onPress={() => changeDate(-1)}
          disabled={selectedDate <= todayString()}
          style={[styles.dateArrow, { backgroundColor: C.surface, borderColor: C.border, opacity: selectedDate <= todayString() ? 0.35 : 1 }]}
          accessibilityLabel="Previous date"
        >
          <Ionicons name="chevron-back" size={18} color={C.text} />
        </Pressable>
        <View style={[styles.dateDisplay, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Ionicons name="calendar-outline" size={16} color={C.primary} />
          <Text style={[styles.dateDisplayText, { color: C.text }]} numberOfLines={1}>{dateLabel(selectedDate)}</Text>
        </View>
        <Pressable
          onPress={() => changeDate(1)}
          style={[styles.dateArrow, { backgroundColor: C.surface, borderColor: C.border }]}
          accessibilityLabel="Next date"
        >
          <Ionicons name="chevron-forward" size={18} color={C.text} />
        </Pressable>
      </View>

      <Text style={[styles.sectionEyebrow, { marginTop: 18 }]}>Repeat</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.repeatRow}>
        {REPEAT_CHOICES.map((choice) => {
          const selected = repeatMode === choice.value;
          return (
            <Pressable
              key={choice.value}
              onPress={() => setRepeatMode(choice.value)}
              style={[styles.repeatPill, { backgroundColor: selected ? C.primary + "24" : C.surface, borderColor: selected ? C.primary : C.border }]}
            >
              <Text style={[styles.repeatText, { color: selected ? C.text : C.secondary }]}>{choice.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {repeatMode === "custom_days" && (
        <View style={styles.daysRow}>
          {DAYS.map((day, index) => {
            const selected = customDays.includes(index);
            return (
              <Pressable
                key={`${day.full}-${index}`}
                onPress={() => toggleCustomDay(index)}
                accessibilityLabel={day.full}
                style={[styles.dayCircle, { backgroundColor: selected ? C.primary : C.surface, borderColor: selected ? C.primary : C.border }]}
              >
                <Text style={[styles.dayText, { color: selected ? "#FFFFFF" : C.secondary }]}>{day.short}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <Text style={styles.repeatHint}>
        {repeatMode === "today"
          ? "Adds this schedule to the selected date."
          : "Creates dated tasks for matching days in the next 7 days."}
      </Text>
    </>
  );

  const renderBlockEditor = () => (
    <>
      {blocks.map((block, index) => (
        <EditableBlockCard
          key={block.id}
          block={block}
          index={index}
          count={blocks.length}
          overlap={overlappingIds.has(block.id)}
          colors={C}
          startDraft={timeDrafts[block.id]?.startDraft}
          endDraft={timeDrafts[block.id]?.endDraft}
          onPatch={handlePatch}
          onTimeDraft={handleTimeDraft}
          onTimeCommit={handleTimeCommit}
          onChooseTime={chooseTimeAlternative}
          onMarkReviewed={markReviewed}
          onDuplicate={duplicateBlock}
          onDelete={deleteBlock}
          onMove={moveBlock}
        />
      ))}
      <Pressable onPress={addBlock} style={[styles.addBlockButton, { borderColor: C.primary }]}>
        <Ionicons name="add-circle-outline" size={19} color={C.primary} />
        <Text style={[styles.addBlockText, { color: C.primary }]}>Add a block</Text>
      </Pressable>
    </>
  );

  const renderCapture = () => (
    <View style={[styles.capturePanel, { backgroundColor: C.surface, borderColor: C.border }]}>
      <View style={styles.captureHeading}>
        <View style={[styles.captureIconCircle, { backgroundColor: C.primary + "20" }]}>
          <Ionicons name="scan-outline" size={22} color={C.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.captureTitle, { color: C.text }]}>Capture your timetable</Text>
          <Text style={[styles.captureSubtitle, { color: C.secondary }]}>Take a clear, well-lit photo of the full page.</Text>
        </View>
      </View>

      {!photo ? (
        <View style={styles.pickButtons}>
          <Pressable onPress={() => void chooseImage("camera")} style={[styles.primaryButton, { backgroundColor: C.primary }]}>
            <Ionicons name="camera-outline" size={18} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>Open camera</Text>
          </Pressable>
          <Pressable onPress={() => void chooseImage("library")} style={[styles.secondaryButton, { borderColor: C.border, backgroundColor: C.background }]}>
            <Ionicons name="images-outline" size={18} color={C.text} />
            <Text style={[styles.secondaryButtonText, { color: C.text }]}>Choose photo</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Image source={{ uri: photo.uri }} style={styles.photoPreview} resizeMode="contain" accessibilityLabel="Selected timetable photo" />
          <View style={styles.photoTools}>
            <Pressable onPress={() => void chooseImage("camera")} style={[styles.photoToolButton, { borderColor: C.border }]}>
              <Ionicons name="refresh-outline" size={15} color={C.secondary} />
              <Text style={[styles.photoToolText, { color: C.secondary }]}>Retake</Text>
            </Pressable>
            <Pressable onPress={() => void cropPhoto()} style={[styles.photoToolButton, { borderColor: C.border }]}>
              <Ionicons name="crop-outline" size={15} color={C.secondary} />
              <Text style={[styles.photoToolText, { color: C.secondary }]}>Crop</Text>
            </Pressable>
            <Pressable onPress={() => void rotatePhoto()} style={[styles.photoToolButton, { borderColor: C.border }]}>
              <Ionicons name="reload-outline" size={15} color={C.secondary} />
              <Text style={[styles.photoToolText, { color: C.secondary }]}>Rotate</Text>
            </Pressable>
          </View>
          <Text style={[styles.cropHint, { color: C.muted }]}>Crop trims the photo edges; use the photo picker crop frame for precise framing.</Text>
          {photoBusy ? (
            <View style={[styles.scanCard, { backgroundColor: C.background, borderColor: C.border }]}>
              <View style={styles.scanTopRow}>
                <ActivityIndicator size="small" color={C.primary} />
                <Text style={[styles.scanTitle, { color: C.text }]}>Reading timetable</Text>
              </View>
              <View style={[styles.progressTrack, { backgroundColor: C.border }]}>
                <View style={[styles.progressBar, { width: `${((scanStage + 1) / SCAN_STEPS.length) * 100}%`, backgroundColor: C.primary }]} />
              </View>
              {SCAN_STEPS.map((label, index) => (
                <View key={label} style={styles.scanStepRow}>
                  <Ionicons
                    name={index < scanStage ? "checkmark-circle" : index === scanStage ? "ellipse" : "ellipse-outline"}
                    size={14}
                    color={index <= scanStage ? C.primary : C.muted}
                  />
                  <Text style={[styles.scanStepText, { color: index <= scanStage ? C.secondary : C.muted }]}>{label}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Pressable onPress={() => void analyzePhoto()} style={[styles.primaryButton, { backgroundColor: C.primary }]}>
              <Ionicons name="sparkles" size={17} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Continue to AI review</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            </Pressable>
          )}
        </>
      )}

      {photoError ? (
        <View style={[styles.photoMessage, { backgroundColor: C.danger + "18" }]}>
          <Ionicons name="alert-circle-outline" size={17} color={C.danger} />
          <Text style={[styles.photoMessageText, { color: C.danger }]}>{photoError}</Text>
        </View>
      ) : null}
      {photoUnreadable ? (
        <View style={[styles.unreadableMessage, { backgroundColor: C.warning + "18" }]}>
          <Ionicons name="eye-outline" size={18} color={C.warning} />
          <Text style={[styles.photoMessageText, { color: C.warning, flex: 1 }]}>
            The photo was difficult to read. Check lighting, framing, and focus. You can review anything found or enter blocks yourself.
          </Text>
          <Pressable onPress={reviewFoundBlocks} style={[styles.reviewFoundButton, { borderColor: C.warning }]}>
            <Text style={[styles.reviewFoundText, { color: C.warning }]}>Review found blocks</Text>
          </Pressable>
        </View>
      ) : null}
      <Text style={[styles.privacyHint, { color: C.muted }]}>
        The image is sent to the configured AI service for parsing. It is not added to your saved timetable.
      </Text>
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: C.background }]}>
      <Stack.Screen options={{ headerShown: false, presentation: "modal" }} />
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 7, borderBottomColor: C.border }]}>
        <Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: C.surface }]} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={19} color={C.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: C.text }]}>{step === "review" ? "Review schedule" : "Create timetable"}</Text>
          <Text style={[styles.headerSubtitle, { color: C.secondary }]}>
            {step === "review" ? `${blocks.length} editable block${blocks.length === 1 ? "" : "s"}` : "Build a plan that fits your day"}
          </Text>
        </View>
        {step === "review" && (
          <Pressable onPress={() => setStep("input")} style={[styles.headerEditButton, { borderColor: C.border }]}>
            <Ionicons name="pencil-outline" size={15} color={C.secondary} />
            <Text style={[styles.headerEditText, { color: C.secondary }]}>Back</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: insets.bottom + 34 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === "input" ? (
          <>
            <View style={[styles.modeTabs, { backgroundColor: C.surface, borderColor: C.border }]}>
              {([
                { value: "paste", label: "Paste Schedule", icon: "clipboard-outline" },
                { value: "manual", label: "Manual Entry", icon: "create-outline" },
                { value: "capture", label: "Capture", icon: "camera-outline" },
              ] as const).map((tab) => {
                const active = mode === tab.value;
                return (
                  <Pressable
                    key={tab.value}
                    onPress={() => setModeAndClearError(tab.value)}
                    style={[styles.modeTab, active && { backgroundColor: C.primary }]}
                  >
                    <Ionicons name={tab.icon as any} size={15} color={active ? "#FFFFFF" : C.secondary} />
                    <Text style={[styles.modeTabText, { color: active ? "#FFFFFF" : C.secondary }]} numberOfLines={1}>
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {renderDateAndRepeat()}

            {mode === "paste" ? (
              <View style={styles.modeContent}>
                <View style={styles.sectionHeaderRow}>
                  <View>
                    <Text style={[styles.contentTitle, { color: C.text }]}>Paste your schedule</Text>
                    <Text style={[styles.contentDescription, { color: C.secondary }]}>One time block per line. You can edit every field next.</Text>
                  </View>
                  <Pressable onPress={() => { setPasteText(EXAMPLE_SCHEDULE); setInputError(""); }} hitSlop={8}>
                    <Text style={[styles.exampleText, { color: C.primary }]}>Use example</Text>
                  </Pressable>
                </View>
                <TextInput
                  value={pasteText}
                  onChangeText={(value) => { setPasteText(value); setInputError(""); }}
                  placeholder={"6:00 AM - 7:00 AM Physics\n7:00 AM - 8:00 AM Maths\n4 PM Maths Revision"}
                  placeholderTextColor={C.muted}
                  multiline
                  textAlignVertical="top"
                  style={[styles.scheduleInput, { backgroundColor: C.surface, borderColor: C.border, color: C.text }]}
                  accessibilityLabel="Paste timetable text"
                />
                <View style={[styles.tipCard, { backgroundColor: C.primary + "16" }]}>
                  <Ionicons name="information-circle-outline" size={17} color={C.primary} />
                  <Text style={[styles.tipText, { color: C.secondary }]}>
                    Accepts 6:00 AM, 18:00, “4 PM Maths”, or “6 to 7”. Unclear AM/PM times will be flagged for you.
                  </Text>
                </View>
                <Pressable
                  onPress={handleParsePaste}
                  disabled={!pasteText.trim()}
                  style={[styles.primaryButton, { backgroundColor: C.primary, opacity: pasteText.trim() ? 1 : 0.5 }]}
                >
                  <Ionicons name="sparkles" size={17} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>Parse schedule</Text>
                  <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                </Pressable>
              </View>
            ) : mode === "manual" ? (
              <View style={styles.modeContent}>
                <View style={styles.sectionHeaderRow}>
                  <View>
                    <Text style={[styles.contentTitle, { color: C.text }]}>Add blocks</Text>
                    <Text style={[styles.contentDescription, { color: C.secondary }]}>Times accept AM/PM or 24-hour format.</Text>
                  </View>
                </View>
                {renderBlockEditor()}
                <Pressable onPress={confirmManualReview} style={[styles.primaryButton, { backgroundColor: C.primary }]}>
                  <Ionicons name="eye-outline" size={17} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>Review schedule</Text>
                  <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                </Pressable>
              </View>
            ) : (
              <View style={styles.modeContent}>{renderCapture()}</View>
            )}

            {inputError ? (
              <View style={[styles.errorCard, { backgroundColor: C.danger + "18" }]}>
                <Ionicons name="alert-circle-outline" size={16} color={C.danger} />
                <Text style={[styles.errorText, { color: C.danger }]}>{inputError}</Text>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <View style={[styles.reviewSummary, { backgroundColor: C.primary + "18", borderColor: C.primary + "50" }]}>
              <View style={[styles.summaryIcon, { backgroundColor: C.primary + "30" }]}>
                <Ionicons name="calendar-outline" size={19} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.summaryTitle, { color: C.text }]}>{blocks.length} block{blocks.length === 1 ? "" : "s"} · {occurrenceDates.length} date{occurrenceDates.length === 1 ? "" : "s"}</Text>
                <Text style={[styles.summarySubtitle, { color: C.secondary }]}>
                  Starts {dateLabel(selectedDate)} · {repeatMode === "today" ? "one day only" : "repeats over the next 7 days"}
                </Text>
              </View>
            </View>
            {overlappingIds.size > 0 ? (
              <View style={[styles.overlapSummary, { backgroundColor: C.danger + "18" }]}>
                <Ionicons name="warning-outline" size={17} color={C.danger} />
                <Text style={[styles.errorText, { color: C.danger }]}>
                  {overlappingIds.size} block{overlappingIds.size === 1 ? "" : "s"} overlap. Review the marked blocks before creating.
                </Text>
              </View>
            ) : null}
            {renderBlockEditor()}
            {inputError ? (
              <View style={[styles.errorCard, { backgroundColor: C.danger + "18" }]}>
                <Ionicons name="alert-circle-outline" size={16} color={C.danger} />
                <Text style={[styles.errorText, { color: C.danger }]}>{inputError}</Text>
              </View>
            ) : null}
            <View style={styles.reviewActions}>
              <Pressable onPress={() => setStep("input")} style={[styles.secondaryButton, styles.reviewBack, { borderColor: C.border, backgroundColor: C.surface }]}>
                <Text style={[styles.secondaryButtonText, { color: C.text }]}>Back</Text>
              </Pressable>
              <Pressable
                onPress={() => void createSchedule()}
                disabled={saving}
                style={[styles.primaryButton, styles.reviewCreate, { backgroundColor: C.primary, opacity: saving ? 0.65 : 1 }]}
              >
                {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />}
                <Text style={styles.primaryButtonText}>{saving ? "Creating..." : "Create schedule"}</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 13, borderBottomWidth: 1 },
  backButton: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "800", letterSpacing: 0.1 },
  headerSubtitle: { fontSize: 11, marginTop: 3 },
  headerEditButton: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7 },
  headerEditText: { fontSize: 11, fontWeight: "600" },
  scroll: { flex: 1 },
  modeTabs: { flexDirection: "row", borderWidth: 1, borderRadius: 14, padding: 4, gap: 3 },
  modeTab: { flex: 1, minHeight: 43, borderRadius: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5, paddingHorizontal: 4 },
  modeTabText: { fontSize: 10, fontWeight: "700", flexShrink: 1 },
  sectionEyebrow: { color: "#A6B7D1", fontSize: 10, fontWeight: "800", letterSpacing: 0.7, textTransform: "uppercase", marginTop: 19, marginBottom: 9 },
  quickDateRow: { flexDirection: "row", gap: 8 },
  quickDatePill: { flex: 1, minHeight: 35, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1 },
  quickDateText: { fontSize: 11, fontWeight: "700" },
  dateNavigator: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  dateArrow: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  dateDisplay: { flex: 1, minHeight: 36, borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  dateDisplayText: { fontSize: 11, fontWeight: "600", flexShrink: 1 },
  repeatRow: { gap: 7, paddingRight: 4 },
  repeatPill: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  repeatText: { fontSize: 10, fontWeight: "700" },
  daysRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  dayCircle: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  dayText: { fontSize: 12, fontWeight: "700" },
  repeatHint: { color: "#7185A4", fontSize: 10, lineHeight: 14, marginTop: 8 },
  modeContent: { marginTop: 22 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 },
  contentTitle: { fontSize: 17, fontWeight: "800" },
  contentDescription: { fontSize: 11, marginTop: 4, lineHeight: 15 },
  exampleText: { fontSize: 11, fontWeight: "700" },
  scheduleInput: { minHeight: 165, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, paddingVertical: 12, fontSize: 13, lineHeight: 21 },
  tipCard: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: 11, marginTop: 10, marginBottom: 14 },
  tipText: { flex: 1, fontSize: 10, lineHeight: 15 },
  primaryButton: { minHeight: 46, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 14 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  secondaryButton: { minHeight: 44, borderWidth: 1, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 14 },
  secondaryButtonText: { fontSize: 12, fontWeight: "700" },
  addBlockButton: { borderWidth: 1, borderStyle: "dashed", borderRadius: 12, minHeight: 43, marginBottom: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  addBlockText: { fontSize: 12, fontWeight: "700" },
  capturePanel: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 13 },
  captureHeading: { flexDirection: "row", alignItems: "center", gap: 11 },
  captureIconCircle: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  captureTitle: { fontSize: 14, fontWeight: "800" },
  captureSubtitle: { fontSize: 10, marginTop: 4, lineHeight: 14 },
  pickButtons: { gap: 8 },
  photoPreview: { width: "100%", height: 230, borderRadius: 12, backgroundColor: "#030A14" },
  photoTools: { flexDirection: "row", gap: 7 },
  photoToolButton: { flex: 1, minHeight: 36, borderWidth: 1, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  photoToolText: { fontSize: 10, fontWeight: "700" },
  cropHint: { fontSize: 9, lineHeight: 13, marginTop: -8 },
  scanCard: { borderWidth: 1, borderRadius: 13, padding: 12, gap: 9 },
  scanTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  scanTitle: { fontSize: 12, fontWeight: "800" },
  progressTrack: { height: 4, borderRadius: 2, overflow: "hidden" },
  progressBar: { height: 4, borderRadius: 2 },
  scanStepRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  scanStepText: { fontSize: 10 },
  photoMessage: { flexDirection: "row", alignItems: "flex-start", gap: 7, padding: 10, borderRadius: 11 },
  photoMessageText: { fontSize: 10, lineHeight: 15, flex: 1 },
  unreadableMessage: { flexDirection: "row", alignItems: "flex-start", flexWrap: "wrap", gap: 7, padding: 10, borderRadius: 11 },
  reviewFoundButton: { width: "100%", borderWidth: 1, borderRadius: 9, padding: 8, alignItems: "center" },
  reviewFoundText: { fontSize: 10, fontWeight: "800" },
  privacyHint: { fontSize: 9, lineHeight: 13 },
  errorCard: { flexDirection: "row", gap: 8, padding: 10, borderRadius: 10, marginTop: 12 },
  errorText: { flex: 1, fontSize: 11, lineHeight: 15, fontWeight: "600" },
  reviewSummary: { borderWidth: 1, borderRadius: 15, padding: 12, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 13 },
  summaryIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  summaryTitle: { fontSize: 12, fontWeight: "800" },
  summarySubtitle: { fontSize: 10, marginTop: 4, lineHeight: 14 },
  overlapSummary: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: 11, marginBottom: 11 },
  reviewActions: { flexDirection: "row", gap: 9, marginTop: 2 },
  reviewBack: { width: 90 },
  reviewCreate: { flex: 1 },
});
