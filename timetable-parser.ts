import type { Category } from "@/context/AppContext";

export interface TimeAlternative {
  startTime: string;
  endTime: string;
}

export interface TimetableBlock {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  duration: number;
  dayOffset: number;
  subject: Category;
  notes: string;
  confidence: "high" | "review";
  issue?: string;
  timeAlternatives?: TimeAlternative[];
}

export type RepeatMode = "today" | "every_day" | "weekdays" | "custom_days";

export interface ParsedSchedule {
  blocks: TimetableBlock[];
  repeatMode: RepeatMode;
  customDays: number[];
}

interface ParsedAtom {
  hour: number;
  minute: number;
  meridiem: "AM" | "PM" | null;
  is24Hour: boolean;
}

interface ParsedLine {
  block: TimetableBlock;
  endAbsolute: number;
}

const RANGE_PATTERN =
  /(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s*(?:-|–|—|\bto\b)\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s*(.*)$/i;
const SINGLE_TIME_PATTERN =
  /(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))\s+(.+)$/i;
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function parseAtom(raw: string): ParsedAtom | null {
  const match = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3]
    ? match[3].replace(/\./g, "").toUpperCase() as "AM" | "PM"
    : null;
  const is24Hour = meridiem === null && (hour === 0 || hour > 12);
  if (minute > 59 || hour > 23 || (meridiem && (hour < 1 || hour > 12))) return null;
  return { hour, minute, meridiem, is24Hour };
}

function minuteOfDay(atom: ParsedAtom, assumedMeridiem?: "AM" | "PM"): number {
  if (atom.is24Hour) return atom.hour * 60 + atom.minute;
  const meridiem = atom.meridiem ?? assumedMeridiem ?? (atom.hour === 12 ? "PM" : "AM");
  let hour = atom.hour % 12;
  if (meridiem === "PM") hour += 12;
  return hour * 60 + atom.minute;
}

