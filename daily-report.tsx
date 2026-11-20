import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useApp, formatDuration, getRankColor } from "@/context/AppContext";

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

export default function DailyReportScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { state, getTasksForDate, getCurrentRank } = useApp();

  const today = todayStr();
  const tasks = getTasksForDate(today);
  const completed = tasks.filter((t) => t.status === "completed");
  const skipped = tasks.filter((t) => t.status === "skipped");
  const studyMins = completed.reduce((a, t) => a + t.duration, 0);
  const xpEarned = completed.length * 5 + (tasks.length > 0 && completed.length === tasks.length ? 50 : 0);
  const rank = getCurrentRank();
  const rankColor = getRankColor(rank);

  const completionRate = tasks.length > 0 ? Math.round((completed.length / tasks.length) * 100) : 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: C.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: C.primary }]}>
        <Ionicons name="bar-chart" size={32} color="rgba(255,255,255,0.9)" />
        <Text style={[styles.heroTitle, { fontFamily: "Inter_700Bold" }]}>Daily Summary</Text>
        <Text style={[styles.heroDate, { fontFamily: "Inter_400Regular" }]}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </Text>
      </View>

      {/* Key stats */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { backgroundColor: C.surface }]}>
          <Ionicons name="checkmark-circle" size={24} color={C.success} />
          <Text style={[styles.statValue, { color: C.text, fontFamily: "Inter_700Bold" }]}>{completed.length}</Text>
          <Text style={[styles.statLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>Completed</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: C.surface }]}>
          <Ionicons name="close-circle" size={24} color={C.danger} />
          <Text style={[styles.statValue, { color: C.text, fontFamily: "Inter_700Bold" }]}>{skipped.length}</Text>
          <Text style={[styles.statLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>Skipped</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: C.surface }]}>
          <Ionicons name="time" size={24} color={C.primary} />
          <Text style={[styles.statValue, { color: C.text, fontFamily: "Inter_700Bold" }]}>{formatDuration(studyMins)}</Text>
          <Text style={[styles.statLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>Study Time</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: C.surface }]}>
          <Ionicons name="star" size={24} color={C.warning} />
          <Text style={[styles.statValue, { color: C.text, fontFamily: "Inter_700Bold" }]}>+{xpEarned}</Text>
          <Text style={[styles.statLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>XP Earned</Text>
        </View>
      </View>

      {/* Completion rate */}
      <View style={[styles.rateCard, { backgroundColor: C.surface }]}>
        <View style={styles.rateHeader}>
          <Text style={[styles.rateTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>Completion Rate</Text>
          <Text style={[styles.rateValue, { color: completionRate >= 80 ? C.success : completionRate >= 50 ? C.warning : C.danger, fontFamily: "Inter_700Bold" }]}>
            {completionRate}%
          </Text>
        </View>
        <View style={[styles.rateTrack, { backgroundColor: C.border }]}>
          <View
            style={[
              styles.rateFill,
              {
                width: `${completionRate}%` as any,
                backgroundColor: completionRate >= 80 ? C.success : completionRate >= 50 ? C.warning : C.danger,
              },
            ]}
          />
        </View>
        <Text style={[styles.rateSubtitle, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
          {completionRate === 100
            ? "Perfect day! +50 bonus XP earned"
            : completionRate >= 80
            ? "Great work today!"
            : completionRate >= 50
            ? "Good effort. Keep pushing!"
            : "Keep going, every task counts!"}
        </Text>
      </View>

      {/* Rank */}
      <View style={[styles.rankCard, { backgroundColor: rankColor + "15", borderColor: rankColor + "40" }]}>
        <Ionicons name="trophy" size={24} color={rankColor} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.rankTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>Rank Progress</Text>
          <Text style={[styles.rankValue, { color: rankColor, fontFamily: "Inter_600SemiBold" }]}>
            {rank} · {state.xp} XP total
          </Text>
        </View>
      </View>

      <Pressable
        style={[styles.doneBtn, { backgroundColor: C.primary }]}
        onPress={() => router.back()}
      >
        <Text style={[styles.doneBtnText, { fontFamily: "Inter_700Bold" }]}>Done</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  hero: { borderRadius: 20, padding: 28, alignItems: "center", gap: 8, marginBottom: 20 },
  heroTitle: { color: "#fff", fontSize: 22 },
  heroDate: { color: "rgba(255,255,255,0.8)", fontSize: 14 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  statCard: { width: "47.5%", padding: 16, borderRadius: 16, alignItems: "center", gap: 6 },
  statValue: { fontSize: 22 },
  statLabel: { fontSize: 12 },
  rateCard: { borderRadius: 16, padding: 16, marginBottom: 16 },
  rateHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  rateTitle: { fontSize: 15 },
  rateValue: { fontSize: 18 },
  rateTrack: { height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 10 },
  rateFill: { height: "100%", borderRadius: 4 },
  rateSubtitle: { fontSize: 13 },
  rankCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 16, borderWidth: 1.5, marginBottom: 20 },
  rankTitle: { fontSize: 14, marginBottom: 3 },
  rankValue: { fontSize: 15 },
  doneBtn: { padding: 16, borderRadius: 14, alignItems: "center" },
  doneBtnText: { color: "#fff", fontSize: 16 },
});
