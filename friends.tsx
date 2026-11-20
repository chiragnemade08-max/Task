import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useColorScheme,
  Platform,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TouchableOpacity,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useSocial, SocialUser } from "@/context/SocialContext";
import { useApp, todayString } from "@/context/AppContext";

type Tab = "leaderboard" | "add" | "requests";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).filter(Boolean).join("").toUpperCase().slice(0, 2) || "?";
}

function getRankName(xp: number): string {
  if (xp >= 1500) return "Legend";
  if (xp >= 1000) return "Master";
  if (xp >= 500) return "Warrior";
  if (xp >= 200) return "Grinder";
  return "Beginner";
}

function getRankIcon(xp: number): string {
  if (xp >= 1500) return "diamond";
  if (xp >= 1000) return "shield";
  if (xp >= 500) return "shield-outline";
  if (xp >= 200) return "trending-up";
  return "school-outline";
}

function getRankColor(xp: number): string {
  if (xp >= 1500) return "#F59F00";
  if (xp >= 1000) return "#9B59B6";
  if (xp >= 500) return "#FF6B35";
  if (xp >= 200) return "#1A6BFF";
  return "#2ECC71";
}

interface DerivedAchievement {
  title: string;
  icon: string;
  color: string;
}

function deriveAchievements(friend: SocialUser): DerivedAchievement[] {
  const list: DerivedAchievement[] = [];
  if (friend.tasks_completed >= 1)   list.push({ title: "First Step",      icon: "footsteps-outline",      color: "#2ECC71" });
  if (friend.xp >= 10)               list.push({ title: "XP Earned",        icon: "flash-outline",          color: "#F39C12" });
  if (friend.longest_streak >= 3)    list.push({ title: "On a Roll",        icon: "flame-outline",          color: "#FF6B35" });
  if (friend.tasks_completed >= 10)  list.push({ title: "Task Taker",       icon: "checkmark-circle-outline",color: "#1A6BFF" });
  if (friend.longest_streak >= 5)    list.push({ title: "5-Day Fire",       icon: "flame",                  color: "#FF5722" });
  if (friend.xp >= 200)              list.push({ title: "Grinder",          icon: "trending-up-outline",    color: "#1A6BFF" });
  if (friend.longest_streak >= 7)    list.push({ title: "Week Warrior",     icon: "calendar-outline",       color: "#9B59B6" });
  if (friend.study_hours >= 6)       list.push({ title: "Study Marathon",   icon: "timer-outline",          color: "#1ABC9C" });
  if (friend.tasks_completed >= 50)  list.push({ title: "Task Collector",   icon: "list-outline",           color: "#E74C3C" });
  if (friend.xp >= 500)              list.push({ title: "Warrior",          icon: "shield-outline",         color: "#FF6B35" });
  if (friend.longest_streak >= 10)   list.push({ title: "Decade Streak",    icon: "ribbon-outline",         color: "#F39C12" });
  if (friend.xp >= 1000)             list.push({ title: "Master",           icon: "shield",                 color: "#9B59B6" });
  if (friend.tasks_completed >= 100) list.push({ title: "Task Master",      icon: "medal-outline",          color: "#1A6BFF" });
  if (friend.xp >= 1500)             list.push({ title: "Legend",           icon: "diamond",                color: "#F59F00" });
  return list;
}

