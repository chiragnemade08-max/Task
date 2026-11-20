import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useColorScheme,
  Platform,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  FadeInUp,
  FadeOutUp,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import {
  useApp,
  formatTime12,
  formatDuration,
  getSubjectIcon,
  getTaskColor,
  Task,
} from "@/context/AppContext";

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// ─── Edit Task Modal ─────────────────────────────────────────────────────────
interface EditTaskModalProps {
  task: Task | null;
  isDark: boolean;
  onSave: (id: string, title: string, start: string, end: string) => void;
  onClose: () => void;
}

function EditTaskModal({ task, isDark, onSave, onClose }: EditTaskModalProps) {
  const C = isDark ? Colors.dark : Colors.light;
  const [title, setTitle] = useState(task?.title ?? "");
  const [start, setStart] = useState(task?.startTime ?? "");
  const [end, setEnd] = useState(task?.endTime ?? "");

  if (!task) return null;

  const handleSave = () => {
    const timeRe = /^\d{1,2}:\d{2}$/;
    if (!timeRe.test(start.trim()) || !timeRe.test(end.trim())) {
      Alert.alert("Invalid time", "Use 24h format, e.g. 14:30");
      return;
    }
    const padded = (t: string) => t.trim().length === 4 ? "0" + t.trim() : t.trim();
    onSave(task.id, title.trim() || task.title, padded(start), padded(end));
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
          <Pressable style={[styles.modalCard, { backgroundColor: C.surface }]} onPress={() => {}}>
            <Text style={[styles.modalTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>Edit Task</Text>

            {/* Title field */}
            <View>
              <Text style={[styles.modalFieldLabel, { color: C.textSecondary, fontFamily: "Inter_600SemiBold" }]}>TASK NAME</Text>
              <TextInput
                style={[styles.modalTitleInput, { color: C.text, borderColor: C.border, backgroundColor: C.background, fontFamily: "Inter_500Medium" }]}
                value={title}
                onChangeText={setTitle}
                placeholder="Task name"
                placeholderTextColor={C.textMuted}
                returnKeyType="done"
              />
            </View>

            {/* Time fields */}
            <View style={styles.modalTimeRow}>
              <View style={styles.modalTimeField}>
                <Text style={[styles.modalFieldLabel, { color: C.textSecondary, fontFamily: "Inter_600SemiBold" }]}>START</Text>
                <TextInput
                  style={[styles.modalInput, { color: C.text, borderColor: C.border, backgroundColor: C.background, fontFamily: "Inter_600SemiBold" }]}
                  value={start}
                  onChangeText={setStart}
                  placeholder="14:00"
                  placeholderTextColor={C.textMuted}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  selectTextOnFocus
                />
              </View>
              <Ionicons name="arrow-forward" size={16} color={C.textMuted} style={{ marginTop: 24 }} />
              <View style={styles.modalTimeField}>
                <Text style={[styles.modalFieldLabel, { color: C.textSecondary, fontFamily: "Inter_600SemiBold" }]}>END</Text>
                <TextInput
                  style={[styles.modalInput, { color: C.text, borderColor: C.border, backgroundColor: C.background, fontFamily: "Inter_600SemiBold" }]}
                  value={end}
                  onChangeText={setEnd}
                  placeholder="15:00"
                  placeholderTextColor={C.textMuted}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  selectTextOnFocus
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable style={[styles.modalCancelBtn, { borderColor: C.border }]} onPress={onClose}>
                <Text style={[styles.modalCancelText, { color: C.text, fontFamily: "Inter_600SemiBold" }]} numberOfLines={1}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalSaveBtn, { backgroundColor: C.primary }]} onPress={handleSave}>
                <Text style={[styles.modalSaveText, { fontFamily: "Inter_700Bold" }]}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ─── Task Card ────────────────────────────────────────────────────────────────
interface TaskCardProps {
  task: Task;
  isCurrent?: boolean;
  onComplete: (id: string) => void;
  onSkip: (id: string) => void;
  onLongPress: (task: Task) => void;
  isDark: boolean;
}

function TaskCard({ task, isCurrent, onComplete, onSkip, onLongPress, isDark }: TaskCardProps) {
  const C = isDark ? Colors.dark : Colors.light;
  const color = getTaskColor(task.title, task.subject);
  const icon = getSubjectIcon(task.subject);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleComplete = () => {
    scale.value = withSequence(withSpring(0.96), withSpring(1));
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onComplete(task.id);
  };

  const handleSkip = () => {
    scale.value = withSequence(withSpring(0.96), withSpring(1));
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSkip(task.id);
  };

  const handleLongPress = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress(task);
  };

  const isCompleted = task.status === "completed";
  const isSkipped = task.status === "skipped";
  const isDone = isCompleted || isSkipped;

  if (!isCurrent) {
    return (
      <Pressable
        onLongPress={handleLongPress}
        delayLongPress={400}
        style={[
          styles.scheduleItem,
          { backgroundColor: C.surface, borderColor: C.border, borderLeftColor: color, borderLeftWidth: 4 },
          isDone && { opacity: 0.55 },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.scheduleTitle,
              { color: C.text, fontFamily: "Inter_600SemiBold" },
              isDone && { textDecorationLine: "line-through", color: C.textMuted },
            ]}
            numberOfLines={1}
          >
            {task.title}
          </Text>
          <View style={styles.scheduleMetaRow}>
            <Ionicons name={icon as any} size={11} color={color} />
            <Text style={[styles.scheduleTime, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
              {formatTime12(task.startTime)} – {formatTime12(task.endTime)} · {formatDuration(task.duration)}
            </Text>
          </View>
          {!!task.notes && (
            <Text style={{ color: C.textMuted, fontSize: 10, marginTop: 3 }} numberOfLines={1}>
              {task.notes}
            </Text>
          )}
        </View>
        {isCompleted && <Ionicons name="checkmark-circle" size={20} color={C.success} />}
        {isSkipped && <Ionicons name="close-circle" size={20} color={C.danger} />}
        {!isDone && (
          <Ionicons name="ellipsis-horizontal" size={18} color={C.textMuted} />
        )}
      </Pressable>
    );
  }

  return (
    <Animated.View style={animatedStyle}>
      <Pressable onLongPress={handleLongPress} delayLongPress={400}>
        <View style={[styles.currentCard, { backgroundColor: color }]}>
          <View style={styles.currentCardHeader}>
            <Ionicons name={icon as any} size={16} color="rgba(255,255,255,0.8)" />
            <Text style={[styles.currentCardTime, { fontFamily: "Inter_500Medium" }]}>
              {formatTime12(task.startTime)} – {formatTime12(task.endTime)} ({formatDuration(task.duration)})
            </Text>
          </View>
          <Text style={[styles.currentCardTitle, { fontFamily: "Inter_700Bold" }]} numberOfLines={2}>
            {task.title}
          </Text>
          {!!task.notes && (
            <Text style={{ color: "rgba(255,255,255,0.82)", fontSize: 11, marginTop: 4 }} numberOfLines={2}>
              {task.notes}
            </Text>
          )}
          <View style={styles.currentCardActions}>
            <Pressable style={styles.completeBtn} onPress={handleComplete} testID="complete-btn">
              <Ionicons name="checkmark-circle" size={18} color={color} />
              <Text style={[styles.completeBtnText, { color, fontFamily: "Inter_600SemiBold" }]}>Complete</Text>
            </Pressable>
            <Pressable style={styles.skipBtn} onPress={handleSkip} testID="skip-btn">
              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.8)" />
              <Text style={[styles.skipBtnText, { fontFamily: "Inter_500Medium" }]}>Skip</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Up Next Card ─────────────────────────────────────────────────────────────
function UpNextCard({ task, isDark }: { task: Task; isDark: boolean }) {
  const C = isDark ? Colors.dark : Colors.light;
  const color = getTaskColor(task.title, task.subject);
  const icon = getSubjectIcon(task.subject);
  return (
    <View style={[styles.upNextCard, { backgroundColor: C.surface, borderColor: C.border }]}>
      <View style={[styles.upNextAccent, { backgroundColor: color }]} />
      <View style={[styles.upNextIconWrap, { backgroundColor: color + "20" }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.upNextTitle, { color: C.text, fontFamily: "Inter_600SemiBold" }]} numberOfLines={1}>
          {task.title}
        </Text>
        <Text style={[styles.upNextTime, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
          {formatTime12(task.startTime)} – {formatTime12(task.endTime)} · {formatDuration(task.duration)}
        </Text>
      </View>
    </View>
  );
}

// ─── Home Screen ──────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { getTodayTasks, completeTask, skipTask, updateTask, state } = useApp();

  const [editTask, setEditTask] = useState<Task | null>(null);
  const [celebrationXP, setCelebrationXP] = useState<number | null>(null);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerCelebration = useCallback((xp: number) => {
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    setCelebrationXP(xp);
    celebrationTimer.current = setTimeout(() => setCelebrationXP(null), 2000);
  }, []);

  const handleComplete = useCallback((id: string) => {
    const beforePending = getTodayTasks().filter((t) => t.status === "pending").length;
    completeTask(id);
    const isPerfectDay = beforePending === 1 &&
      getTodayTasks().filter((t) => t.status !== "pending").length === getTodayTasks().length - 1;
    triggerCelebration(isPerfectDay ? 50 : 5);
  }, [completeTask, getTodayTasks, triggerCelebration]);

  const tasks = getTodayTasks();
  const completed = tasks.filter((t) => t.status === "completed").length;
  const total = tasks.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  const pendingTasks = useMemo(() => tasks.filter((t) => t.status === "pending"), [tasks]);
  const currentTask = pendingTasks[0] ?? null;
  const upNextTask = pendingTasks[1] ?? null;

  const topPad = Platform.OS === "web" ? insets.top + 67 : insets.top;

  const handleLongPress = useCallback((task: Task) => {
    Alert.alert(
      task.title,
      `${formatTime12(task.startTime)} – ${formatTime12(task.endTime)}`,
      [
        ...(task.status !== "completed" ? [{
          text: "Complete",
          onPress: () => {
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            handleComplete(task.id);
          },
        }] : []),
        ...(task.status !== "skipped" ? [{
          text: "Skip",
          style: "destructive" as const,
          onPress: () => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            skipTask(task.id);
          },
        }] : []),
        {
          text: "Edit Task",
          onPress: () => setEditTask(task),
        },
        { text: "Cancel", style: "cancel" as const },
      ]
    );
  }, [completeTask, skipTask]);

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: C.background }]}
        contentContainerStyle={[styles.content, { paddingTop: topPad + 16, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.dateText, { color: C.textSecondary, fontFamily: "Inter_500Medium" }]}>
              {todayLabel()}
            </Text>
            <Text style={[styles.appTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>Today</Text>
          </View>
          <Pressable
            style={[styles.createBtn, { backgroundColor: C.primary }]}
            onPress={() => router.push("/create-timetable")}
            testID="create-btn"
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={[styles.createBtnText, { fontFamily: "Inter_600SemiBold" }]}>Create</Text>
          </Pressable>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: C.surface }]}>
            <Ionicons name="flame" size={20} color="#FF6B35" />
            <Text style={[styles.statValue, { color: C.text, fontFamily: "Inter_700Bold" }]}>{state.streak}</Text>
            <Text style={[styles.statLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>Day Streak</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: C.surface }]}>
            <Ionicons name="checkmark-circle" size={20} color={C.success} />
            <Text style={[styles.statValue, { color: C.text, fontFamily: "Inter_700Bold" }]}>{completed}/{total}</Text>
            <Text style={[styles.statLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>Completed</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: C.surface }]}>
            <Ionicons name="trending-up" size={20} color={C.primary} />
            <Text style={[styles.statValue, { color: C.text, fontFamily: "Inter_700Bold" }]}>{progress}%</Text>
            <Text style={[styles.statLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>Progress</Text>
          </View>
        </View>

        {/* Progress Bar */}
        {total > 0 && (
          <View style={[styles.progressContainer, { backgroundColor: C.surface }]}>
            <View style={styles.progressHeader}>
              <Text style={[styles.progressLabel, { color: C.text, fontFamily: "Inter_600SemiBold" }]}>Daily Progress</Text>
              <Text style={[styles.progressPct, { color: C.primary, fontFamily: "Inter_700Bold" }]}>{progress}%</Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: C.border }]}>
              <View style={[styles.progressFill, { width: `${progress}%` as any, backgroundColor: C.primary }]} />
            </View>
          </View>
        )}

        {/* No tasks */}
        {tasks.length === 0 && (
          <View style={[styles.emptyState, { backgroundColor: C.surface }]}>
            <Ionicons name="calendar-outline" size={48} color={C.textMuted} />
            <Text style={[styles.emptyTitle, { color: C.text, fontFamily: "Inter_600SemiBold" }]}>No Plan for Today</Text>
            <Text style={[styles.emptySubtitle, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
              Create a timetable to start tracking your schedule
            </Text>
            <Pressable
              style={[styles.emptyBtn, { backgroundColor: C.primary }]}
              onPress={() => router.push("/create-timetable")}
            >
              <Text style={[styles.emptyBtnText, { fontFamily: "Inter_600SemiBold" }]}>Create Plan</Text>
            </Pressable>
          </View>
        )}

        {/* Current Activity */}
        {currentTask && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="flame" size={18} color="#FF6B35" />
              <Text style={[styles.sectionTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>Current Activity</Text>
            </View>
            <TaskCard task={currentTask} isCurrent onComplete={handleComplete} onSkip={skipTask} onLongPress={handleLongPress} isDark={isDark} />
          </View>
        )}

        {/* Up Next */}
        {upNextTask && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="alarm-outline" size={18} color={C.primary} />
              <Text style={[styles.sectionTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>Up Next</Text>
            </View>
            <UpNextCard task={upNextTask} isDark={isDark} />
          </View>
        )}

        {/* Full Schedule */}
        {tasks.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="list-outline" size={18} color={C.textSecondary} />
              <Text style={[styles.sectionTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>Full Schedule</Text>
              <Text style={[styles.sectionHint, { color: C.textMuted, fontFamily: "Inter_400Regular" }]}>hold to edit</Text>
            </View>
            <View style={styles.scheduleList}>
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  isCurrent={false}
                  onComplete={handleComplete}
                  onSkip={skipTask}
                  onLongPress={handleLongPress}
                  isDark={isDark}
                />
              ))}
            </View>
          </View>
        )}

        {/* All done */}
        {tasks.length > 0 && pendingTasks.length === 0 && (
          <View style={[styles.allDoneCard, { backgroundColor: C.primaryLight }]}>
            <Ionicons name="checkmark-circle" size={32} color={C.primary} />
            <Text style={[styles.allDoneText, { color: C.primary, fontFamily: "Inter_700Bold" }]}>
              All tasks completed!
            </Text>
            <Text style={[styles.allDoneSubtext, { color: C.primary + "99", fontFamily: "Inter_400Regular" }]}>
              Great work today. Keep it up!
            </Text>
          </View>
        )}
      </ScrollView>

      {/* XP Celebration Popup */}
      {celebrationXP !== null && (
        <Animated.View
          key={`xp-${celebrationXP}-${Date.now()}`}
          entering={FadeInUp.duration(300).springify()}
          exiting={FadeOutUp.duration(400)}
          style={[
            styles.celebrationPill,
            { backgroundColor: celebrationXP >= 50 ? "#FF6B35" : C.success, bottom: insets.bottom + 110 },
          ]}
          pointerEvents="none"
        >
          <Ionicons name="star" size={16} color="#fff" />
          <Text style={[styles.celebrationText, { fontFamily: "Inter_700Bold" }]}>
            +{celebrationXP} XP{celebrationXP >= 50 ? "  Perfect Day!" : ""}
          </Text>
        </Animated.View>
      )}

      {/* Edit Task Modal */}
      {editTask && (
        <EditTaskModal
          key={editTask.id}
          task={editTask}
          isDark={isDark}
          onSave={updateTask}
          onClose={() => setEditTask(null)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  dateText: { fontSize: 13 },
  appTitle: { fontSize: 28, marginTop: 2 },
  createBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20 },
  createBtnText: { color: "#fff", fontSize: 14 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statCard: { flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: 16, gap: 4 },
  statValue: { fontSize: 18 },
  statLabel: { fontSize: 11 },
  progressContainer: { borderRadius: 16, padding: 16, marginBottom: 20 },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  progressLabel: { fontSize: 14 },
  progressPct: { fontSize: 14 },
  progressTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4 },
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 17, flex: 1 },
  sectionHint: { fontSize: 11 },
  currentCard: { borderRadius: 20, padding: 18, gap: 8 },
  currentCardHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  currentCardTime: { color: "rgba(255,255,255,0.85)", fontSize: 13 },
  currentCardTitle: { color: "#fff", fontSize: 20, lineHeight: 26 },
  currentCardActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  completeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#fff", borderRadius: 12, paddingVertical: 11 },
  completeBtnText: { fontSize: 14 },
  skipBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 12, paddingVertical: 11 },
  skipBtnText: { color: "rgba(255,255,255,0.9)", fontSize: 14 },
  upNextCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  upNextAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  upNextIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  upNextTitle: { fontSize: 15, marginBottom: 2 },
  upNextTime: { fontSize: 12 },
  scheduleList: { gap: 8 },
  scheduleItem: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  subjectDot: { width: 10, height: 10, borderRadius: 5 },
  scheduleMetaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  scheduleTitle: { fontSize: 14, marginBottom: 2 },
  scheduleTime: { fontSize: 12 },
  emptyState: { alignItems: "center", padding: 32, borderRadius: 20, gap: 12, marginTop: 20 },
  emptyTitle: { fontSize: 18 },
  emptySubtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  emptyBtn: { paddingHorizontal: 28, paddingVertical: 13, borderRadius: 14, marginTop: 4 },
  emptyBtnText: { color: "#fff", fontSize: 15 },
  allDoneCard: { alignItems: "center", padding: 28, borderRadius: 20, gap: 8, marginTop: 4 },
  allDoneText: { fontSize: 18 },
  allDoneSubtext: { fontSize: 14 },
  celebrationPill: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  celebrationText: { color: "#fff", fontSize: 16 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", paddingHorizontal: 20 },
  modalCard: { width: "100%", borderRadius: 24, padding: 22, gap: 14 },
  modalTitle: { fontSize: 20 },
  modalTitleInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  modalTimeRow: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  modalTimeField: { flex: 1, minWidth: 100 },
  modalFieldLabel: { fontSize: 10, letterSpacing: 0.8, marginBottom: 6 },
  modalInput: { borderWidth: 1, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 8, fontSize: 20, textAlign: "center", fontVariant: ["tabular-nums"] as any },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 4 },
  modalCancelBtn: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  modalCancelText: { fontSize: 15 },
  modalSaveBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  modalSaveText: { color: "#fff", fontSize: 15 },
});
