import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useColorScheme,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useApp, getRankIcon, getRankColor, formatDuration } from "@/context/AppContext";

type SubTab = "rank" | "records" | "achievements";

const RANKS = [
  { name: "Beginner", minXp: 0, maxXp: 50, icon: "star", emoji: "Beginner" },
  { name: "Grinder", minXp: 50, maxXp: 200, icon: "trending-up", emoji: "Grinder" },
  { name: "Warrior", minXp: 200, maxXp: 500, icon: "flash", emoji: "Warrior" },
  { name: "Master", minXp: 500, maxXp: 1500, icon: "trophy", emoji: "Master" },
  { name: "Legend", minXp: 1500, maxXp: Infinity, icon: "diamond", emoji: "Legend" },
];

export default function RankScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { state, getCurrentRank, getXPToNextRank } = useApp();
  const [subTab, setSubTab] = useState<SubTab>("rank");
  const topPad = Platform.OS === "web" ? insets.top + 67 : insets.top;

  const rank = getCurrentRank();
  const xpInfo = getXPToNextRank();
  const rankColor = getRankColor(rank);
  const rankIcon = getRankIcon(rank);
  const progress = rank === "Legend" ? 1 : xpInfo.current / xpInfo.needed;

  const totalCompleted = useMemo(
    () => state.tasks.filter((t) => t.status === "completed").length,
    [state.tasks]
  );
  const totalStudyMins = useMemo(
    () => state.tasks.filter((t) => t.status === "completed").reduce((a, t) => a + t.duration, 0),
    [state.tasks]
  );
  const perfectDays = useMemo(
    () => state.dailyRecords.filter((r) => r.isPerfectDay).length,
    [state.dailyRecords]
  );

  const bestDay = useMemo(() => {
    let best = { date: "", tasksCompleted: 0 };
    for (const r of state.dailyRecords) {
      if (r.tasksCompleted > best.tasksCompleted) {
        best = { date: r.date, tasksCompleted: r.tasksCompleted };
      }
    }
    return best;
  }, [state.dailyRecords]);

  const bestWeek = useMemo(() => {
    let bestMins = 0;
    for (const r of state.dailyRecords) {
      if (r.studyMinutes > bestMins) bestMins = r.studyMinutes;
    }
    return { mins: bestMins };
  }, [state.dailyRecords]);

  const subjectHours = useMemo(() => {
    const subjectMins: Record<string, number> = {};
    for (const t of state.tasks) {
      if (t.status === "completed" && t.subject !== "other") {
        subjectMins[t.subject] = (subjectMins[t.subject] || 0) + t.duration;
      }
    }
    return Object.entries(subjectMins).sort((a, b) => b[1] - a[1])[0] || ["none", 0];
  }, [state.tasks]);

  const subjectLabel: Record<string, string> = {
    physics: "Physics",
    chemistry: "Chemistry",
    mathematics: "Mathematics",
    other: "Other",
    none: "-",
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: C.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topPad + 16, paddingBottom: insets.bottom + 100 }]}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: C.text, fontFamily: "Inter_700Bold" }]}>Rank</Text>
      </View>

      {/* Sub tabs */}
      <View style={[styles.subTabRow, { backgroundColor: C.surface }]}>
        {(["rank", "records", "achievements"] as SubTab[]).map((t) => (
          <Pressable
            key={t}
            style={[styles.subTab, subTab === t && [styles.subTabActive, { backgroundColor: C.primary }]]}
            onPress={() => setSubTab(t)}
          >
            <Text
              style={[
                styles.subTabText,
                { color: subTab === t ? "#fff" : C.textSecondary, fontFamily: "Inter_600SemiBold" },
              ]}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {subTab === "rank" && (
        <>
          {/* Rank Card */}
          <View style={[styles.rankCard, { backgroundColor: C.surface, borderColor: rankColor + "40" }]}>
            <View style={[styles.rankBadge, { backgroundColor: rankColor + "15", borderColor: rankColor + "30" }]}>
              <Ionicons name={rankIcon as any} size={40} color={rankColor} />
            </View>
            <Text style={[styles.rankName, { color: C.text, fontFamily: "Inter_700Bold" }]}>{rank}</Text>
            <Text style={[styles.rankXp, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
              {state.xp} XP total
            </Text>
            {rank !== "Legend" && (
              <>
                <View style={[styles.xpTrack, { backgroundColor: C.border }]}>
                  <View
                    style={[
                      styles.xpFill,
                      {
                        width: `${Math.min(progress * 100, 100)}%` as any,
                        backgroundColor: rankColor,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.xpLabel, { color: C.textMuted, fontFamily: "Inter_400Regular" }]}>
                  {xpInfo.current} / {xpInfo.needed} XP to {xpInfo.nextRank}
                </Text>
              </>
            )}
          </View>

          {/* Quick Stats */}
          <View style={styles.quickStats}>
            <View style={[styles.quickStat, { backgroundColor: C.surface }]}>
              <Ionicons name="checkmark-circle" size={22} color={C.success} />
              <Text style={[styles.quickStatVal, { color: C.text, fontFamily: "Inter_700Bold" }]}>{totalCompleted}</Text>
              <Text style={[styles.quickStatLbl, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>Tasks Done</Text>
            </View>
            <View style={[styles.quickStat, { backgroundColor: C.surface }]}>
              <Ionicons name="flame" size={22} color="#FF6B35" />
              <Text style={[styles.quickStatVal, { color: C.text, fontFamily: "Inter_700Bold" }]}>{state.streak}</Text>
              <Text style={[styles.quickStatLbl, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>Streak</Text>
            </View>
            <View style={[styles.quickStat, { backgroundColor: C.surface }]}>
              <Ionicons name="sunny" size={22} color={C.warning} />
              <Text style={[styles.quickStatVal, { color: C.text, fontFamily: "Inter_700Bold" }]}>{perfectDays}</Text>
              <Text style={[styles.quickStatLbl, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>Perfect Days</Text>
            </View>
          </View>

          {/* Rank Ladder */}
          <Text style={[styles.sectionTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>Rank Ladder</Text>
          {RANKS.map((r) => {
            const isCurrentRank = r.name === rank;
            const isPassed = state.xp >= r.maxXp && r.maxXp !== Infinity;
            const rc = getRankColor(r.name);
            return (
              <View
                key={r.name}
                style={[
                  styles.rankRow,
                  { backgroundColor: C.surface, borderColor: isCurrentRank ? rc + "60" : C.border },
                  isCurrentRank && { borderWidth: 2 },
                ]}
              >
                <View style={[styles.rankDot, { backgroundColor: isPassed || isCurrentRank ? rc : C.border }]}>
                  {(isPassed || isCurrentRank) && (
                    <Ionicons name={getRankIcon(r.name) as any} size={14} color="#fff" />
                  )}
                </View>
                <Text style={[styles.rankRowName, { color: isCurrentRank ? rc : isPassed ? C.textSecondary : C.textMuted, fontFamily: isCurrentRank ? "Inter_700Bold" : "Inter_500Medium" }]}>
                  {r.name}
                </Text>
                <Text style={[styles.rankRowXp, { color: C.textMuted, fontFamily: "Inter_400Regular" }]}>
                  {r.maxXp === Infinity ? `${r.minXp}+ XP` : `${r.minXp} - ${r.maxXp} XP`}
                </Text>
                {isCurrentRank && (
                  <View style={[styles.currentBadge, { backgroundColor: rc + "20" }]}>
                    <Text style={[styles.currentBadgeText, { color: rc, fontFamily: "Inter_600SemiBold" }]}>Current</Text>
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}

      {subTab === "records" && (
        <>
          <View style={[styles.recordCard, { backgroundColor: C.surface }]}>
            <View style={styles.recordIcon}>
              <Ionicons name="trophy" size={24} color={C.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.recordTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>Best Day</Text>
              <Text style={[styles.recordValue, { color: C.primary, fontFamily: "Inter_600SemiBold" }]}>
                {bestDay.tasksCompleted} tasks completed
              </Text>
            </View>
          </View>

          <View style={[styles.recordCard, { backgroundColor: C.surface }]}>
            <View style={styles.recordIcon}>
              <Ionicons name="calendar" size={24} color={C.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.recordTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>Best Day Study</Text>
              <Text style={[styles.recordValue, { color: C.success, fontFamily: "Inter_600SemiBold" }]}>
                {formatDuration(bestWeek.mins)}
              </Text>
            </View>
          </View>

          <View style={[styles.recordCard, { backgroundColor: C.surface }]}>
            <View style={styles.recordIcon}>
              <Ionicons name="flame" size={24} color="#FF6B35" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.recordTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>Longest Streak</Text>
              <Text style={[styles.recordValue, { color: "#FF6B35", fontFamily: "Inter_600SemiBold" }]}>
                {state.streak} days
              </Text>
            </View>
          </View>

          <View style={[styles.recordCard, { backgroundColor: C.surface }]}>
            <View style={styles.recordIcon}>
              <Ionicons name="flash" size={24} color={C.physics} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.recordTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>Most Studied</Text>
              <Text style={[styles.recordValue, { color: C.physics, fontFamily: "Inter_600SemiBold" }]}>
                {subjectLabel[subjectHours[0] as string]} — {formatDuration(subjectHours[1] as number)}
              </Text>
            </View>
          </View>

          <View style={[styles.recordCard, { backgroundColor: C.surface }]}>
            <View style={styles.recordIcon}>
              <Ionicons name="star" size={24} color={C.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.recordTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>Perfect Days</Text>
              <Text style={[styles.recordValue, { color: C.warning, fontFamily: "Inter_600SemiBold" }]}>
                {perfectDays} days
              </Text>
            </View>
          </View>

          <View style={[styles.recordCard, { backgroundColor: C.surface }]}>
            <View style={styles.recordIcon}>
              <Ionicons name="time" size={24} color={C.chemistry} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.recordTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>Total Study Time</Text>
              <Text style={[styles.recordValue, { color: C.chemistry, fontFamily: "Inter_600SemiBold" }]}>
                {formatDuration(totalStudyMins)}
              </Text>
            </View>
          </View>
        </>
      )}

      {subTab === "achievements" && (
        <View style={styles.achievementGrid}>
          {state.achievements.map((a) => (
            <View
              key={a.id}
              style={[
                styles.achievementCard,
                { backgroundColor: C.surface, borderColor: a.unlocked ? C.primary + "40" : C.border },
                !a.unlocked && { opacity: 0.5 },
              ]}
            >
              <View
                style={[
                  styles.achievementIcon,
                  { backgroundColor: a.unlocked ? C.primaryLight : C.border + "40" },
                ]}
              >
                <Ionicons
                  name={a.icon as any}
                  size={26}
                  color={a.unlocked ? C.primary : C.textMuted}
                />
              </View>
              <Text
                style={[
                  styles.achievementTitle,
                  { color: a.unlocked ? C.text : C.textMuted, fontFamily: "Inter_600SemiBold" },
                ]}
                numberOfLines={1}
              >
                {a.title}
              </Text>
              <Text
                style={[styles.achievementDesc, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}
                numberOfLines={2}
              >
                {a.description}
              </Text>
              {a.unlocked && (
                <View style={[styles.unlockedBadge, { backgroundColor: C.success + "20" }]}>
                  <Ionicons name="checkmark" size={10} color={C.success} />
                  <Text style={[styles.unlockedText, { color: C.success, fontFamily: "Inter_600SemiBold" }]}>Unlocked</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 28 },
  settingsBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  subTabRow: {
    flexDirection: "row",
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
  },
  subTab: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: 10 },
  subTabActive: {},
  subTabText: { fontSize: 13 },
  rankCard: {
    alignItems: "center",
    padding: 28,
    borderRadius: 24,
    borderWidth: 1.5,
    marginBottom: 16,
    gap: 8,
  },
  rankBadge: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    marginBottom: 4,
  },
  rankName: { fontSize: 26 },
  rankXp: { fontSize: 14 },
  xpTrack: { width: "100%", height: 8, borderRadius: 4, overflow: "hidden", marginTop: 4 },
  xpFill: { height: "100%", borderRadius: 4 },
  xpLabel: { fontSize: 12 },
  quickStats: { flexDirection: "row", gap: 10, marginBottom: 20 },
  quickStat: {
    flex: 1,
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    gap: 4,
  },
  quickStatVal: { fontSize: 18 },
  quickStatLbl: { fontSize: 10 },
  sectionTitle: { fontSize: 17, marginBottom: 12 },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  rankDot: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  rankRowName: { flex: 1, fontSize: 15 },
  rankRowXp: { fontSize: 12 },
  currentBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  currentBadgeText: { fontSize: 11 },
  recordCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
  },
  recordIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  recordTitle: { fontSize: 14, marginBottom: 4 },
  recordValue: { fontSize: 15 },
  achievementGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  achievementCard: {
    width: "47.5%",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    gap: 6,
  },
  achievementIcon: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  achievementTitle: { fontSize: 13, textAlign: "center" },
  achievementDesc: { fontSize: 11, textAlign: "center", lineHeight: 15 },
  unlockedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 2,
  },
  unlockedText: { fontSize: 10 },
});