const FRIEND_SUBJECTS = [
  ["physics", "Physics", "#6C8CFF", "flash"],
  ["chemistry", "Chemistry", "#27D7B0", "flask"],
  ["mathematics", "Mathematics", "#F5B928", "calculator"],
  ["biology", "Biology", "#5CCB78", "leaf"],
  ["english", "English", "#D27CFF", "book"],
  ["computer_science", "Computer Science", "#4DB6FF", "laptop"],
  ["history", "History", "#E99B64", "time"],
  ["geography", "Geography", "#62C5A1", "earth"],
  ["homework", "Homework", "#FF7D9A", "document-text"],
  ["revision", "Revision", "#B88CFF", "refresh"],
  ["mock_test", "Mock Test", "#FF8066", "clipboard"],
  ["coaching", "Coaching", "#70A7FF", "school"],
  ["reading", "Reading", "#C48BFF", "book-outline"],
  ["exercise", "Exercise", "#35C98B", "fitness"],
  ["sleep", "Sleep", "#7185D9", "moon"],
  ["meal", "Meals", "#FF9B54", "restaurant"],
  ["break_time", "Break Time", "#A5B4C7", "cafe"],
  ["travel", "Travel", "#52B6C9", "car"],
  ["meeting", "Meeting", "#E487B8", "people"],
  ["other", "Other", "#9AA8BF", "ellipsis-horizontal"],
] as const;

