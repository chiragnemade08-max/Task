import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatTime12, getCategoryColor } from "@/context/AppContext";
import type { Category } from "@/context/AppContext";
import type { TimetableBlock, TimeAlternative } from "@/lib/timetable-parser";

export interface TimetableColors {
  background: string;
  surface: string;
  border: string;
  text: string;
  secondary: string;
  muted: string;
  primary: string;
  warning: string;
  danger: string;
  success: string;
}

interface Props {
  block: TimetableBlock;
  index: number;
  count: number;
  overlap: boolean;
  colors: TimetableColors;
  startDraft?: string;
  endDraft?: string;
  onPatch: (id: string, updates: Partial<TimetableBlock>) => void;
  onTimeDraft: (id: string, field: "startDraft" | "endDraft", value: string) => void;
  onTimeCommit: (id: string) => void;
  onChooseTime: (id: string, option: TimeAlternative) => void;
  onMarkReviewed: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "physics", label: "Physics" },
  { value: "chemistry", label: "Chemistry" },
  { value: "mathematics", label: "Maths" },
  { value: "biology", label: "Biology" },
  { value: "english", label: "English" },
  { value: "computer_science", label: "Computer Science" },
  { value: "history", label: "History" },
  { value: "geography", label: "Geography" },
  { value: "homework", label: "Homework" },
  { value: "revision", label: "Revision" },
  { value: "mock_test", label: "Mock test" },
  { value: "coaching", label: "Coaching" },
  { value: "reading", label: "Reading" },
  { value: "exercise", label: "Exercise" },
  { value: "sleep", label: "Sleep" },
  { value: "meal", label: "Meal" },
  { value: "break_time", label: "Break" },
  { value: "travel", label: "Travel" },
  { value: "meeting", label: "Meeting" },
  { value: "other", label: "Other" },
];

function visibleTime(time: string): string {
  return time ? formatTime12(time) : "";
}

