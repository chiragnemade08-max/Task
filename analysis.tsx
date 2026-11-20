import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useColorScheme,
  Platform,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Rect, Text as SvgText, G } from "react-native-svg";
import Colors from "@/constants/colors";
import { useApp, Subject } from "@/context/AppContext";
import { useSocial } from "@/context/SocialContext";

const { width: SCREEN_W } = Dimensions.get("window");

function getWeekDates(offset: number): string[] {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayOfWeek + 1 + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

function getWeekLabel(offset: number): string {
  if (offset === 0) return "This Week";
  if (offset === -1) return "Last Week";
  return `${Math.abs(offset)} weeks ago`;
}

function getPast84Days(): string[] {
  return Array.from({ length: 84 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split("T")[0];
  }).reverse();
}

const CATEGORY_META: { subject: Subject; label: string; color: string; icon: string }[] = [
  { subject: "physics", label: "Physics", color: "#6C8CFF", icon: "flash" },
  { subject: "chemistry", label: "Chemistry", color: "#27D7B0", icon: "flask" },
  { subject: "mathematics", label: "Mathematics", color: "#F5B928", icon: "calculator" },
  { subject: "biology", label: "Biology", color: "#5CCB78", icon: "leaf" },
  { subject: "english", label: "English", color: "#D27CFF", icon: "book" },
  { subject: "computer_science", label: "Computer Science", color: "#4DB6FF", icon: "laptop" },
  { subject: "history", label: "History", color: "#E99B64", icon: "time" },
  { subject: "geography", label: "Geography", color: "#62C5A1", icon: "earth" },
  { subject: "homework", label: "Homework", color: "#FF7D9A", icon: "document-text" },
  { subject: "revision", label: "Revision", color: "#B88CFF", icon: "refresh" },
  { subject: "mock_test", label: "Mock Test", color: "#FF8066", icon: "clipboard" },
  { subject: "coaching", label: "Coaching", color: "#70A7FF", icon: "school" },
  { subject: "reading", label: "Reading", color: "#C48BFF", icon: "book-outline" },
  { subject: "exercise", label: "Exercise", color: "#35C98B", icon: "fitness" },
  { subject: "sleep", label: "Sleep", color: "#7185D9", icon: "moon" },
  { subject: "meal", label: "Meals", color: "#FF9B54", icon: "restaurant" },
  { subject: "break_time", label: "Break Time", color: "#A5B4C7", icon: "cafe" },
  { subject: "travel", label: "Travel", color: "#52B6C9", icon: "car" },
  { subject: "meeting", label: "Meeting", color: "#E487B8", icon: "people" },
  { subject: "other", label: "Other", color: "#9AA8BF", icon: "ellipsis-horizontal" },
];

function StudyHeatmap({ isDark }: { isDark: boolean }) {
  const C = isDark ? Colors.dark : Colors.light;
  const { state } = useApp();
  const days = getPast84Days();
  const W = Math.min(SCREEN_W - 32, 380);
  const cellSize = Math.floor((W - 12) / 13) - 1;
  const cols = 13;
  const rows = 7;

  const studyByDate: Record<string, number> = {};
  for (const t of state.tasks) {
    if (t.status === "completed") {
      studyByDate[t.date] = (studyByDate[t.date] || 0) + t.duration;
    }
  }
  const maxMins = Math.max(...Object.values(studyByDate), 1);

  return (
    <View style={[styles.heatmapCard, { backgroundColor: C.surface }]}>
      <Text style={[styles.heatmapTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>Study Heatmap</Text>
      <Text style={[styles.heatmapSubtitle, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
        Last 84 days of activity
      </Text>
      <Svg width={W} height={(cellSize + 2) * rows + 20}>
        {days.map((d, idx) => {
          const col = Math.floor(idx / rows);
          const row = idx % rows;
          const mins = studyByDate[d] || 0;
          const intensity = mins / maxMins;
          const fill = mins === 0
            ? (isDark ? "#1E3060" : "#E8EEF8")
            : isDark
            ? `rgba(77, 143, 255, ${0.2 + intensity * 0.8})`
            : `rgba(26, 107, 255, ${0.15 + intensity * 0.85})`;
          return (
            <Rect
              key={d}
              x={col * (cellSize + 2)}
              y={row * (cellSize + 2)}
              width={cellSize}
              height={cellSize}
              rx={2}
              fill={fill}
            />
          );
        })}
      </Svg>
      <View style={styles.heatmapLegend}>
        <Text style={[styles.legendText, { color: C.textMuted, fontFamily: "Inter_400Regular" }]}>Less</Text>
        {[0.1, 0.3, 0.5, 0.7, 1].map((op) => (
          <View
            key={op}
            style={[
              styles.legendDot,
              { backgroundColor: isDark ? `rgba(77, 143, 255, ${op})` : `rgba(26, 107, 255, ${op})` },
            ]}
          />
        ))}
        <Text style={[styles.legendText, { color: C.textMuted, fontFamily: "Inter_400Regular" }]}>More</Text>
      </View>
    </View>
  );
}

function WeeklyBar({ weekDates, isDark }: { weekDates: string[]; isDark: boolean }) {
  const C = isDark ? Colors.dark : Colors.light;
  const { state } = useApp();
  const W = Math.min(SCREEN_W - 64, 340);
  const barW = Math.floor((W - 48) / 7);
  const barH = 120;
  const dayLabels = ["M", "T", "W", "T", "F", "S", "S"];

  const dailyMins = weekDates.map((d) =>
    state.tasks
      .filter((t) => t.date === d && t.status === "completed")
      .reduce((sum, t) => sum + t.duration, 0)
  );
  const maxM = Math.max(...dailyMins, 1);

  return (
    <Svg width={W} height={barH + 30}>
      {weekDates.map((d, i) => {
        const h = Math.max((dailyMins[i] / maxM) * barH, 2);
        const isToday = d === new Date().toISOString().split("T")[0];
        return (
          <G key={d}>
            <Rect
              x={i * (barW + 6) + 2}
              y={barH - h}
              width={barW}
              height={h}
              rx={4}
              fill={isToday ? C.primary : isDark ? "#2A4080" : "#C5D5FF"}
            />
            <SvgText
              x={i * (barW + 6) + barW / 2 + 2}
              y={barH + 18}
              textAnchor="middle"
              fontSize={10}
              fill={C.textSecondary}
            >
              {dayLabels[i]}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

export default function AnalysisScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { state } = useApp();
  const { profile, friends } = useSocial();
  const [weekOffset, setWeekOffset] = useState(0);
  const topPad = Platform.OS === "web" ? insets.top + 67 : insets.top;

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  const weekStats = useMemo(() => {
    const weekTasks = state.tasks.filter((t) => weekDates.includes(t.date));
    const completed = weekTasks.filter((t) => t.status === "completed");
    const totalMins = completed.reduce((a, t) => a + t.duration, 0);
    const xp = completed.length * 5;
    return { completed: completed.length, totalMins, xp };
  }, [weekDates, state.tasks]);

  const subjectStats = useMemo(() => {
    const subjects = CATEGORY_META.map((item) => ({
      ...item,
      color: item.subject === "physics" ? C.physics
        : item.subject === "chemistry" ? C.chemistry
        : item.subject === "mathematics" ? C.mathematics
        : item.color,
      mins: 0,
    }));

    for (const t of state.tasks) {
      if (t.status === "completed") {
        const s = subjects.find((s) => s.subject === t.subject);
        if (s) s.mins += t.duration;
      }
    }

    const totalMins = subjects.reduce((a, s) => a + s.mins, 0) || 1;
    return subjects.map((s) => ({ ...s, pct: Math.round((s.mins / totalMins) * 100) }));
  }, [state.tasks, C]);

  const friendStudyStats = useMemo(() => {
    const myMinutes = state.tasks
      .filter((t) => t.status === "completed")
      .reduce((sum, t) => sum + t.duration, 0);
    const entries = [
      ...(profile ? [{ name: `${profile.name} (You)`, minutes: myMinutes, color: C.primary }] : []),
      ...friends.map((friend) => ({
        name: friend.name.replace(" (You)", ""),
        minutes: Math.round(friend.study_hours * 60),
        color: friend.avatar_color || C.primary,
      })),
    ];
    const maxMinutes = Math.max(...entries.map((entry) => entry.minutes), 1);
    return entries
      .sort((a, b) => b.minutes - a.minutes)
      .map((entry) => ({ ...entry, pct: Math.max((entry.minutes / maxMinutes) * 100, entry.minutes ? 4 : 0) }));
  }, [state.tasks, profile, friends, C.primary]);

  const totalStudyHours = useMemo(() => {
    const mins = state.tasks
      .filter((t) => t.status === "completed")
      .reduce((a, t) => a + t.duration, 0);
    return { h: Math.floor(mins / 60), m: mins % 60 };
  }, [state.tasks]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: C.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topPad + 16, paddingBottom: insets.bottom + 100 }]}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text style={[styles.title, { color: C.text, fontFamily: "Inter_700Bold" }]}>Analysis</Text>
      <Text style={[styles.subtitle, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
        Your performance insights
      </Text>

      {/* Overall Stats */}
      <View style={styles.statsRow}>
        <View style={[styles.bigStat, { backgroundColor: C.primary }]}>
          <Ionicons name="book" size={20} color="rgba(255,255,255,0.8)" />
          <Text style={[styles.bigStatValue, { fontFamily: "Inter_700Bold" }]}>{totalStudyHours.h}h {totalStudyHours.m}m</Text>
          <Text style={[styles.bigStatLabel, { fontFamily: "Inter_400Regular" }]}>Total Study</Text>
        </View>
        <View style={styles.smallStats}>
          <View style={[styles.smallStat, { backgroundColor: C.surface }]}>
            <Ionicons name="checkmark-circle" size={16} color={C.success} />
            <Text style={[styles.smallStatValue, { color: C.text, fontFamily: "Inter_700Bold" }]}>
              {state.tasks.filter((t) => t.status === "completed").length}
            </Text>
            <Text style={[styles.smallStatLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>Done</Text>
          </View>
          <View style={[styles.smallStat, { backgroundColor: C.surface }]}>
            <Ionicons name="flame" size={16} color="#FF6B35" />
            <Text style={[styles.smallStatValue, { color: C.text, fontFamily: "Inter_700Bold" }]}>{state.streak}</Text>
            <Text style={[styles.smallStatLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>Streak</Text>
          </View>
          <View style={[styles.smallStat, { backgroundColor: C.surface }]}>
            <Ionicons name="star" size={16} color={C.warning} />
            <Text style={[styles.smallStatValue, { color: C.text, fontFamily: "Inter_700Bold" }]}>{state.xp}</Text>
            <Text style={[styles.smallStatLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>XP</Text>
          </View>
        </View>
      </View>

      {/* Weekly Bar Chart */}
      <View style={[styles.chartCard, { backgroundColor: C.surface }]}>
        <View style={styles.chartHeader}>
          <Text style={[styles.chartTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>
            {getWeekLabel(weekOffset)}
          </Text>
          <View style={styles.weekNav}>
            <Pressable onPress={() => setWeekOffset((w) => w - 1)} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={18} color={C.primary} />
            </Pressable>
            <Pressable
              onPress={() => setWeekOffset((w) => Math.min(w + 1, 0))}
              style={[styles.navBtn, weekOffset >= 0 && { opacity: 0.3 }]}
              disabled={weekOffset >= 0}
            >
              <Ionicons name="chevron-forward" size={18} color={C.primary} />
            </Pressable>
          </View>
        </View>
        <WeeklyBar weekDates={weekDates} isDark={isDark} />
        <View style={styles.weekStatRow}>
          <View style={styles.weekStat}>
            <Text style={[styles.weekStatVal, { color: C.text, fontFamily: "Inter_700Bold" }]}>{weekStats.completed}</Text>
            <Text style={[styles.weekStatLbl, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>Tasks Done</Text>
          </View>
          <View style={styles.weekStat}>
            <Text style={[styles.weekStatVal, { color: C.text, fontFamily: "Inter_700Bold" }]}>
              {Math.floor(weekStats.totalMins / 60)}h {weekStats.totalMins % 60}m
            </Text>
            <Text style={[styles.weekStatLbl, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>Study Time</Text>
          </View>
          <View style={styles.weekStat}>
            <Text style={[styles.weekStatVal, { color: C.text, fontFamily: "Inter_700Bold" }]}>+{weekStats.xp}</Text>
            <Text style={[styles.weekStatLbl, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>XP Earned</Text>
          </View>
        </View>
      </View>

      {/* Subject Progress */}
      <Text style={[styles.sectionTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>Subject-wise Study Hours</Text>
      {subjectStats.map((s) => (
        <View key={s.subject} style={[styles.subjectCard, { backgroundColor: C.surface }]}>
          <View style={[styles.subjectIcon, { backgroundColor: s.color + "20" }]}>
            <Ionicons name={s.icon as any} size={20} color={s.color} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.subjectHeader}>
              <Text style={[styles.subjectName, { color: C.text, fontFamily: "Inter_600SemiBold" }]}>{s.label}</Text>
              <Text style={[styles.subjectTime, { color: s.color, fontFamily: "Inter_700Bold" }]}>
                {Math.floor(s.mins / 60)}h {s.mins % 60}m
              </Text>
            </View>
            <View style={[styles.subjectTrack, { backgroundColor: C.border }]}>
              <View style={[styles.subjectFill, { width: `${s.pct}%` as any, backgroundColor: s.color }]} />
            </View>
          </View>
        </View>
      ))}

      {/* Friends comparison */}
      <Text style={[styles.sectionTitle, { color: C.text, fontFamily: "Inter_700Bold", marginTop: 8 }]}>
        Friends Study Graph
      </Text>
      <View style={[styles.friendGraphCard, { backgroundColor: C.surface }]}>
        {friendStudyStats.length === 0 ? (
          <View style={styles.friendEmpty}>
            <Ionicons name="people-outline" size={28} color={C.textMuted} />
            <Text style={[styles.friendEmptyText, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
              Add friends to compare study hours
            </Text>
          </View>
        ) : (
          friendStudyStats.map((entry) => (
            <View key={entry.name} style={styles.friendRow}>
              <View style={styles.friendRowHeader}>
                <Text
                  numberOfLines={1}
                  style={[styles.friendName, { color: C.text, fontFamily: "Inter_600SemiBold" }]}
                >
                  {entry.name}
                </Text>
                <Text style={[styles.friendTime, { color: entry.color, fontFamily: "Inter_700Bold" }]}>
                  {Math.floor(entry.minutes / 60)}h {entry.minutes % 60}m
                </Text>
              </View>
              <View style={[styles.friendTrack, { backgroundColor: C.border }]}>
                <View style={[styles.friendFill, { width: `${entry.pct}%` as any, backgroundColor: entry.color }]} />
              </View>
            </View>
          ))
        )}
      </View>

      {/* Heatmap */}
      <StudyHeatmap isDark={isDark} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16 },
  title: { fontSize: 28, marginBottom: 4 },
  subtitle: { fontSize: 14, marginBottom: 20 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  bigStat: {
    flex: 1,
    borderRadius: 18,
    padding: 16,
    gap: 6,
    justifyContent: "center",
  },
  bigStatValue: { color: "#fff", fontSize: 20 },
  bigStatLabel: { color: "rgba(255,255,255,0.75)", fontSize: 12 },
  smallStats: { gap: 8, flex: 1 },
  smallStat: {
    flex: 1,
    borderRadius: 14,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  smallStatValue: { fontSize: 15 },
  smallStatLabel: { fontSize: 11 },
  chartCard: { borderRadius: 18, padding: 16, marginBottom: 20 },
  chartHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  chartTitle: { fontSize: 16 },
  weekNav: { flexDirection: "row", gap: 4 },
  navBtn: { padding: 4 },
  weekStatRow: { flexDirection: "row", marginTop: 12, paddingTop: 12 },
  weekStat: { flex: 1, alignItems: "center" },
  weekStatVal: { fontSize: 15 },
  weekStatLbl: { fontSize: 11, marginTop: 2 },
  sectionTitle: { fontSize: 17, marginBottom: 12 },
  subjectCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
  },
  subjectIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  subjectHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  subjectName: { fontSize: 15 },
  subjectTime: { fontSize: 14 },
  subjectTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  subjectFill: { height: "100%", borderRadius: 3 },
  friendGraphCard: { borderRadius: 18, padding: 16, marginBottom: 20 },
  friendRow: { marginBottom: 14 },
  friendRowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 7 },
  friendName: { fontSize: 13, flex: 1, marginRight: 12 },
  friendTime: { fontSize: 13 },
  friendTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  friendFill: { height: "100%", borderRadius: 4 },
  friendEmpty: { alignItems: "center", paddingVertical: 12, gap: 8 },
  friendEmptyText: { fontSize: 13, textAlign: "center" },
  heatmapCard: { borderRadius: 18, padding: 16, marginBottom: 20, marginTop: 8 },
  heatmapTitle: { fontSize: 16, marginBottom: 4 },
  heatmapSubtitle: { fontSize: 12, marginBottom: 14 },
  heatmapLegend: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  legendText: { fontSize: 11 },
  legendDot: { width: 12, height: 12, borderRadius: 2 },
});