function dateWithOffset(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatMinutes(minutes: number): string {
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : `${minutes}m`;
}

// ─── Avatar ──────────────────────────────────────────────────────────────────
function Avatar({ name, color, size = 44 }: { name: string; color: string; size?: number }) {
  return (
    <View style={[av.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
      <Text style={[av.initials, { fontSize: size * 0.36 }]}>{getInitials(name)}</Text>
    </View>
  );
}
const av = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center" },
  initials: { color: "#fff", fontFamily: "Inter_700Bold" },
});

// ─── Medal badge for positions 1-3 ───────────────────────────────────────────
function MedalBadge({ rank }: { rank: number }) {
  const color = rank === 1 ? "#FFD700" : rank === 2 ? "#C0C0C0" : rank === 3 ? "#CD7F32" : "#999";
  if (rank > 3) {
    return (
      <Text style={{ color: "#999", fontSize: 13, fontFamily: "Inter_600SemiBold", width: 28, textAlign: "center" }}>
        #{rank}
      </Text>
    );
  }
  return (
    <View style={{ width: 28, alignItems: "center" }}>
      <Ionicons name="trophy" size={22} color={color} />
    </View>
  );
}

// ─── Friend Profile Modal ─────────────────────────────────────────────────────
interface FriendProfileModalProps {
  friend: SocialUser | null;
  isDark: boolean;
  onClose: () => void;
}

function FriendProfileModal({ friend, isDark, onClose }: FriendProfileModalProps) {
  const C = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  if (!friend) return null;

  const achievements = deriveAchievements(friend);
  const rankName = getRankName(friend.xp);
  const rankIcon = getRankIcon(friend.xp);
  const rankColor = getRankColor(friend.xp);
  const studyStats = friend.study_stats;
  const totalMinutes = studyStats?.totalMinutes ?? Math.round(friend.study_hours * 60);
  const completedTasks = studyStats?.completedTasks ?? friend.tasks_completed;
  const dailyMinutes = studyStats?.dailyMinutes ?? {};
  const subjectMinutes = studyStats?.subjectMinutes ?? {};
  const rangeMinutes = (fromOffset: number, toOffset: number) => {
    let total = 0;
    for (let offset = fromOffset; offset <= toOffset; offset++) {
      total += dailyMinutes[dateWithOffset(offset)] || 0;
    }
    return total;
  };
  const periodStats = [
    { label: "Today", minutes: dailyMinutes[todayString()] || 0, color: "#2ECC71" },
    { label: "Yesterday", minutes: dailyMinutes[dateWithOffset(-1)] || 0, color: "#6C8CFF" },
    { label: "Last 7 Days", minutes: rangeMinutes(-7, -1), color: "#F5B928" },
    { label: "Last 30 Days", minutes: rangeMinutes(-30, -1), color: "#D27CFF" },
  ];
  const maxPeriodMinutes = Math.max(...periodStats.map((item) => item.minutes), 1);
  const subjectRows = FRIEND_SUBJECTS.map(([key, label, color, icon]) => ({
    key,
    label,
    color,
    icon,
    minutes: subjectMinutes[key] || 0,
  }));

  const displayName = friend.name.replace(" (You)", "");

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[pm.container, { backgroundColor: C.background }]}>
        {/* Header bar */}
        <View style={[pm.headerBar, { borderBottomColor: C.border, paddingTop: insets.top + 12 }]}>
          <Text style={[pm.headerTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>Profile</Text>
          <TouchableOpacity style={[pm.closeBtn, { backgroundColor: C.surface }]} onPress={onClose}>
            <Ionicons name="close" size={20} color={C.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[pm.scroll, { paddingBottom: insets.bottom + 32 }]}
        >
          {/* Avatar */}
          <View style={pm.avatarSection}>
            <View style={[pm.avatarWrap, { borderColor: rankColor + "40" }]}>
              <Avatar name={displayName} color={friend.avatar_color} size={90} />
            </View>
            <Text style={[pm.name, { color: C.text, fontFamily: "Inter_700Bold" }]}>{displayName}</Text>
            {friend.username ? (
              <View style={[pm.usernamePill, { backgroundColor: C.primary + "15" }]}>
                <Ionicons name="person-circle-outline" size={14} color={C.primary} />
                <Text style={[pm.usernameText, { color: C.primary, fontFamily: "Inter_600SemiBold" }]}>
                  @{friend.username}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Rank badge */}
          <View style={[pm.rankCard, { backgroundColor: rankColor + "12", borderColor: rankColor + "30" }]}>
            <Ionicons name={rankIcon as any} size={24} color={rankColor} />
            <Text style={[pm.rankName, { color: rankColor, fontFamily: "Inter_700Bold" }]}>{rankName}</Text>
            <Text style={[pm.rankXp, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
              {friend.xp} XP total
            </Text>
          </View>

          {/* Stats grid */}
          <Text style={[pm.sectionTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>Lifetime Stats</Text>
          <View style={pm.statsGrid}>
            <View style={[pm.statCard, { backgroundColor: C.surface }]}>
              <Ionicons name="star" size={20} color="#F39C12" />
              <Text style={[pm.statVal, { color: C.text, fontFamily: "Inter_700Bold" }]}>{friend.xp}</Text>
              <Text style={[pm.statLbl, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>Total XP</Text>
            </View>
            <View style={[pm.statCard, { backgroundColor: C.surface }]}>
              <Ionicons name="flame" size={20} color="#FF6B35" />
              <Text style={[pm.statVal, { color: C.text, fontFamily: "Inter_700Bold" }]}>{friend.streak}d</Text>
              <Text style={[pm.statLbl, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>Streak</Text>
            </View>
          </View>
          <View style={pm.statsGrid}>
            <View style={[pm.statCard, { backgroundColor: C.surface }]}>
              <Ionicons name="time" size={20} color="#2ECC71" />
              <Text style={[pm.statVal, { color: C.text, fontFamily: "Inter_700Bold" }]}>{formatMinutes(totalMinutes)}</Text>
              <Text style={[pm.statLbl, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>Total Study</Text>
            </View>
            <View style={[pm.statCard, { backgroundColor: C.surface }]}>
              <Ionicons name="checkmark-circle" size={20} color="#1A6BFF" />
              <Text style={[pm.statVal, { color: C.text, fontFamily: "Inter_700Bold" }]}>{completedTasks}</Text>
              <Text style={[pm.statLbl, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>Tasks Completed</Text>
            </View>
          </View>
          <View style={pm.statsGrid}>
            <View style={[pm.statCard, { backgroundColor: C.surface }]}>
              <Ionicons name="trending-up" size={20} color="#9B59B6" />
              <Text style={[pm.statVal, { color: C.text, fontFamily: "Inter_700Bold" }]}>{friend.longest_streak}d</Text>
              <Text style={[pm.statLbl, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>Best Streak</Text>
            </View>
            <View style={[pm.statCard, { backgroundColor: C.surface }]}>
              <Ionicons name="medal" size={20} color="#F59F00" />
              <Text style={[pm.statVal, { color: C.text, fontFamily: "Inter_700Bold" }]}>{achievements.length}</Text>
              <Text style={[pm.statLbl, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>Achievements</Text>
            </View>
          </View>

          {/* Study graph by period */}
          <Text style={[pm.sectionTitle, { color: C.text, fontFamily: "Inter_700Bold", marginTop: 8 }]}>
            Study Graph
          </Text>
          <View style={[pm.graphCard, { backgroundColor: C.surface }]}>
            <View style={pm.graphBars}>
              {periodStats.map((item) => (
                <View key={item.label} style={pm.graphColumn}>
                  <Text style={[pm.graphValue, { color: item.color, fontFamily: "Inter_700Bold" }]}>
                    {formatMinutes(item.minutes)}
                  </Text>
                  <View style={pm.graphTrack}>
                    <View
                      style={[
                        pm.graphFill,
                        {
                          height: `${Math.max(item.minutes ? (item.minutes / maxPeriodMinutes) * 100 : 4, 4)}%` as any,
                          backgroundColor: item.color,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[pm.graphLabel, { color: C.textSecondary, fontFamily: "Inter_500Medium" }]}>
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Subject breakdown */}
          <Text style={[pm.sectionTitle, { color: C.text, fontFamily: "Inter_700Bold", marginTop: 8 }]}>
            Subject-wise Study Hours
          </Text>
          <View style={[pm.subjectCard, { backgroundColor: C.surface }]}>
            {subjectRows.map((subject) => (
              <View key={subject.key} style={pm.subjectRow}>
                <View style={[pm.subjectIcon, { backgroundColor: subject.color + "20" }]}>
                  <Ionicons name={subject.icon as any} size={17} color={subject.color} />
                </View>
                <Text style={[pm.subjectName, { color: C.text, fontFamily: "Inter_500Medium" }]}>
                  {subject.label}
                </Text>
                <Text style={[pm.subjectTime, { color: subject.color, fontFamily: "Inter_700Bold" }]}>
                  {formatMinutes(subject.minutes)}
                </Text>
              </View>
            ))}
          </View>

          {/* Achievements */}
          {achievements.length > 0 && (
            <>
              <Text style={[pm.sectionTitle, { color: C.text, fontFamily: "Inter_700Bold", marginTop: 8 }]}>
                Achievements Unlocked
              </Text>
              <View style={pm.achieveGrid}>
                {achievements.map((a, i) => (
                  <View key={i} style={[pm.achieveChip, { backgroundColor: a.color + "15", borderColor: a.color + "30" }]}>
                    <Ionicons name={a.icon as any} size={18} color={a.color} />
                    <Text style={[pm.achieveTitle, { color: a.color, fontFamily: "Inter_600SemiBold" }]}>
                      {a.title}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {achievements.length === 0 && (
            <View style={[pm.noAchieve, { backgroundColor: C.surface }]}>
              <Ionicons name="ribbon-outline" size={32} color={C.textMuted} />
              <Text style={[pm.noAchieveText, { color: C.textMuted, fontFamily: "Inter_400Regular" }]}>
                No achievements yet
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const pm = StyleSheet.create({
  container: { flex: 1 },
  headerBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 20 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: 20, paddingTop: 24 },
  avatarSection: { alignItems: "center", marginBottom: 20, gap: 8 },
  avatarWrap: { borderRadius: 50, borderWidth: 3, padding: 3, marginBottom: 4 },
  name: { fontSize: 24, textAlign: "center" },
  usernamePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  usernameText: { fontSize: 14 },
  rankCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 24, justifyContent: "center" },
  rankName: { fontSize: 18 },
  rankXp: { fontSize: 13 },
  sectionTitle: { fontSize: 18, marginBottom: 12 },
  statsGrid: { flexDirection: "row", gap: 10, marginBottom: 10 },
  statCard: { flex: 1, alignItems: "center", padding: 14, borderRadius: 16, gap: 4 },
  statVal: { fontSize: 18 },
  statLbl: { fontSize: 10, textAlign: "center" },
  achieveGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  achieveChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  achieveTitle: { fontSize: 12 },
  noAchieve: { alignItems: "center", padding: 24, borderRadius: 16, gap: 8, marginTop: 4 },
  noAchieveText: { fontSize: 13 },
  graphCard: { borderRadius: 16, padding: 14 },
  graphBars: { height: 156, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-around", gap: 8 },
  graphColumn: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  graphValue: { fontSize: 10, minHeight: 14 },
  graphTrack: { height: 92, width: "72%", borderRadius: 6, backgroundColor: "rgba(127,147,190,0.16)", justifyContent: "flex-end", overflow: "hidden" },
  graphFill: { width: "100%", borderRadius: 6 },
  graphLabel: { fontSize: 9, textAlign: "center" },
  subjectCard: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  subjectRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 10 },
  subjectIcon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  subjectName: { flex: 1, fontSize: 13 },
  subjectTime: { fontSize: 12 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function FriendsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { profile, friends, requests, loading, addFriendByCode, addFriendByUsername, acceptRequest, rejectRequest, removeFriend, refreshFriends } = useSocial();
  const { state } = useApp();

  const [activeTab, setActiveTab] = useState<Tab>("leaderboard");
  const [addInput, setAddInput] = useState("");
  const [addMode, setAddMode] = useState<"code" | "username">("code");
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [leaderSort, setLeaderSort] = useState<"xp" | "streak" | "tasks">("xp");
  const [selectedFriend, setSelectedFriend] = useState<SocialUser | null>(null);

  const topPad = Platform.OS === "web" ? insets.top + 67 : insets.top;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshFriends();
    setRefreshing(false);
  }, [refreshFriends]);

  const handleAddFriend = useCallback(async () => {
    const val = addInput.trim();
    if (!val) return;
    setAdding(true);
    const result = addMode === "code"
      ? await addFriendByCode(val)
      : await addFriendByUsername(val);
    setAdding(false);
    Alert.alert(result.success ? "Success" : "Error", result.message);
    if (result.success) {
      setAddInput("");
      setActiveTab("leaderboard");
      await refreshFriends();
    }
  }, [addInput, addMode, addFriendByCode, addFriendByUsername, refreshFriends]);

  // Build leaderboard: friends + self entry with real app state
  const selfEntry: SocialUser | null = profile ? {
    device_id: profile.deviceId,
    name: profile.name + " (You)",
    username: profile.username || null,
    bio: profile.bio,
    avatar_color: profile.avatarColor,
    friend_code: profile.friendCode,
    xp: state.xp,
    streak: state.streak,
    study_hours: Math.round(
      (state.tasks.filter((t) => t.status === "completed").reduce((s, t) => s + t.duration, 0) / 60) * 10
    ) / 10,
    tasks_completed: state.tasks.filter((t) => t.status === "completed").length,
    longest_streak: state.streak,
  } : null;

  const allEntries = useMemo(() => {
    const list: SocialUser[] = selfEntry ? [selfEntry, ...friends] : [...friends];
    return list.sort((a, b) => {
      if (leaderSort === "xp") return b.xp - a.xp;
      if (leaderSort === "streak") return b.streak - a.streak;
      return b.tasks_completed - a.tasks_completed;
    });
  }, [friends, selfEntry, leaderSort]);

  const medalBorder = (rank: number) => {
    if (rank === 1) return { borderColor: "#FFD700", borderWidth: 2 };
    if (rank === 2) return { borderColor: "#C0C0C0", borderWidth: 1.5 };
    if (rank === 3) return { borderColor: "#CD7F32", borderWidth: 1.5 };
    return {};
  };

  return (
    <>
      <FriendProfileModal
        friend={selectedFriend}
        isDark={isDark}
        onClose={() => setSelectedFriend(null)}
      />

      <ScrollView
        style={[styles.container, { backgroundColor: C.background }]}
        contentContainerStyle={[styles.content, { paddingTop: topPad + 16, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.screenTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>Friends</Text>
            <Text style={[styles.subtitle, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
              {friends.length} friend{friends.length !== 1 ? "s" : ""}
            </Text>
          </View>
          <Pressable style={[styles.addBtn, { backgroundColor: C.primary }]} onPress={() => setActiveTab("add")}>
            <Ionicons name="person-add" size={16} color="#fff" />
            <Text style={[styles.addBtnText, { fontFamily: "Inter_600SemiBold" }]}>Add</Text>
          </Pressable>
        </View>

        {/* Tab Pills */}
        <View style={[styles.tabRow, { backgroundColor: C.surface }]}>
          {([
            { key: "leaderboard", label: "Leaderboard" },
            { key: "add",         label: "Add Friend" },
            { key: "requests",    label: requests.length > 0 ? `Requests (${requests.length})` : "Requests" },
          ] as const).map((t) => (
            <Pressable
              key={t.key}
              style={[styles.tabPill, activeTab === t.key && { backgroundColor: C.primary }]}
              onPress={() => setActiveTab(t.key)}
            >
              <Text style={[styles.tabPillText, { color: activeTab === t.key ? "#fff" : C.textSecondary, fontFamily: "Inter_500Medium" }]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── Leaderboard ── */}
        {activeTab === "leaderboard" && (
          <>
            {/* Sort buttons */}
            <View style={styles.sortRow}>
              {([
                { key: "xp",     label: "XP" },
                { key: "streak", label: "Streak" },
                { key: "tasks",  label: "Tasks" },
              ] as const).map((s) => (
                <Pressable
                  key={s.key}
                  style={[styles.sortBtn, { backgroundColor: leaderSort === s.key ? C.primary : C.surface, borderColor: C.border }]}
                  onPress={() => setLeaderSort(s.key)}
                >
                  <Text style={[styles.sortBtnText, { color: leaderSort === s.key ? "#fff" : C.textSecondary, fontFamily: "Inter_500Medium" }]}>
                    {s.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {loading ? (
              <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
            ) : allEntries.length <= 1 && !selfEntry ? (
              <View style={[styles.emptyBox, { backgroundColor: C.surface }]}>
                <Ionicons name="people-outline" size={48} color={C.textMuted} />
                <Text style={[styles.emptyTitle, { color: C.text, fontFamily: "Inter_600SemiBold" }]}>No friends yet</Text>
                <Text style={[styles.emptySubtitle, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
                  Add friends to see the leaderboard
                </Text>
                <Pressable style={[styles.emptyBtn, { backgroundColor: C.primary }]} onPress={() => setActiveTab("add")}>
                  <Ionicons name="person-add" size={16} color="#fff" />
                  <Text style={[styles.emptyBtnText, { fontFamily: "Inter_600SemiBold" }]}>Add a Friend</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.leaderList}>
                {allEntries.map((entry, i) => {
                  const isMe = entry.name.endsWith(" (You)");
                  const statVal = leaderSort === "xp"
                    ? `${entry.xp} XP`
                    : leaderSort === "streak"
                    ? `${entry.streak}d`
                    : `${entry.tasks_completed}`;
                  const sub1 = leaderSort !== "xp" ? `${entry.xp} XP` : `${entry.streak}d streak`;
                  const sub2 = leaderSort !== "tasks" ? `${entry.tasks_completed} tasks` : `${Math.round(entry.study_hours * 10) / 10}h study`;

                  return (
                    <Pressable
                      key={entry.device_id}
                      style={[
                        styles.leaderCard,
                        { backgroundColor: isMe ? C.primary + "10" : C.surface, borderColor: C.border },
                        medalBorder(i + 1),
                      ]}
                      onPress={() => !isMe && setSelectedFriend(entry)}
                    >
                      <MedalBadge rank={i + 1} />
                      <Avatar name={entry.name} color={entry.avatar_color} size={44} />
                      <View style={styles.friendInfo}>
                        <Text style={[styles.friendName, { color: C.text, fontFamily: "Inter_600SemiBold" }]} numberOfLines={1}>
                          {isMe ? "You" : entry.name}
                        </Text>
                        <Text style={[styles.friendMeta, { color: C.textMuted, fontFamily: "Inter_400Regular" }]}>
                          {getRankName(entry.xp)}
                          {entry.username ? `  ·  @${entry.username}` : ""}
                        </Text>
                      </View>
                      <View style={styles.statsCol}>
                        <Text style={[styles.statNum, { color: i === 0 ? "#FFD700" : i === 1 ? "#C0C0C0" : i === 2 ? "#CD7F32" : C.primary, fontFamily: "Inter_700Bold" }]}>
                          {statVal}
                        </Text>
                        <Text style={[styles.miniStat, { color: C.textMuted, fontFamily: "Inter_400Regular" }]}>
                          {sub1}  ·  {sub2}
                        </Text>
                      </View>
                      {!isMe && <Ionicons name="chevron-forward" size={16} color={C.textMuted} />}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}

        {/* ── Add Friend ── */}
        {activeTab === "add" && (
          <View style={styles.addSection}>
            <View style={[styles.modeToggle, { backgroundColor: C.surface }]}>
              <Pressable style={[styles.modeBtn, addMode === "code" && { backgroundColor: C.primary }]} onPress={() => setAddMode("code")}>
                <Text style={[styles.modeBtnText, { color: addMode === "code" ? "#fff" : C.textSecondary, fontFamily: "Inter_600SemiBold" }]}>Friend Code</Text>
              </Pressable>
              <Pressable style={[styles.modeBtn, addMode === "username" && { backgroundColor: C.primary }]} onPress={() => setAddMode("username")}>
                <Text style={[styles.modeBtnText, { color: addMode === "username" ? "#fff" : C.textSecondary, fontFamily: "Inter_600SemiBold" }]}>Username</Text>
              </Pressable>
            </View>

            <View style={[styles.inputCard, { backgroundColor: C.surface, borderColor: C.border }]}>
              {addMode === "username"
                ? <Text style={[styles.atPrefix, { color: C.primary, fontFamily: "Inter_700Bold" }]}>@</Text>
                : <Ionicons name="keypad-outline" size={20} color={C.primary} />}
              <TextInput
                style={[styles.addInput, { color: C.text, fontFamily: "Inter_500Medium" }]}
                placeholder={addMode === "code" ? "6-character code" : "username"}
                placeholderTextColor={C.textMuted}
                value={addInput}
                onChangeText={(v) =>
                  setAddInput(addMode === "code"
                    ? v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)
                    : v.toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 30))
                }
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={addMode === "code" ? 6 : 30}
                returnKeyType="send"
                onSubmitEditing={handleAddFriend}
              />
            </View>

            <Pressable
              style={[styles.sendBtn, { backgroundColor: addInput.trim() ? C.primary : C.surface, borderColor: C.border }]}
              onPress={handleAddFriend}
              disabled={adding || !addInput.trim()}
            >
              {adding ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="send" size={16} color={addInput.trim() ? "#fff" : C.textMuted} />
                  <Text style={[styles.sendBtnText, { color: addInput.trim() ? "#fff" : C.textMuted, fontFamily: "Inter_600SemiBold" }]}>
                    Send Request
                  </Text>
                </>
              )}
            </Pressable>

            {profile?.friendCode && (
              <View style={[styles.ownCodeBox, { backgroundColor: C.primaryLight }]}>
                <Text style={[styles.ownCodeLabel, { color: C.primary, fontFamily: "Inter_500Medium" }]}>
                  Your code: <Text style={{ fontFamily: "Inter_700Bold", letterSpacing: 2 }}>{profile.friendCode}</Text>
                </Text>
                <Text style={[styles.ownCodeHint, { color: C.primary + "99", fontFamily: "Inter_400Regular" }]}>
                  Share it so friends can add you
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── Requests ── */}
        {activeTab === "requests" && (
          <View style={styles.requestsSection}>
            {requests.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: C.surface }]}>
                <Ionicons name="mail-open-outline" size={48} color={C.textMuted} />
                <Text style={[styles.emptyTitle, { color: C.text, fontFamily: "Inter_600SemiBold" }]}>No pending requests</Text>
                <Text style={[styles.emptySubtitle, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
                  Friend requests will appear here
                </Text>
              </View>
            ) : (
              requests.map((req) => (
                <View key={req.id} style={[styles.requestCard, { backgroundColor: C.surface, borderColor: C.border }]}>
                  <Avatar name={req.name} color={req.avatar_color} size={46} />
                  <View style={styles.requestInfo}>
                    <Text style={[styles.requestName, { color: C.text, fontFamily: "Inter_600SemiBold" }]}>{req.name}</Text>
                    {req.username && (
                      <Text style={[styles.requestUsername, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
                        @{req.username}
                      </Text>
                    )}
                    <Text style={[styles.requestStats, { color: C.textMuted, fontFamily: "Inter_400Regular" }]}>
                      {req.xp} XP · {req.streak}d streak
                    </Text>
                  </View>
                  <View style={styles.requestActions}>
                    <Pressable style={[styles.acceptBtn, { backgroundColor: C.success }]} onPress={() => acceptRequest(req.id)}>
                      <Ionicons name="checkmark" size={18} color="#fff" />
                    </Pressable>
                    <Pressable style={[styles.rejectBtn, { backgroundColor: C.surface, borderColor: C.border }]} onPress={() => rejectRequest(req.id)}>
                      <Ionicons name="close" size={18} color={C.danger} />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  screenTitle: { fontSize: 28 },
  subtitle: { fontSize: 13, marginTop: 2 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20 },
  addBtnText: { color: "#fff", fontSize: 14 },
  tabRow: { flexDirection: "row", borderRadius: 14, padding: 4, gap: 2, marginBottom: 20 },
  tabPill: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
  tabPillText: { fontSize: 11 },
  sortRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  sortBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  sortBtnText: { fontSize: 13 },
  emptyBox: { alignItems: "center", padding: 36, borderRadius: 20, gap: 10, marginTop: 10 },
  emptyTitle: { fontSize: 18 },
  emptySubtitle: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 14, marginTop: 4 },
  emptyBtnText: { color: "#fff", fontSize: 14 },
  leaderList: { gap: 10 },
  leaderCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  friendInfo: { flex: 1 },
  friendName: { fontSize: 14 },
  friendMeta: { fontSize: 11, marginTop: 2 },
  statsCol: { alignItems: "flex-end", maxWidth: 100 },
  statNum: { fontSize: 15 },
  miniStat: { fontSize: 10, textAlign: "right", marginTop: 2 },
  addSection: { gap: 14 },
  modeToggle: { flexDirection: "row", borderRadius: 14, padding: 4, gap: 4 },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  modeBtnText: { fontSize: 14 },
  inputCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 16, borderWidth: 1 },
  atPrefix: { fontSize: 18 },
  addInput: { flex: 1, fontSize: 16 },
  sendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 16, borderWidth: 1 },
  sendBtnText: { fontSize: 15 },
  ownCodeBox: { padding: 16, borderRadius: 16, alignItems: "center" },
  ownCodeLabel: { fontSize: 15 },
  ownCodeHint: { fontSize: 12, marginTop: 4 },
  requestsSection: { gap: 10 },
  requestCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  requestInfo: { flex: 1 },
  requestName: { fontSize: 15 },
  requestUsername: { fontSize: 12, marginTop: 1 },
  requestStats: { fontSize: 11, marginTop: 2 },
  requestActions: { flexDirection: "row", gap: 8 },
  acceptBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  rejectBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1 },
});