function toTimeString(minute: number): string {
  const withinDay = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(withinDay / 60)).padStart(2, "0")}:${String(withinDay % 60).padStart(2, "0")}`;
}

function cleanActivity(raw: string): string {
  return raw
    .replace(/^(?:slot\s*\d+\s*[:.)-]?\s*)/i, "")
    .replace(/\bmaths?\s+rev\.?\b/gi, "Mathematics Revision")
    .replace(/\bmaths?\b/gi, "Mathematics")
    .replace(/\bphy\.?\b/gi, "Physics")
    .replace(/\bchem\.?\b/gi, "Chemistry")
    .replace(/\bbio\.?\b/gi, "Biology")
    .replace(/\bcs\.?\b/gi, "Computer Science")
    .replace(/\bhw\.?\b/gi, "Homework")
    .replace(/\brev\.?\b/gi, "Revision")
    .replace(/[\u{1F300}-\u{1FAD6}]/gu, "")
    .replace(/^[\s:–—.\-]+|[\s:–—.\-]+$/g, "")
    .trim();
}

function alignAfter(minute: number, previousEnd: number): number {
  let absolute = minute + Math.floor(previousEnd / 1440) * 1440;
  while (absolute < previousEnd - 15) absolute += 1440;
  return absolute;
}

function inferStartMeridiem(
  start: ParsedAtom,
  end: ParsedAtom,
  title: string,
  previousEnd?: number,
): { period: "AM" | "PM"; uncertain: boolean } {
  if (start.meridiem) return { period: start.meridiem, uncertain: false };
  if (start.is24Hour) return { period: start.hour >= 12 ? "PM" : "AM", uncertain: false };
  if (end.meridiem && !end.is24Hour) return { period: end.meridiem, uncertain: false };
  if (start.hour === 12) return { period: "PM", uncertain: false };

  const lowerTitle = title.toLowerCase();
  if (/\b(morning|breakfast|wake|before school)\b/.test(lowerTitle)) {
    return { period: "AM", uncertain: false };
  }
  if (/\b(afternoon|evening|night|dinner|after school)\b/.test(lowerTitle)) {
    return { period: "PM", uncertain: false };
  }

  if (previousEnd !== undefined) {
    const amStart = alignAfter(minuteOfDay(start, "AM"), previousEnd);
    const pmStart = alignAfter(minuteOfDay(start, "PM"), previousEnd);
    return {
      period: Math.abs(amStart - previousEnd) <= Math.abs(pmStart - previousEnd) ? "AM" : "PM",
      uncertain: false,
    };
  }

  // The common 6–7 / school-morning form is an AM block. A 4–5 block is
  // provisionally shown as PM, but remains explicitly flagged for confirmation.
  if (start.hour === 4 || start.hour === 5 || (start.hour >= 1 && start.hour <= 3)) {
    return { period: "PM", uncertain: true };
  }
  return { period: "AM", uncertain: false };
}

function parseRange(
  startRaw: string,
  endRaw: string,
  title: string,
  categoryFor: (activity: string) => Category,
  previousEnd?: number,
  id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
): ParsedLine | null {
  const start = parseAtom(startRaw);
  const end = parseAtom(endRaw);
  if (!start || !end) return null;

  const inferred = inferStartMeridiem(start, end, title, previousEnd);
  const startPeriod = start.meridiem ?? (start.is24Hour ? null : inferred.period);
  const startMinute = minuteOfDay(start, startPeriod ?? undefined);
  const startAbsolute = previousEnd === undefined
    ? startMinute
    : alignAfter(startMinute, previousEnd);

  let endPeriod = end.meridiem;
  if (!end.is24Hour && !endPeriod) {
    if (end.hour === 12) {
      endPeriod = "PM";
    } else {
      endPeriod = startPeriod ?? (start.hour === 0 ? "AM" : undefined) ?? inferred.period;
    }
  }
  let endMinute = minuteOfDay(end, endPeriod ?? undefined);
  let endAbsolute = Math.floor(startAbsolute / 1440) * 1440 + endMinute;

  if (endAbsolute <= startAbsolute) {
    if (!end.meridiem && !end.is24Hour && startPeriod === "AM" && end.hour > 0 && end.hour < 12) {
      endMinute = minuteOfDay(end, "PM");
      endAbsolute = Math.floor(startAbsolute / 1440) * 1440 + endMinute;
    }
    while (endAbsolute <= startAbsolute) endAbsolute += 1440;
  }

  const duration = endAbsolute - startAbsolute;
  if (duration <= 0 || duration > 720) return null;

  const timeAlternatives: TimeAlternative[] | undefined = inferred.uncertain
    ? (["AM", "PM"] as const).map((period) => {
        const alternateStart = minuteOfDay(start, period);
        let alternateEnd = minuteOfDay(
          end,
          end.meridiem ?? (end.hour < start.hour && period === "AM" ? "PM" : period),
        );
        if (alternateEnd <= alternateStart) alternateEnd += 1440;
        return {
          startTime: toTimeString(alternateStart),
          endTime: toTimeString(alternateEnd),
        };
      })
    : undefined;

  const activity = cleanActivity(title);
  const needsReview = inferred.uncertain || !activity || duration > 480;
  const issue = !activity
    ? "Couldn’t read this activity. Enter it before creating the schedule."
    : inferred.uncertain
      ? "Check whether this time is AM or PM."
      : duration > 480
        ? "Check this unusually long block."
        : undefined;

  return {
    block: {
      id,
      title: activity,
      startTime: toTimeString(startAbsolute),
      endTime: toTimeString(endAbsolute),
      duration,
      dayOffset: Math.floor(startAbsolute / 1440),
      subject: categoryFor(activity),
      notes: "",
      confidence: needsReview ? "review" : "high",
      issue,
      timeAlternatives,
    },
    endAbsolute,
  };
}

function parseLine(
  rawLine: string,
  categoryFor: (activity: string) => Category,
  previousEnd?: number,
  id?: string,
): ParsedLine | null {
  const line = rawLine.trim();
  const range = RANGE_PATTERN.exec(line);
  if (range) {
    const prefix = line.slice(0, range.index).replace(
      /^(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s*[:,|-]?\s*/i,
      "",
    );
    const title = [prefix, range[3]].filter(Boolean).join(" ").trim();
    return parseRange(range[1], range[2], title, categoryFor, previousEnd, id);
  }

  const single = SINGLE_TIME_PATTERN.exec(line);
  if (single) {
    const atom = parseAtom(single[1]);
    if (!atom) return null;
    const start = minuteOfDay(atom);
    const title = cleanActivity(single[2]);
    return parseRange(
      single[1],
      toTimeString(start + 60),
      title,
      categoryFor,
      previousEnd,
      id,
    );
  }
  return null;
}

function detectRepeat(text: string): { mode: RepeatMode; days: number[] } {
  const normalized = text.toLowerCase();
  if (/\b(every day|daily|each day)\b/.test(normalized)) {
    return { mode: "every_day", days: [0, 1, 2, 3, 4, 5, 6] };
  }
  if (/\b(weekdays|monday\s*(?:-|to|through)\s*friday)\b/.test(normalized)) {
    return { mode: "weekdays", days: [1, 2, 3, 4, 5] };
  }

  const explicitWeeklyPattern = /\b(weekly|every week|every\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)s?)\b/i.test(text);
  if (explicitWeeklyPattern) {
    const days: number[] = [];
    DAY_NAMES.forEach((name, index) => {
      const short = name.slice(0, 3);
      const dayMention = new RegExp(`\\b${name}s?\\b|\\b${short}s?\\b`, "i");
      if (dayMention.test(text)) days.push(index);
    });
    if (days.length) return { mode: "custom_days", days };
  }
  return { mode: "today", days: [] };
}

export function parseTimetableText(
  text: string,
  categoryFor: (activity: string) => Category,
): ParsedSchedule {
  let previousEnd: number | undefined;
  const blocks: TimetableBlock[] = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const parsed = parseLine(line, categoryFor, previousEnd, `paste-${index}-${Date.now()}`);
    if (!parsed) continue;
    blocks.push(parsed.block);
    previousEnd = parsed.endAbsolute;
  }
  const repeat = detectRepeat(text);
  return { blocks, repeatMode: repeat.mode, customDays: repeat.days };
}

export function parseManualTimePair(
  startRaw: string,
  endRaw: string,
  title: string,
  categoryFor: (activity: string) => Category,
): TimetableBlock | null {
  return parseRange(startRaw, endRaw, title, categoryFor)?.block ?? null;
}

export function createEmptyBlock(
  categoryFor: (activity: string) => Category,
  id = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
): TimetableBlock {
  return {
    id,
    title: "",
    startTime: "",
    endTime: "",
    duration: 0,
    dayOffset: 0,
    subject: categoryFor(""),
    notes: "",
    confidence: "review",
    issue: "Add an activity and time.",
  };
}
