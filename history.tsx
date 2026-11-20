
import React, { useState, useMemo } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import {
  useApp,
  formatTime12,
  formatDuration,
  getTaskColor,
  Task,
} from "@/context/AppContext";
import { useSocial } from "@/context/SocialContext";

// Use Expo's supported native modules.
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";

type QuickRange = "today" | "yesterday" | "week" | "month" | "custom";
type StatusFilter = "all" | "completed" | "skipped";

/** Returns YYYY-MM-DD in LOCAL time */
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function offsetDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function formatDisplay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getRangeLabel(
  range: QuickRange,
  start: string,
  end: string
): string {
  if (range === "today") return "Today";
  if (range === "yesterday") return "Yesterday";
  if (range === "week") return "Last 7 Days";
  if (range === "month") return "Last 30 Days";
  return `${start} to ${end}`;
}

function buildHtml(
  tasks: Task[],
  startDate: string,
  endDate: string,
  rangeLabel: string,
  userName?: string,
  userHandle?: string
): string {
  const grouped: Record<string, Task[]> = {};

  for (const t of tasks) {
    if (!grouped[t.date]) grouped[t.date] = [];
    grouped[t.date].push(t);
  }

  const sortedDates = Object.keys(grouped).sort((a, b) =>
    b.localeCompare(a)
  );

  const completed = tasks.filter((t) => t.status === "completed");
  const skipped = tasks.filter((t) => t.status === "skipped");
  const totalMins = completed.reduce((s, t) => s + t.duration, 0);
  const rate =
    tasks.length > 0
      ? Math.round((completed.length / tasks.length) * 100)
      : 0;

  const subjectColors: Record<string, string> = {
    physics: "#3B82F6",
    chemistry: "#10B981",
    mathematics: "#F59E0B",
    other: "#8B5CF6",
  };

  const rows = sortedDates
    .map((date) => {
      const dayTasks = grouped[date];

      const dayRows = dayTasks
        .map(
          (t) => `
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:8px 12px;font-size:13px;color:#333;">${formatTime12(t.startTime)} – ${formatTime12(t.endTime)}</td>
          <td style="padding:8px 12px;font-size:13px;color:#333;">${t.title}</td>
          <td style="padding:8px 12px;text-align:center;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${subjectColors[t.subject] ?? "#8B5CF6"};"></span>
            <span style="font-size:12px;color:#666;margin-left:4px;">${t.subject}</span>
          </td>
          <td style="padding:8px 12px;font-size:12px;color:#888;">${formatDuration(t.duration)}</td>
          <td style="padding:8px 12px;text-align:center;">
            <span style="
              padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;
              background:${t.status === "completed" ? "#d1fae5" : t.status === "skipped" ? "#fee2e2" : "#f3f4f6"};
              color:${t.status === "completed" ? "#065f46" : t.status === "skipped" ? "#991b1b" : "#6b7280"};
            ">${t.status.charAt(0).toUpperCase() + t.status.slice(1)}</span>
          </td>
        </tr>`
        )
        .join("");

      return `
      <tr>
        <td colspan="5" style="padding:14px 12px 6px;background:#f8f9fa;">
          <strong style="font-size:13px;color:#1A6BFF;text-transform:uppercase;letter-spacing:0.5px;">${formatDisplay(date)}</strong>
        </td>
      </tr>
      ${dayRows}`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; color: #222; background: #fff; }
  .header { background: linear-gradient(135deg,#1A6BFF,#0047CC); color:#fff; padding:24px 28px; }
  .header h1 { font-size:22px; font-weight:700; }
  .header p { font-size:13px; opacity:0.85; margin-top:4px; }
  .summary { display:flex; gap:16px; padding:20px 28px; background:#f8f9fa; border-bottom:1px solid #e5e7eb; }
  .stat { flex:1; text-align:center; background:#fff; border-radius:10px; padding:14px 8px; box-shadow:0 1px 4px rgba(0,0,0,0.06); }
  .stat-val { font-size:22px; font-weight:700; color:#1A6BFF; }
  .stat-lbl { font-size:11px; color:#888; margin-top:3px; }
  table { width:100%; border-collapse:collapse; }
  th { background:#f1f5f9; padding:10px 12px; font-size:12px; color:#64748b; text-align:left; text-transform:uppercase; letter-spacing:0.5px; }
  .footer { padding:16px 28px; text-align:center; font-size:11px; color:#aaa; border-top:1px solid #e5e7eb; }
</style>
</head>
<body>
<div class="header">
  <h1>Taskschedular AI — History Report</h1>
  ${userName ? `<p style="font-size:15px;font-weight:600;opacity:0.95;margin-bottom:2px;">${userName}${userHandle ? `&nbsp;&nbsp;<span style="font-weight:400;opacity:0.8;">@${userHandle}</span>` : ""}</p>` : ""}
  <p>Period: ${rangeLabel} &nbsp;|&nbsp; Generated: ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</p>
</div>
<div class="summary">
  <div class="stat"><div class="stat-val">${tasks.length}</div><div class="stat-lbl">Total Tasks</div></div>
  <div class="stat"><div class="stat-val">${completed.length}</div><div class="stat-lbl">Completed</div></div>
  <div class="stat"><div class="stat-val">${skipped.length}</div><div class="stat-lbl">Skipped</div></div>
  <div class="stat"><div class="stat-val">${rate}%</div><div class="stat-lbl">Completion</div></div>
  <div class="stat"><div class="stat-val">${Math.floor(totalMins / 60)}h ${totalMins % 60}m</div><div class="stat-lbl">Study Time</div></div>
</div>
<table>
  <thead>
    <tr>
      <th>Time</th>
      <th>Task</th>
      <th>Subject</th>
      <th>Duration</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>
    ${rows.length ? rows : `<tr><td colspan="5" style="padding:32px;text-align:center;color:#aaa;">No tasks in this period</td></tr>`}
  </tbody>
</table>
<div class="footer">Taskschedular AI &nbsp;·&nbsp; Student Productivity Tracker</div>
</body>
</html>`;
}

export default function HistoryScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { state } = useApp();
  const { profile } = useSocial();

  const [quickRange, setQuickRange] = useState<QuickRange>("week");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [customStart, setCustomStart] = useState(toDateStr(offsetDate(-7)));
  const [customEnd, setCustomEnd] = useState(toDateStr(new Date()));
  const [exporting, setExporting] = useState(false);
  const [showExport, setShowExport] = useState(false);

  const topPad =
    Platform.OS === "web" ? insets.top + 67 : insets.top;

  const { startDate, endDate } = useMemo(() => {
    const today = toDateStr(new Date());

    if (quickRange === "today") {
      return { startDate: today, endDate: today };
    }

    if (quickRange === "yesterday") {
      const y = toDateStr(offsetDate(-1));
      return { startDate: y, endDate: y };
    }

    if (quickRange === "week") {
      return {
        startDate: toDateStr(offsetDate(-6)),
        endDate: today,
      };
    }

    if (quickRange === "month") {
      return {
        startDate: toDateStr(offsetDate(-29)),
        endDate: today,
      };
    }

    return {
      startDate: customStart,
      endDate: customEnd,
    };
  }, [quickRange, customStart, customEnd]);

  const filteredTasks = useMemo(() => {
    return state.tasks
      .filter((t) => {
        if (t.date < startDate || t.date > endDate) return false;

        if (statusFilter !== "all" && t.status !== statusFilter) {
          return false;
        }

        const today = toDateStr(new Date());

        if (t.date === today && t.status === "pending") {
          return false;
        }

        return true;
      })
      .sort((a, b) =>
        b.date !== a.date
          ? b.date.localeCompare(a.date)
          : a.startTime.localeCompare(b.startTime)
      );
  }, [state.tasks, startDate, endDate, statusFilter]);

  const groupedTasks = useMemo(() => {
    const groups: Record<string, Task[]> = {};

    for (const t of filteredTasks) {
      if (!groups[t.date]) groups[t.date] = [];
      groups[t.date].push(t);
    }

    return Object.entries(groups).sort((a, b) =>
      b[0].localeCompare(a[0])
    );
  }, [filteredTasks]);

  const metrics = useMemo(() => {
    const completed = filteredTasks.filter(
      (t) => t.status === "completed"
    );

    const skipped = filteredTasks.filter(
      (t) => t.status === "skipped"
    );

    const totalMins = completed.reduce(
      (s, t) => s + t.duration,
      0
    );

    const rate =
      filteredTasks.length > 0
        ? Math.round((completed.length / filteredTasks.length) * 100)
        : 0;

    return {
      completed: completed.length,
      skipped: skipped.length,
      totalMins,
      rate,
    };
  }, [filteredTasks]);

  const rangeLabel = getRangeLabel(
    quickRange,
    startDate,
    endDate
  );

  // Corrected Android/iOS PDF export.
  const handleExport = async () => {
    if (Platform.OS !== "android" && Platform.OS !== "ios") {
      Alert.alert(
        "Not Available",
        "PDF export is only available on iOS and Android."
      );
      return;
    }

    if (filteredTasks.length === 0) {
      Alert.alert(
        "No Data",
        "There are no tasks in the selected period to export."
      );
      return;
    }

    setExporting(true);

    try {
      if (
        typeof Print.printToFileAsync !== "function" ||
        typeof Sharing.shareAsync !== "function"
      ) {
        throw new Error(
          "PDF export modules are unavailable. Please rebuild the app."
        );
      }

      const cacheDirectory = FileSystem.cacheDirectory;

      if (!cacheDirectory) {
        throw new Error(
          "The device cache directory is unavailable."
        );
      }

      // Build the existing History report.
      const html = buildHtml(
        filteredTasks,
        startDate,
        endDate,
        rangeLabel,
        profile?.name,
        profile?.username ?? undefined
      );

      // Generate the PDF.
      const generated = await Print.printToFileAsync({
        html,
        base64: false,
      });

      if (!generated?.uri) {
        throw new Error(
          "PDF generation did not return a file location."
        );
      }

      // Verify the generated PDF.
      const generatedInfo = await FileSystem.getInfoAsync(
        generated.uri
      );

      if (!generatedInfo.exists) {
        throw new Error(
          "The generated PDF file could not be found."
        );
      }

      if (
        generatedInfo.isDirectory ||
        !("size" in generatedInfo) ||
        generatedInfo.size <= 0
      ) {
        throw new Error(
          "The generated PDF file is empty or invalid."
        );
      }

      // Copy into the app's local cache directory.
      const fileName = `TaskScheduler_History_${Date.now()}.pdf`;
      const destinationUri = `${cacheDirectory}${fileName}`;

      await FileSystem.copyAsync({
        from: generated.uri,
        to: destinationUri,
      });

      // Verify the final local file before sharing.
      const finalInfo = await FileSystem.getInfoAsync(
        destinationUri
      );

      if (
        !finalInfo.exists ||
        finalInfo.isDirectory ||
        !("size" in finalInfo) ||
        finalInfo.size <= 0
      ) {
        throw new Error(
          "The PDF could not be saved correctly. Please try again."
        );
      }

      if (!destinationUri.startsWith("file://")) {
        throw new Error(
          "The PDF does not have a valid local file URI."
        );
      }

      // Open Android/iOS share sheet.
      const sharingAvailable =
        await Sharing.isAvailableAsync();

      if (!sharingAvailable) {
        Alert.alert(
          "Sharing Unavailable",
          "The PDF was generated, but sharing is not available on this device."
        );
        return;
      }

      await Sharing.shareAsync(destinationUri, {
        mimeType: "application/pdf",
        dialogTitle: "Export History PDF",
        UTI: "com.adobe.pdf",
      });

    } catch (error: unknown) {
      console.error("History PDF Export Error:", error);

      const message =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while exporting your PDF.";

      Alert.alert(
        "Export Failed",
        `Could not export your History PDF.\n\n${message}`
      );

    } finally {
      setExporting(false);
    }
  };

  const quickButtons: {
    label: string;
    value: QuickRange;
  }[] = [
    { label: "Today", value: "today" },
    { label: "Yesterday", value: "yesterday" },
    { label: "Last 7 Days", value: "week" },
    { label: "Last 30 Days", value: "month" },
    { label: "Custom", value: "custom" },
  ];

  return (
    <ScrollView
      style={[
        styles.container,
        { backgroundColor: C.background },
      ]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: topPad + 16,
          paddingBottom: insets.bottom + 100,
        },
      ]}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerRow}>
        <View>
          <Text
            style={[
              styles.title,
              {
                color: C.text,
                fontFamily: "Inter_700Bold",
              },
            ]}
          >
            History
          </Text>

          <Text
            style={[
              styles.subtitle,
              {
                color: C.textSecondary,
                fontFamily: "Inter_400Regular",
              },
            ]}
          >
            Your performance insights
          </Text>
        </View>

        <Pressable
          style={[
            styles.exportBtn,
            { backgroundColor: C.primary },
          ]}
          onPress={handleExport}
          disabled={exporting}
        >
          {exporting ? (
            <ActivityIndicator
              size="small"
              color="#fff"
            />
          ) : (
            <Ionicons
              name="share-outline"
              size={18}
              color="#fff"
            />
          )}

          <Text
            style={[
              styles.exportBtnText,
              { fontFamily: "Inter_600SemiBold" },
            ]}
          >
            {exporting ? "Exporting..." : "Export PDF"}
          </Text>
        </Pressable>
      </View>

      {/* Quick range selector */}
      <Text
        style={[
          styles.sectionLabel,
          {
            color: C.textSecondary,
            fontFamily: "Inter_600SemiBold",
          },
        ]}
      >
        DATE RANGE
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
      >
        {quickButtons.map((btn) => (
          <Pressable
            key={btn.value}
            style={[
              styles.chip,
              {
                backgroundColor:
                  quickRange === btn.value
                    ? C.primary
                    : C.surface,
                borderColor: C.border,
              },
            ]}
            onPress={() => setQuickRange(btn.value)}
          >
            <Text
              style={[
                styles.chipText,
                {
                  color:
                    quickRange === btn.value
                      ? "#fff"
                      : C.textSecondary,
                  fontFamily: "Inter_500Medium",
                },
              ]}
            >
              {btn.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Custom date range */}
      {quickRange === "custom" && (
        <View
          style={[
            styles.customRange,
            {
              backgroundColor: C.surface,
              borderColor: C.border,
            },
          ]}
        >
          <View style={styles.dateField}>
            <Text
              style={[
                styles.dateFieldLabel,
                {
                  color: C.textSecondary,
                  fontFamily: "Inter_600SemiBold",
                },
              ]}
            >
              FROM
            </Text>

            <TextInput
              style={[
                styles.dateInput,
                {
                  color: C.text,
                  borderColor: C.border,
                  backgroundColor: C.background,
                  fontFamily: "Inter_400Regular",
                },
              ]}
              value={customStart}
              onChangeText={setCustomStart}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={C.textMuted}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />
          </View>

          <Ionicons
            name="arrow-forward"
            size={16}
            color={C.textMuted}
            style={{ marginTop: 22 }}
          />

          <View style={styles.dateField}>
            <Text
              style={[
                styles.dateFieldLabel,
                {
                  color: C.textSecondary,
                  fontFamily: "Inter_600SemiBold",
                },
              ]}
            >
              TO
            </Text>

            <TextInput
              style={[
                styles.dateInput,
                {
                  color: C.text,
                  borderColor: C.border,
                  backgroundColor: C.background,
                  fontFamily: "Inter_400Regular",
                },
              ]}
              value={customEnd}
              onChangeText={setCustomEnd}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={C.textMuted}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />
          </View>
        </View>
      )}

      {/* Status filter */}
      <Text
        style={[
          styles.sectionLabel,
          {
            color: C.textSecondary,
            fontFamily: "Inter_600SemiBold",
            marginTop: 16,
          },
        ]}
      >
        STATUS
      </Text>

      <View style={styles.statusRow}>
        {(["all", "completed", "skipped"] as StatusFilter[]).map(
          (s) => {
            const color =
              s === "completed"
                ? C.success
                : s === "skipped"
                  ? C.danger
                  : C.primary;

            const active = statusFilter === s;

            return (
              <Pressable
                key={s}
                style={[
                  styles.statusChip,
                  {
                    backgroundColor: active
                      ? color + "20"
                      : C.surface,
                    borderColor: active
                      ? color
                      : C.border,
                  },
                ]}
                onPress={() => setStatusFilter(s)}
              >
                {s === "completed" && (
                  <Ionicons
                    name="checkmark-circle"
                    size={14}
                    color={active ? color : C.textMuted}
                  />
                )}

                {s === "skipped" && (
                  <Ionicons
                    name="close-circle"
                    size={14}
                    color={active ? color : C.textMuted}
                  />
                )}

                {s === "all" && (
                  <Ionicons
                    name="list"
                    size={14}
                    color={active ? color : C.textMuted}
                  />
                )}

                <Text
                  style={[
                    styles.statusChipText,
                    {
                      color: active
                        ? color
                        : C.textSecondary,
                      fontFamily: "Inter_500Medium",
                    },
                  ]}
                >
                  {s === "all"
                    ? "All"
                    : s.charAt(0).toUpperCase() + s.slice(1)}
                </Text>
              </Pressable>
            );
          }
        )}
      </View>

      {/* Summary metrics */}
      <View style={styles.metricsRow}>
        {[
          {
            icon: "checkmark-circle",
            color: C.success,
            val: metrics.completed,
            lbl: "Completed",
          },
          {
            icon: "close-circle",
            color: C.danger,
            val: metrics.skipped,
            lbl: "Skipped",
          },
          {
            icon: "trending-up",
            color: C.primary,
            val: `${metrics.rate}%`,
            lbl: "Rate",
          },
          {
            icon: "time",
            color: C.warning,
            val: `${Math.floor(metrics.totalMins / 60)}h ${metrics.totalMins % 60}m`,
            lbl: "Study Time",
          },
        ].map((m) => (
          <View
            key={m.lbl}
            style={[
              styles.metricCard,
              { backgroundColor: C.surface },
            ]}
          >
            <Ionicons
              name={m.icon as any}
              size={20}
              color={m.color}
            />

            <Text
              style={[
                styles.metricVal,
                {
                  color: C.text,
                  fontFamily: "Inter_700Bold",
                },
              ]}
            >
              {m.val}
            </Text>

            <Text
              style={[
                styles.metricLbl,
                {
                  color: C.textSecondary,
                  fontFamily: "Inter_400Regular",
                },
              ]}
            >
              {m.lbl}
            </Text>
          </View>
        ))}
      </View>

      {/* Task list */}
      {groupedTasks.length === 0 ? (
        <View
          style={[
            styles.empty,
            { backgroundColor: C.surface },
          ]}
        >
          <Ionicons
            name="time-outline"
            size={40}
            color={C.textMuted}
          />

          <Text
            style={[
              styles.emptyText,
              {
                color: C.textSecondary,
                fontFamily: "Inter_500Medium",
              },
            ]}
          >
            No tasks in this period
          </Text>
        </View>
      ) : (
        <>
          <Text
            style={[
              styles.sectionTitle,
              {
                color: C.text,
                fontFamily: "Inter_700Bold",
              },
            ]}
          >
            Activity Log · {filteredTasks.length} tasks
          </Text>

          {groupedTasks.map(([date, tasks]) => (
            <View key={date} style={styles.dateGroup}>
              <Text
                style={[
                  styles.dateLabel,
                  {
                    color: C.textSecondary,
                    fontFamily: "Inter_600SemiBold",
                  },
                ]}
              >
                {formatShort(date)}
              </Text>

              {tasks.map((task) => (
                <View
                  key={task.id}
                  style={[
                    styles.historyItem,
                    {
                      backgroundColor: C.surface,
                      borderColor: C.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.subjectDot,
                      {
                        backgroundColor: getTaskColor(
                          task.title,
                          task.subject
                        ),
                      },
                    ]}
                  />

                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.taskTitle,
                        {
                          color:
                            task.status === "skipped"
                              ? C.textMuted
                              : C.text,
                          fontFamily: "Inter_500Medium",
                        },
                        task.status === "skipped" && {
                          textDecorationLine: "line-through",
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {task.title}
                    </Text>

                    <Text
                      style={[
                        styles.taskTime,
                        {
                          color: C.textSecondary,
                          fontFamily: "Inter_400Regular",
                        },
                      ]}
                    >
                      {formatTime12(task.startTime)} – {formatTime12(task.endTime)} · {formatDuration(task.duration)}
                    </Text>
                  </View>

                  {task.status === "completed" && (
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={C.success}
                    />
                  )}

                  {task.status === "skipped" && (
                    <Ionicons
                      name="close-circle"
                      size={18}
                      color={C.danger}
                    />
                  )}

                  {task.status === "pending" && (
                    <Ionicons
                      name="remove-circle-outline"
                      size={18}
                      color={C.textMuted}
                    />
                  )}
                </View>
              ))}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16 },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title: { fontSize: 28 },
  subtitle: { fontSize: 13, marginTop: 2 },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    marginTop: 4,
  },
  exportBtnText: { color: "#fff", fontSize: 13 },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 8,
  },
  chipScroll: { marginBottom: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  chipText: { fontSize: 13 },
  customRange: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
    marginBottom: 4,
  },
  dateField: { flex: 1 },
  dateFieldLabel: {
    fontSize: 10,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  dateInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
  },
  statusRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusChipText: { fontSize: 13 },
  metricsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  metricCard: {
    flex: 1,
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    gap: 4,
  },
  metricVal: { fontSize: 15 },
  metricLbl: {
    fontSize: 10,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 16,
    marginBottom: 12,
  },
  empty: {
    alignItems: "center",
    padding: 36,
    borderRadius: 16,
    gap: 10,
    marginTop: 20,
  },
  emptyText: { fontSize: 15 },
  dateGroup: { marginBottom: 16 },
  dateLabel: {
    fontSize: 12,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 6,
  },
  subjectDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  taskTitle: {
    fontSize: 13,
    marginBottom: 2,
  },
  taskTime: { fontSize: 11 },
});
