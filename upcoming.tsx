import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useColorScheme,
  Platform,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useApp, formatTime12, formatDuration, getTaskColor, Task } from "@/context/AppContext";

/** Local date string — never use toISOString() which returns UTC */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getUpcomingDates(): { label: string; date: string; isToday: boolean; isTomorrow: boolean }[] {
  const dates = [];
  for (let i = 0; i <= 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = localDateStr(d);
    const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    dates.push({ label, date: dateStr, isToday: i === 0, isTomorrow: i === 1 });
  }
  return dates;
}

// ─── Edit Task Modal ──────────────────────────────────────────────────────────
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
      <Pressable style={mStyles.overlay} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
          <Pressable style={[mStyles.card, { backgroundColor: C.surface }]} onPress={() => {}}>
            <Text style={[mStyles.title, { color: C.text, fontFamily: "Inter_700Bold" }]}>Edit Task</Text>

            <View>
              <Text style={[mStyles.label, { color: C.textSecondary, fontFamily: "Inter_600SemiBold" }]}>TASK NAME</Text>
              <TextInput
                style={[mStyles.titleInput, { color: C.text, borderColor: C.border, backgroundColor: C.background, fontFamily: "Inter_500Medium" }]}
                value={title}
                onChangeText={setTitle}
                placeholder="Task name"
                placeholderTextColor={C.textMuted}
                returnKeyType="done"
              />
            </View>

            <View style={mStyles.timeRow}>
              <View style={mStyles.timeField}>
                <Text style={[mStyles.label, { color: C.textSecondary, fontFamily: "Inter_600SemiBold" }]}>START</Text>
                <TextInput
                  style={[mStyles.timeInput, { color: C.text, borderColor: C.border, backgroundColor: C.background, fontFamily: "Inter_600SemiBold" }]}
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
              <View style={mStyles.timeField}>
                <Text style={[mStyles.label, { color: C.textSecondary, fontFamily: "Inter_600SemiBold" }]}>END</Text>
                <TextInput
                  style={[mStyles.timeInput, { color: C.text, borderColor: C.border, backgroundColor: C.background, fontFamily: "Inter_600SemiBold" }]}
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

            <View style={mStyles.actions}>
              <Pressable style={[mStyles.cancelBtn, { borderColor: C.border }]} onPress={onClose}>
                <Text style={[mStyles.cancelText, { color: C.text, fontFamily: "Inter_600SemiBold" }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[mStyles.saveBtn, { backgroundColor: C.primary }]} onPress={handleSave}>
                <Text style={[mStyles.saveText, { fontFamily: "Inter_700Bold" }]}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const mStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", paddingHorizontal: 20 },
  card: { width: "100%", borderRadius: 24, padding: 22, gap: 14 },
  title: { fontSize: 20 },
  label: { fontSize: 10, letterSpacing: 0.8, marginBottom: 6 },
  titleInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  timeRow: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  timeField: { flex: 1, minWidth: 100 },
  timeInput: { borderWidth: 1, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 8, fontSize: 20, textAlign: "center" },
  actions: { flexDirection: "row", gap: 12, marginTop: 4 },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  cancelText: { fontSize: 15 },
  saveBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  saveText: { color: "#fff", fontSize: 15 },
});