export default function EditableBlockCard({
  block,
  index,
  count,
  overlap,
  colors: C,
  startDraft,
  endDraft,
  onPatch,
  onTimeDraft,
  onTimeCommit,
  onChooseTime,
  onMarkReviewed,
  onDuplicate,
  onDelete,
  onMove,
}: Props) {
  const accent = getCategoryColor(block.subject);
  const review = block.confidence === "review";
  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: review ? C.warning + "80" : C.border }]}>
      <View style={styles.topRow}>
        <View style={styles.blockHeading}>
          <View style={[styles.dot, { backgroundColor: accent }]} />
          <Text style={[styles.blockLabel, { color: C.text }]}>Block {index + 1}</Text>
          <View style={[styles.confidencePill, { backgroundColor: review ? C.warning + "20" : C.success + "20" }]}>
            <Ionicons name={review ? "alert-circle" : "checkmark-circle"} size={13} color={review ? C.warning : C.success} />
            <Text style={[styles.confidenceText, { color: review ? C.warning : C.success }]}>
              {review ? "Needs edit" : "High confidence"}
            </Text>
          </View>
        </View>
        <View style={styles.iconActions}>
          <Pressable onPress={() => onMove(block.id, -1)} disabled={index === 0} hitSlop={7} accessibilityLabel="Move block up">
            <Ionicons name="chevron-up" size={18} color={index === 0 ? C.muted : C.secondary} />
          </Pressable>
          <Pressable onPress={() => onMove(block.id, 1)} disabled={index === count - 1} hitSlop={7} accessibilityLabel="Move block down">
            <Ionicons name="chevron-down" size={18} color={index === count - 1 ? C.muted : C.secondary} />
          </Pressable>
          <Pressable onPress={() => onDuplicate(block.id)} hitSlop={7} accessibilityLabel="Duplicate block">
            <Ionicons name="copy-outline" size={17} color={C.secondary} />
          </Pressable>
          <Pressable onPress={() => onDelete(block.id)} hitSlop={7} accessibilityLabel="Delete block">
            <Ionicons name="trash-outline" size={17} color={C.danger} />
          </Pressable>
        </View>
      </View>

      <Text style={[styles.fieldLabel, { color: C.secondary }]}>Activity</Text>
      <TextInput
        value={block.title}
        onChangeText={(title) => onPatch(block.id, { title, confidence: title.trim() ? block.confidence : "review" })}
        placeholder="e.g. Physics revision"
        placeholderTextColor={C.muted}
        style={[styles.input, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
        accessibilityLabel={`Activity for block ${index + 1}`}
      />

      <View style={styles.timeRow}>
        <View style={styles.timeField}>
          <Text style={[styles.fieldLabel, { color: C.secondary }]}>Start time</Text>
          <TextInput
            value={startDraft ?? visibleTime(block.startTime)}
            onChangeText={(value) => onTimeDraft(block.id, "startDraft", value)}
            onBlur={() => onTimeCommit(block.id)}
            placeholder="6:00 AM"
            placeholderTextColor={C.muted}
            style={[styles.input, styles.timeInput, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
            keyboardType="numbers-and-punctuation"
            accessibilityLabel={`Start time for block ${index + 1}`}
          />
        </View>
        <View style={styles.timeField}>
          <Text style={[styles.fieldLabel, { color: C.secondary }]}>End time</Text>
          <TextInput
            value={endDraft ?? visibleTime(block.endTime)}
            onChangeText={(value) => onTimeDraft(block.id, "endDraft", value)}
            onBlur={() => onTimeCommit(block.id)}
            placeholder="7:00 AM"
            placeholderTextColor={C.muted}
            style={[styles.input, styles.timeInput, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
            keyboardType="numbers-and-punctuation"
            accessibilityLabel={`End time for block ${index + 1}`}
          />
        </View>
      </View>

      <Text style={[styles.fieldLabel, { color: C.secondary }]}>Subject or category</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
        {CATEGORIES.map((category) => {
          const selected = block.subject === category.value;
          const color = getCategoryColor(category.value);
          return (
            <Pressable
              key={category.value}
              onPress={() => onPatch(block.id, { subject: category.value })}
              style={[
                styles.categoryChip,
                { backgroundColor: selected ? color : C.background, borderColor: selected ? color : C.border },
              ]}
            >
              <Text style={[styles.categoryText, { color: selected ? "#FFFFFF" : C.secondary }]}>
                {category.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={[styles.fieldLabel, { color: C.secondary }]}>Notes · optional</Text>
      <TextInput
        value={block.notes}
        onChangeText={(notes) => onPatch(block.id, { notes })}
        placeholder="Add a reminder"
        placeholderTextColor={C.muted}
        style={[styles.input, { backgroundColor: C.background, borderColor: C.border, color: C.text }]}
      />

      {block.issue ? (
        <View style={[styles.notice, { backgroundColor: C.warning + "16" }]}>
          <Ionicons name="alert-circle-outline" size={16} color={C.warning} />
          <Text style={[styles.noticeText, { color: C.warning }]}>{block.issue}</Text>
        </View>
      ) : null}
      {block.timeAlternatives?.length ? (
        <View style={styles.alternatives}>
          <Text style={[styles.alternativePrompt, { color: C.secondary }]}>Choose the intended time:</Text>
          {block.timeAlternatives.map((option, optionIndex) => (
            <Pressable
              key={`${option.startTime}-${option.endTime}-${optionIndex}`}
              onPress={() => onChooseTime(block.id, option)}
              style={[styles.alternativeButton, { borderColor: C.warning }]}
            >
              <Text style={[styles.alternativeText, { color: C.text }]}>
                {visibleTime(option.startTime)} – {visibleTime(option.endTime)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {review && !block.timeAlternatives?.length ? (
        <Pressable
          onPress={() => onMarkReviewed(block.id)}
          style={[styles.reviewButton, { borderColor: C.success }]}
        >
          <Ionicons name="checkmark-circle-outline" size={15} color={C.success} />
          <Text style={[styles.reviewButtonText, { color: C.success }]}>I checked this block</Text>
        </Pressable>
      ) : null}
      {overlap ? (
        <View style={[styles.notice, { backgroundColor: C.danger + "16" }]}>
          <Ionicons name="warning-outline" size={16} color={C.danger} />
          <Text style={[styles.noticeText, { color: C.danger }]}>This time overlaps another block.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 12, gap: 8 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 },
  blockHeading: { flexDirection: "row", alignItems: "center", gap: 7, flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  blockLabel: { fontSize: 14, fontWeight: "700" },
  confidencePill: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 4 },
  confidenceText: { fontSize: 9, fontWeight: "700" },
  iconActions: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 4 },
  fieldLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 2 },
  input: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 10, fontSize: 13, minHeight: 42 },
  timeRow: { flexDirection: "row", gap: 10 },
  timeField: { flex: 1 },
  timeInput: { paddingHorizontal: 9, fontSize: 12 },
  categoryRow: { gap: 7, paddingVertical: 2 },
  categoryChip: { borderWidth: 1, borderRadius: 30, paddingHorizontal: 10, paddingVertical: 7 },
  categoryText: { fontSize: 10, fontWeight: "600" },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 7, padding: 9, borderRadius: 10, marginTop: 2 },
  noticeText: { flex: 1, fontSize: 11, lineHeight: 15, fontWeight: "600" },
  alternatives: { gap: 7, marginTop: 2 },
  alternativePrompt: { fontSize: 11, fontWeight: "600" },
  alternativeButton: { borderWidth: 1, borderRadius: 9, padding: 9 },
  alternativeText: { fontSize: 12, textAlign: "center", fontWeight: "600" },
  reviewButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderRadius: 9, paddingVertical: 8 },
  reviewButtonText: { fontSize: 11, fontWeight: "700" },
});
