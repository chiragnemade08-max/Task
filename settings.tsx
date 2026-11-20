import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useColorScheme,
  Alert,
  Platform,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";

type ThemeOption = "light" | "dark" | "system";

function ConfirmModal({
  visible, title, message, confirmLabel, onConfirm, onCancel, isDark,
}: {
  visible: boolean; title: string; message: string; confirmLabel: string;
  onConfirm: () => void; onCancel: () => void; isDark: boolean;
}) {
  const C = isDark ? Colors.dark : Colors.light;
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={modal.overlay}>
        <View style={[modal.box, { backgroundColor: C.surface }]}>
          <Text style={[modal.title, { color: C.text, fontFamily: "Inter_700Bold" }]}>{title}</Text>
          <Text style={[modal.message, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>{message}</Text>
          <View style={modal.btns}>
            <Pressable style={[modal.btn, { backgroundColor: C.surface, borderColor: C.border }]} onPress={onCancel}>
              <Text style={[modal.btnText, { color: C.text, fontFamily: "Inter_600SemiBold" }]}>Cancel</Text>
            </Pressable>
            <Pressable style={[modal.btn, { backgroundColor: C.danger }]} onPress={onConfirm}>
              <Text style={[modal.btnText, { color: "#fff", fontFamily: "Inter_700Bold" }]}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
const modal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  box: { borderRadius: 20, padding: 24, width: "100%", gap: 14 },
  title: { fontSize: 18 },
  message: { fontSize: 14, lineHeight: 20 },
  btns: { flexDirection: "row", gap: 10 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: "center", borderWidth: 1 },
  btnText: { fontSize: 15 },
});

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const {
    state, setTheme,
    resetApp, resetTodayProgress, resetTodayTimetable, resetAllNotifications, resetPreferences,
  } = useApp();
  const { user, logout } = useAuth();

  const [confirmAction, setConfirmAction] = useState<null | {
    title: string; message: string; label: string; onConfirm: () => Promise<void>;
  }>(null);
  const [running, setRunning] = useState(false);

  const haptic = () => { if (Platform.OS !== "web") Haptics.selectionAsync(); };

  const handleTheme = async (t: ThemeOption) => {
    await setTheme(t);
    haptic();
  };

  const confirm = (
    title: string, message: string, label: string, action: () => Promise<void>
  ) => {
    setConfirmAction({ title, message, label, onConfirm: action });
  };

  const runConfirmed = async () => {
    if (!confirmAction) return;
    setRunning(true);
    setConfirmAction(null);
    await confirmAction.onConfirm();
    setRunning(false);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleLogout = () => {
    Alert.alert("Log Out", "You will need to log in again to access your cloud data.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: () => logout() },
    ]);
  };

  const THEMES: { value: ThemeOption; label: string; icon: string }[] = [
    { value: "light", label: "Light", icon: "sunny-outline" },
    { value: "dark", label: "Dark", icon: "moon-outline" },
    { value: "system", label: "Auto", icon: "phone-portrait-outline" },
  ];

  const RESETS = [
    {
      icon: "refresh-circle-outline", color: C.warning,
      title: "Reset Today's Progress",
      subtitle: "Mark all today's tasks as pending. Keeps the timetable.",
      onPress: () => confirm(
        "Reset Today's Progress",
        "This will mark all of today's tasks as pending and clear today's XP record. The timetable stays.",
        "Reset Progress",
        resetTodayProgress
      ),
    },
    {
      icon: "calendar-clear-outline", color: "#9B59B6",
      title: "Delete Today's Timetable",
      subtitle: "Remove all tasks scheduled for today.",
      onPress: () => confirm(
        "Delete Today's Timetable",
        "All tasks scheduled for today will be permanently deleted. History and achievements are unaffected.",
        "Delete Timetable",
        resetTodayTimetable
      ),
    },
    {
      icon: "notifications-off-outline", color: C.primary,
      title: "Reset All Notifications",
      subtitle: "Cancel and reschedule all task reminders.",
      onPress: () => confirm(
        "Reset Notifications",
        "All scheduled notifications will be cancelled and re-created for pending future tasks.",
        "Reset Notifications",
        resetAllNotifications
      ),
    },
    {
      icon: "settings-outline", color: "#20C997",
      title: "Reset Preferences",
      subtitle: "Restore theme to System Default. Data is kept.",
      onPress: () => confirm(
        "Reset Preferences",
        "Theme will be restored to System Default. All your tasks and data will be kept.",
        "Reset Preferences",
        resetPreferences
      ),
    },
    {
      icon: "trash-outline", color: C.danger,
      title: "Reset All Data",
      subtitle: "Permanently delete all tasks, XP, achievements, history and streaks.",
      onPress: () => confirm(
        "Reset All Data",
        "This will permanently delete ALL your data — tasks, XP, achievements, history, and streaks. This cannot be undone.",
        "Delete Everything",
        resetApp
      ),
    },
  ];

  return (
    <>
      {running && (
        <View style={[styles.runningOverlay, { backgroundColor: C.background + "CC" }]}>
          <ActivityIndicator color={C.primary} size="large" />
        </View>
      )}
      <ConfirmModal
        visible={!!confirmAction}
        title={confirmAction?.title ?? ""}
        message={confirmAction?.message ?? ""}
        confirmLabel={confirmAction?.label ?? "Confirm"}
        onConfirm={runConfirmed}
        onCancel={() => setConfirmAction(null)}
        isDark={isDark}
      />

      <ScrollView
        style={[styles.container, { backgroundColor: C.background }]}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* App card */}
        <View style={[styles.appCard, { backgroundColor: C.primary }]}>
          <Ionicons name="flash" size={32} color="#fff" />
          <Text style={[styles.appName, { fontFamily: "Inter_700Bold" }]}>Taskschedular AI</Text>
          <Text style={[styles.appVersion, { fontFamily: "Inter_400Regular" }]}>v2.0</Text>
        </View>

        {/* Account */}
        {user && (
          <>
            <Text style={[styles.sectionTitle, { color: C.textSecondary, fontFamily: "Inter_600SemiBold" }]}>ACCOUNT</Text>
            <View style={[styles.section, { backgroundColor: C.surface }]}>
              <View style={styles.accountRow}>
                <View style={[styles.avatarCircle, { backgroundColor: C.primaryLight }]}>
                  <Ionicons name="person" size={20} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.accountName, { color: C.text, fontFamily: "Inter_700Bold" }]}>
                    {user.name || user.username || "Student"}
                  </Text>
                  <Text style={[styles.accountEmail, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
                    {user.email || (user.username ? `@${user.username}` : "No email")}
                  </Text>
                </View>
                <Pressable onPress={handleLogout} style={[styles.logoutBtn, { borderColor: C.danger + "40" }]}>
                  <Ionicons name="log-out-outline" size={16} color={C.danger} />
                  <Text style={[styles.logoutText, { color: C.danger, fontFamily: "Inter_600SemiBold" }]}>Log out</Text>
                </Pressable>
              </View>
            </View>
          </>
        )}

        {/* Theme */}
        <Text style={[styles.sectionTitle, { color: C.textSecondary, fontFamily: "Inter_600SemiBold" }]}>APPEARANCE</Text>
        <View style={[styles.section, { backgroundColor: C.surface, padding: 16 }]}>
          <Text style={[styles.rowTitle, { color: C.text, fontFamily: "Inter_600SemiBold", marginBottom: 12 }]}>
            Theme
          </Text>
          <View style={styles.themeRow}>
            {THEMES.map(({ value, label, icon }) => {
              const active = state.theme === value;
              return (
                <Pressable
                  key={value}
                  style={[styles.themeBtn, {
                    backgroundColor: active ? C.primary : C.background,
                    borderColor: active ? C.primary : C.border,
                  }]}
                  onPress={() => handleTheme(value)}
                >
                  <Ionicons name={icon as any} size={20} color={active ? "#fff" : C.textSecondary} />
                  <Text style={[styles.themeBtnLabel, {
                    color: active ? "#fff" : C.textSecondary,
                    fontFamily: active ? "Inter_700Bold" : "Inter_500Medium",
                  }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.themeHint, { color: C.textMuted, fontFamily: "Inter_400Regular" }]}>
            {state.theme === "system"
              ? "Follows your device theme automatically"
              : state.theme === "dark"
              ? "Dark mode is active"
              : "Light mode is active"}
          </Text>
        </View>

        {/* Notifications info */}
        <Text style={[styles.sectionTitle, { color: C.textSecondary, fontFamily: "Inter_600SemiBold" }]}>NOTIFICATIONS</Text>
        <View style={[styles.section, { backgroundColor: C.surface }]}>
          <View style={styles.infoRow}>
            <View style={[styles.iconBg, { backgroundColor: C.primary + "20" }]}>
              <Ionicons name="notifications-outline" size={20} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: C.text, fontFamily: "Inter_600SemiBold" }]}>Task Reminders</Text>
              <Text style={[styles.rowSubtitle, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
                5 minutes before each task
              </Text>
            </View>
            <Ionicons name="checkmark-circle" size={22} color={C.success} />
          </View>
        </View>

        {/* XP */}
        <Text style={[styles.sectionTitle, { color: C.textSecondary, fontFamily: "Inter_600SemiBold" }]}>XP SYSTEM</Text>
        <View style={[styles.section, { backgroundColor: C.surface }]}>
          {[
            { icon: "checkmark-circle", color: C.success, label: "Complete a task", value: "+5 XP" },
            { icon: "close-circle", color: C.danger, label: "Skip a task", value: "−5 XP" },
            { icon: "star", color: C.warning, label: "Perfect day (all tasks done)", value: "+50 XP" },
          ].map((item, idx, arr) => (
            <React.Fragment key={item.label}>
              <View style={styles.xpRow}>
                <Ionicons name={item.icon as any} size={20} color={item.color} />
                <Text style={[styles.xpLabel, { color: C.text, fontFamily: "Inter_400Regular" }]}>{item.label}</Text>
                <Text style={[styles.xpValue, { color: item.color, fontFamily: "Inter_700Bold" }]}>{item.value}</Text>
              </View>
              {idx < arr.length - 1 && <View style={[styles.divider, { backgroundColor: C.border }]} />}
            </React.Fragment>
          ))}
        </View>

        {/* Stats */}
        <Text style={[styles.sectionTitle, { color: C.textSecondary, fontFamily: "Inter_600SemiBold" }]}>YOUR STATS</Text>
        <View style={[styles.section, { backgroundColor: C.surface }]}>
          {[
            { icon: "list", color: C.primary, label: "Total Tasks", value: state.tasks.length.toString() },
            { icon: "checkmark-circle", color: C.success, label: "Completed", value: state.tasks.filter((t) => t.status === "completed").length.toString() },
            { icon: "flash", color: C.warning, label: "Total XP", value: state.xp.toString() },
            { icon: "flame", color: "#FF6B35", label: "Day Streak", value: `${state.streak} days` },
          ].map((item, idx, arr) => (
            <React.Fragment key={item.label}>
              <View style={styles.xpRow}>
                <Ionicons name={item.icon as any} size={20} color={item.color} />
                <Text style={[styles.xpLabel, { color: C.text, fontFamily: "Inter_400Regular" }]}>{item.label}</Text>
                <Text style={[styles.xpValue, { color: C.text, fontFamily: "Inter_700Bold" }]}>{item.value}</Text>
              </View>
              {idx < arr.length - 1 && <View style={[styles.divider, { backgroundColor: C.border }]} />}
            </React.Fragment>
          ))}
        </View>

        {/* Reset options */}
        <Text style={[styles.sectionTitle, { color: C.textSecondary, fontFamily: "Inter_600SemiBold" }]}>RESET OPTIONS</Text>
        <View style={styles.resetList}>
          {RESETS.map((item) => (
            <Pressable
              key={item.title}
              style={[styles.resetRow, { backgroundColor: C.surface, borderColor: item.color + "25" }]}
              onPress={item.onPress}
            >
              <View style={[styles.iconBg, { backgroundColor: item.color + "20" }]}>
                <Ionicons name={item.icon as any} size={20} color={item.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: item.color, fontFamily: "Inter_700Bold" }]}>{item.title}</Text>
                <Text style={[styles.rowSubtitle, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
                  {item.subtitle}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={item.color + "80"} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 0 },
  runningOverlay: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", zIndex: 99 },

  appCard: { alignItems: "center", padding: 24, borderRadius: 20, gap: 6, marginBottom: 24 },
  appName: { color: "#fff", fontSize: 20 },
  appVersion: { color: "rgba(255,255,255,0.7)", fontSize: 13 },

  sectionTitle: { fontSize: 11, letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  section: { borderRadius: 16, overflow: "hidden", marginBottom: 4 },

  accountRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  accountName: { fontSize: 15 },
  accountEmail: { fontSize: 12, marginTop: 2 },
  logoutBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, borderWidth: 1 },
  logoutText: { fontSize: 13 },

  themeRow: { flexDirection: "row", gap: 10 },
  themeBtn: { flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: 14, gap: 6, borderWidth: 1.5 },
  themeBtnLabel: { fontSize: 12 },
  themeHint: { fontSize: 11, marginTop: 10 },

  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  iconBg: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15 },
  rowSubtitle: { fontSize: 12, marginTop: 2 },

  xpRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  xpLabel: { flex: 1, fontSize: 14 },
  xpValue: { fontSize: 14 },
  divider: { height: 1, marginHorizontal: 12 },

  resetList: { gap: 8, marginBottom: 8 },
  resetRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 16, borderWidth: 1 },
});