// ─── Upcoming Screen ──────────────────────────────────────────────────────────
export default function UpcomingScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { state, getTasksForDate, updateTask } = useApp();

  const [selectedDate, setSelectedDate] = useState<string>(localDateStr(new Date()));
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const upcomingDates = useMemo(() => getUpcomingDates(), []);
  const tasks = useMemo(() => getTasksForDate(selectedDate), [selectedDate, state.tasks]);
  const topPad = Platform.OS === "web" ? insets.top + 67 : insets.top;

  const selectedInfo = upcomingDates.find((d) => d.date === selectedDate);

  const handleLongPress = useCallback((task: Task) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEditingTask(task);
  }, []);

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: C.background }]}
        contentContainerStyle={[styles.content, { paddingTop: topPad + 16, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: C.text, fontFamily: "Inter_700Bold" }]}>Upcoming</Text>
            <Text style={[styles.subtitle, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
              Your future schedule
            </Text>
          </View>
          <Pressable
            style={[styles.createBtn, { backgroundColor: C.primary }]}
            onPress={() => router.push("/create-timetable")}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={[styles.createBtnText, { fontFamily: "Inter_600SemiBold" }]}>Create</Text>
          </Pressable>
        </View>

        {/* Date Selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateScroll}
        >
          {upcomingDates.map((d) => {
            const hasTask = getTasksForDate(d.date).length > 0;
            const isSelected = d.date === selectedDate;
            return (
              <Pressable
                key={d.date}
                style={[
                  styles.datePill,
                  { backgroundColor: isSelected ? C.primary : C.surface, borderColor: C.border },
                ]}
                onPress={() => setSelectedDate(d.date)}
              >
                <Text
                  style={[
                    styles.datePillText,
                    { color: isSelected ? "#fff" : C.textSecondary, fontFamily: "Inter_500Medium" },
                  ]}
                >
                  {d.isToday ? "Today" : d.isTomorrow ? "Tomorrow" : d.label}
                </Text>
                {hasTask && (
                  <View style={[styles.taskDot, { backgroundColor: isSelected ? "rgba(255,255,255,0.7)" : C.primary }]} />
                )}
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Selected date info */}
        <View style={styles.selectedDateHeader}>
          <Text style={[styles.selectedDateLabel, { color: C.text, fontFamily: "Inter_700Bold" }]}>
            {selectedInfo?.isToday ? "Today" : selectedInfo?.isTomorrow ? "Tomorrow" : selectedInfo?.label}
          </Text>
          {tasks.length > 0 && (
            <View style={[styles.taskBadge, { backgroundColor: C.primaryLight }]}>
              <Text style={[styles.taskBadgeText, { color: C.primary, fontFamily: "Inter_600SemiBold" }]}>
                {tasks.length} tasks
              </Text>
            </View>
          )}
        </View>

        {/* Task list */}
        {tasks.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: C.surface }]}>
            <Ionicons name="calendar-outline" size={44} color={C.textMuted} />
            <Text style={[styles.emptyTitle, { color: C.text, fontFamily: "Inter_600SemiBold" }]}>
              No Schedule
            </Text>
            <Text style={[styles.emptySubtitle, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
              {selectedInfo?.isToday
                ? "Create today's plan to get started"
                : selectedInfo?.isTomorrow
                ? "Plan your tomorrow for a productive day"
                : `No tasks planned for this date`}
            </Text>
            <Pressable
              style={[styles.emptyBtn, { backgroundColor: C.primary }]}
              onPress={() => router.push("/create-timetable")}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={[styles.emptyBtnText, { fontFamily: "Inter_600SemiBold" }]}>Create Plan</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.taskList}>
            {tasks.map((task) => {
              const color = getTaskColor(task.title, task.subject);
              const isCompleted = task.status === "completed";
              const isSkipped = task.status === "skipped";
              const isPending = !isCompleted && !isSkipped;
              return (
                <Pressable
                  key={task.id}
                  onLongPress={() => handleLongPress(task)}
                  delayLongPress={300}
                  style={[
                    styles.taskItem,
                    { backgroundColor: C.surface, borderColor: C.border },
                    (isCompleted || isSkipped) && { opacity: 0.6 },
                  ]}
                >
                  <View style={[styles.taskAccent, { backgroundColor: color }]} />
                  <View style={{ flex: 1, paddingLeft: 12 }}>
                    <Text
                      style={[
                        styles.taskTitle,
                        { color: C.text, fontFamily: "Inter_600SemiBold" },
                        isSkipped && { textDecorationLine: "line-through", color: C.textMuted },
                      ]}
                      numberOfLines={2}
                    >
                      {task.title}
                    </Text>
                    <Text style={[styles.taskTime, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
                      {formatTime12(task.startTime)} - {formatTime12(task.endTime)} · {formatDuration(task.duration)}
                    </Text>
                    {!!task.notes && (
                      <Text style={{ color: C.textMuted, fontSize: 11, marginTop: 3 }} numberOfLines={2}>
                        {task.notes}
                      </Text>
                    )}
                  </View>
                  {isCompleted && <Ionicons name="checkmark-circle" size={20} color={C.success} />}
                  {isSkipped && <Ionicons name="close-circle" size={20} color={C.danger} />}
                  {isPending && (
                    <Pressable
                      style={styles.editBtn}
                      onPress={() => handleLongPress(task)}
                      hitSlop={8}
                    >
                      <Ionicons name="create-outline" size={18} color={C.textMuted} />
                    </Pressable>
                  )}
                </Pressable>
              );
            })}
            <Text style={[styles.holdHint, { color: C.textMuted, fontFamily: "Inter_400Regular" }]}>
              Tap pencil or hold to edit
            </Text>
          </View>
        )}

        {/* Summary when tasks exist */}
        {tasks.length > 0 && (
          <View style={[styles.summaryCard, { backgroundColor: C.surface }]}>
            <View style={styles.summaryItem}>
              <Ionicons name="list-outline" size={18} color={C.primary} />
              <Text style={[styles.summaryValue, { color: C.text, fontFamily: "Inter_700Bold" }]}>{tasks.length}</Text>
              <Text style={[styles.summaryLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>Total Tasks</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: C.border }]} />
            <View style={styles.summaryItem}>
              <Ionicons name="time-outline" size={18} color={C.success} />
              <Text style={[styles.summaryValue, { color: C.text, fontFamily: "Inter_700Bold" }]}>
                {Math.floor(tasks.reduce((a, t) => a + t.duration, 0) / 60)}h{" "}
                {tasks.reduce((a, t) => a + t.duration, 0) % 60}m
              </Text>
              <Text style={[styles.summaryLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>Study Time</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: C.border }]} />
            <View style={styles.summaryItem}>
              <Ionicons name="star-outline" size={18} color={C.warning} />
              <Text style={[styles.summaryValue, { color: C.text, fontFamily: "Inter_700Bold" }]}>
                {tasks.length * 5 + 50}
              </Text>
              <Text style={[styles.summaryLabel, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>Max XP</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {editingTask && (
        <EditTaskModal
          key={editingTask.id}
          task={editingTask}
          isDark={isDark}
          onSave={updateTask}
          onClose={() => setEditingTask(null)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title: { fontSize: 28 },
  subtitle: { fontSize: 14, marginTop: 2 },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
  },
  createBtnText: { color: "#fff", fontSize: 14 },
  dateScroll: { paddingRight: 16, gap: 8, marginBottom: 20, flexDirection: "row" },
  datePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
  datePillText: { fontSize: 13 },
  taskDot: { width: 6, height: 6, borderRadius: 3 },
  selectedDateHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  selectedDateLabel: { fontSize: 20 },
  taskBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  taskBadgeText: { fontSize: 12 },
  emptyState: {
    alignItems: "center",
    padding: 32,
    borderRadius: 20,
    gap: 12,
  },
  emptyTitle: { fontSize: 18 },
  emptySubtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 4,
  },
  emptyBtnText: { color: "#fff", fontSize: 14 },
  taskList: { gap: 10 },
  taskItem: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    paddingVertical: 14,
    paddingRight: 14,
  },
  taskAccent: { width: 4, height: "100%", minHeight: 60 },
  editBtn: { padding: 4, marginLeft: 8 },
  holdHint: { fontSize: 11, textAlign: "center", marginTop: 4 },
  taskTitle: { fontSize: 14, marginBottom: 4 },
  taskTime: { fontSize: 12 },
  summaryCard: {
    flexDirection: "row",
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
  },
  summaryItem: { flex: 1, alignItems: "center", gap: 4 },
  summaryDivider: { width: 1, marginVertical: 4 },
  summaryValue: { fontSize: 16 },
  summaryLabel: { fontSize: 10, textAlign: "center" },
});
