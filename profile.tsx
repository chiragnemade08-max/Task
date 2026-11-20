import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useColorScheme,
  Platform,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { useSocial } from "@/context/SocialContext";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";

const AVATAR_COLORS = [
  "#1A6BFF", "#FF6B35", "#2ECC71", "#9B59B6", "#E74C3C",
  "#F39C12", "#1ABC9C", "#E91E63", "#00BCD4", "#795548",
];

// ─── Helpers ────────────────────────────────────────────────────────────────
function getInitials(name: string): string {
  return name.split(" ").filter(Boolean).map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?";
}

/** Turn a display name into a candidate username: "Alice Smith" → "alice.smith" */
function nameToUsername(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9_.]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 30) || "student";
}

const USERNAME_REGEX = /^[a-zA-Z0-9_.]{3,30}$/;

function validateUsername(val: string): string | null {
  if (!val) return null;
  if (val.length < 3) return "Username must be at least 3 characters.";
  if (val.length > 30) return "Username can be at most 30 characters.";
  if (!/^[a-zA-Z0-9_.]+$/.test(val)) return "Only letters, numbers, underscores and dots allowed.";
  return null;
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color, isDark }: { icon: string; label: string; value: string; color: string; isDark: boolean }) {
  const C = isDark ? Colors.dark : Colors.light;
  return (
    <View style={[statStyles.card, { backgroundColor: C.surface }]}>
      <Ionicons name={icon as any} size={20} color={color} />
      <Text style={[statStyles.value, { color: C.text, fontFamily: "Inter_700Bold" }]}>{value}</Text>
      <Text style={[statStyles.label, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>{label}</Text>
    </View>
  );
}
const statStyles = StyleSheet.create({
  card: { flex: 1, alignItems: "center", padding: 14, borderRadius: 16, gap: 4 },
  value: { fontSize: 18 },
  label: { fontSize: 10, textAlign: "center" },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, loading, updateProfile, checkUsername } = useSocial();
  const { state } = useApp();
  const { user: authUser, updateUsername } = useAuth();

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editAuthUsername, setEditAuthUsername] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editColor, setEditColor] = useState(AVATAR_COLORS[0]);

  // Validation / feedback state
  const [nameError, setNameError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [authUsernameError, setAuthUsernameError] = useState("");
  const [usernameSuggestion, setUsernameSuggestion] = useState<string | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [saving, setSaving] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topPad = Platform.OS === "web" ? insets.top + 67 : insets.top;

  // Live username uniqueness check (debounced 600 ms)
  useEffect(() => {
    if (!editing) return;
    setUsernameSuggestion(null);
    const err = validateUsername(editUsername);
    setUsernameError(err ?? "");
    if (err || !editUsername) { setCheckingUsername(false); return; }

    if (checkTimer.current) clearTimeout(checkTimer.current);
    setCheckingUsername(true);
    checkTimer.current = setTimeout(async () => {
      const result = await checkUsername(editUsername);
      setCheckingUsername(false);
      if (!result.available) {
        setUsernameError("Username already taken.");
        setUsernameSuggestion(result.suggestion ?? null);
      } else {
        setUsernameError("");
        setUsernameSuggestion(null);
      }
    }, 600);

    return () => { if (checkTimer.current) clearTimeout(checkTimer.current); };
  }, [editUsername, editing]);

  const startEdit = () => {
    setEditName(profile?.name ?? "");
    setEditUsername(profile?.username ?? "");
    setEditAuthUsername(authUser?.username ?? "");
    setEditBio(profile?.bio ?? "");
    setEditColor(profile?.avatarColor ?? AVATAR_COLORS[0]);
    setNameError("");
    setUsernameError("");
    setAuthUsernameError("");
    setUsernameSuggestion(null);
    setEditing(true);
  };

  const autoGenerateUsername = useCallback(async () => {
    const base = nameToUsername(editName || "student");
    setEditUsername(base);
    // The useEffect above will trigger the uniqueness check
  }, [editName]);

  const applySuggestion = () => {
    if (usernameSuggestion) {
      setEditUsername(usernameSuggestion);
      setUsernameSuggestion(null);
      setUsernameError("");
    }
  };

  const saveEdit = async () => {
    // Validate display name
    const trimmedName = editName.trim();
    if (!trimmedName) { setNameError("Display name is required."); return; }
    if (trimmedName.length > 60) { setNameError("Display name is too long (max 60 chars)."); return; }
    setNameError("");

    // Resolve username: auto-generate from name if empty
    let finalUsername = editUsername.trim().toLowerCase();
    if (!finalUsername) {
      finalUsername = nameToUsername(trimmedName);
    }

    // Validate format
    const fmtErr = validateUsername(finalUsername);
    if (fmtErr) { setUsernameError(fmtErr); return; }

    // Check uniqueness one final time before saving
    setCheckingUsername(true);
    const check = await checkUsername(finalUsername);
    setCheckingUsername(false);
    if (!check.available) {
      setUsernameError("Username already taken.");
      setUsernameSuggestion(check.suggestion ?? null);
      return;
    }

    // Update auth username if changed and user is logged in
    const authUname = editAuthUsername.trim().toLowerCase();
    if (authUser && authUname && authUname !== authUser.username) {
      const fmtErr = validateUsername(authUname);
      if (fmtErr) { setAuthUsernameError(fmtErr); return; }
      setSaving(true);
      const authResult = await updateUsername(authUname);
      setSaving(false);
      if (authResult.error) {
        setAuthUsernameError(authResult.error);
        return;
      }
      setAuthUsernameError("");
    }

    setSaving(true);
    const result = await updateProfile({
      name: trimmedName,
      username: finalUsername,
      bio: editBio.trim(),
      avatarColor: editColor,
    });
    setSaving(false);

    if (result.error) {
      if (result.error.toLowerCase().includes("taken") || result.error.toLowerCase().includes("unique")) {
        setUsernameError("That username is already taken by another account.");
        const rCheck = await checkUsername(finalUsername);
        if (!rCheck.available && rCheck.suggestion) setUsernameSuggestion(rCheck.suggestion);
      } else {
        Alert.alert("Could not save", result.error);
      }
    } else {
      setEditing(false);
    }
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Photo access needed", "Please allow access to your photo library in Settings.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (!result.canceled && result.assets[0]) {
      await updateProfile({ avatarUri: result.assets[0].uri });
    }
  };

  const copyFriendCode = async () => {
    if (!profile?.friendCode) return;
    await Clipboard.setStringAsync(profile.friendCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  // ─── Computed ────────────────────────────────────────────────────────────
  const totalStudyMins = state.tasks.filter((t) => t.status === "completed").reduce((s, t) => s + t.duration, 0);
  const studyHoursDisplay = totalStudyMins >= 60
    ? `${Math.floor(totalStudyMins / 60)}h ${totalStudyMins % 60}m`
    : `${totalStudyMins}m`;
  const tasksCompleted = state.tasks.filter((t) => t.status === "completed").length;
  const achievements = state.achievements.filter((a) => a.unlocked).length;

  const avatarColor = editing ? editColor : (profile?.avatarColor ?? AVATAR_COLORS[0]);
  const displayName = editing ? (editName || "Student") : (profile?.name ?? "Student");
  const initials = getInitials(displayName);

  // ─── Loading ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.centered, { backgroundColor: C.background }]}>
        <ActivityIndicator color={C.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={[s.container, { backgroundColor: C.background }]}
      contentContainerStyle={[s.content, { paddingTop: topPad + 16, paddingBottom: insets.bottom + 100 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Header row ── */}
      <View style={s.headerRow}>
        <Text style={[s.screenTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>Profile</Text>
        <View style={s.headerBtns}>
          {editing && (
            <Pressable style={[s.cancelBtn, { borderColor: C.border }]} onPress={() => setEditing(false)}>
              <Text style={[s.cancelBtnText, { color: C.textSecondary, fontFamily: "Inter_500Medium" }]}>Cancel</Text>
            </Pressable>
          )}
          {!editing && (
            <Pressable style={[s.iconBtn, { backgroundColor: C.surface }]} onPress={() => router.push("/settings")}>
              <Ionicons name="settings-outline" size={20} color={C.textSecondary} />
            </Pressable>
          )}
          <Pressable
            style={[s.editBtn, { backgroundColor: editing ? C.primary : C.surface, borderColor: C.border }]}
            onPress={editing ? saveEdit : startEdit}
            disabled={saving || checkingUsername}
          >
            {saving || checkingUsername ? (
              <ActivityIndicator size="small" color={editing ? "#fff" : C.text} />
            ) : (
              <Ionicons name={editing ? "checkmark" : "create-outline"} size={18} color={editing ? "#fff" : C.text} />
            )}
            <Text style={[s.editBtnText, { color: editing ? "#fff" : C.text, fontFamily: "Inter_600SemiBold" }]}>
              {saving ? "Saving…" : editing ? "Save" : "Edit"}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ── Avatar ── */}
      <View style={s.avatarSection}>
        <Pressable onPress={editing ? pickImage : undefined} style={s.avatarWrap}>
          {profile?.avatarUri ? (
            <Image source={{ uri: profile.avatarUri }} style={[s.avatar, { borderColor: avatarColor }]} />
          ) : (
            <View style={[s.avatar, { backgroundColor: avatarColor, borderColor: avatarColor }]}>
              <Text style={s.avatarInitials}>{initials}</Text>
            </View>
          )}
          {editing && (
            <View style={s.avatarOverlay}>
              <Ionicons name="camera" size={22} color="#fff" />
            </View>
          )}
        </Pressable>

        {/* Color picker (edit mode) */}
        {editing && (
          <View style={s.colorRow}>
            {AVATAR_COLORS.map((c) => (
              <Pressable
                key={c}
                style={[s.colorDot, { backgroundColor: c, borderWidth: editColor === c ? 3 : 0, borderColor: "#fff" }]}
                onPress={() => setEditColor(c)}
              />
            ))}
          </View>
        )}
      </View>

      {/* ── Display Name ── */}
      {editing ? (
        <View style={[s.fieldCard, { backgroundColor: C.surface }]}>
          <Text style={[s.fieldLabel, { color: C.textSecondary, fontFamily: "Inter_600SemiBold" }]}>DISPLAY NAME</Text>
          <TextInput
            style={[s.fieldInput, { color: C.text, fontFamily: "Inter_600SemiBold", fontSize: 18,
              borderColor: nameError ? C.danger : C.border }]}
            value={editName}
            onChangeText={(v) => { setEditName(v); if (v.trim()) setNameError(""); }}
            placeholder="Your full name"
            placeholderTextColor={C.textMuted}
            maxLength={60}
          />
          {nameError ? <Text style={[s.errorText, { color: C.danger, fontFamily: "Inter_400Regular" }]}>{nameError}</Text> : null}
        </View>
      ) : (
        <View style={s.nameBlock}>
          <Text style={[s.displayName, { color: C.text, fontFamily: "Inter_700Bold" }]}>{profile?.name ?? "Student"}</Text>
          {authUser?.username ? (
            <View style={[s.loginIdBadge, { backgroundColor: C.primary + "15" }]}>
              <Ionicons name="person-circle-outline" size={14} color={C.primary} />
              <Text style={[s.loginIdText, { color: C.primary, fontFamily: "Inter_600SemiBold" }]}>
                @{authUser.username}
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {/* ── Auth Login ID (edit mode) ── */}
      {editing && authUser && (
        <View style={[s.fieldCard, { backgroundColor: C.surface }]}>
          <Text style={[s.fieldLabel, { color: C.textSecondary, fontFamily: "Inter_600SemiBold" }]}>LOGIN ID</Text>
          <View style={[s.usernameInputRow, {
            borderColor: authUsernameError ? C.danger : C.border,
            backgroundColor: C.background,
          }]}>
            <Text style={[s.atPrefix, { color: C.primary, fontFamily: "Inter_700Bold" }]}>@</Text>
            <TextInput
              style={[s.usernameInput, { color: C.text, fontFamily: "Inter_500Medium" }]}
              value={editAuthUsername}
              onChangeText={(v) => { setEditAuthUsername(v.toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 30)); setAuthUsernameError(""); }}
              placeholder="your.login.id"
              placeholderTextColor={C.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={30}
              returnKeyType="done"
            />
          </View>
          {authUsernameError ? (
            <View style={s.errorRow}>
              <Ionicons name="alert-circle-outline" size={14} color={C.danger} />
              <Text style={[s.errorText, { color: C.danger, fontFamily: "Inter_400Regular" }]}>{authUsernameError}</Text>
            </View>
          ) : null}
          <Text style={[s.fieldHint, { color: C.textMuted, fontFamily: "Inter_400Regular" }]}>
            This is what you use to log in
          </Text>
        </View>
      )}

      {/* ── Username (edit mode) ── */}
      {editing && (
        <View style={[s.fieldCard, { backgroundColor: C.surface }]}>
          <View style={s.fieldLabelRow}>
            <Text style={[s.fieldLabel, { color: C.textSecondary, fontFamily: "Inter_600SemiBold" }]}>DISPLAY USERNAME</Text>
            <Pressable onPress={autoGenerateUsername} style={[s.autoBtn, { borderColor: C.border }]}>
              <Ionicons name="sparkles-outline" size={13} color={C.primary} />
              <Text style={[s.autoBtnText, { color: C.primary, fontFamily: "Inter_500Medium" }]}>Auto-generate</Text>
            </Pressable>
          </View>

          {/* @-prefixed input */}
          <View style={[s.usernameInputRow, {
            borderColor: usernameError ? C.danger : (editUsername && !usernameError) ? C.success : C.border,
            backgroundColor: C.background,
          }]}>
            <Text style={[s.atPrefix, { color: C.primary, fontFamily: "Inter_700Bold" }]}>@</Text>
            <TextInput
              style={[s.usernameInput, { color: C.text, fontFamily: "Inter_500Medium" }]}
              value={editUsername}
              onChangeText={(v) => setEditUsername(v.toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 30))}
              placeholder="your.username"
              placeholderTextColor={C.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={30}
              returnKeyType="done"
            />
            {checkingUsername && <ActivityIndicator size="small" color={C.primary} style={{ marginRight: 4 }} />}
            {!checkingUsername && editUsername && !usernameError && (
              <Ionicons name="checkmark-circle" size={18} color={C.success} style={{ marginRight: 4 }} />
            )}
          </View>

          {/* Error + suggestion */}
          {usernameError ? (
            <View style={s.errorRow}>
              <Ionicons name="alert-circle-outline" size={14} color={C.danger} />
              <Text style={[s.errorText, { color: C.danger, fontFamily: "Inter_400Regular" }]}>{usernameError}</Text>
            </View>
          ) : null}
          {usernameSuggestion && (
            <Pressable style={[s.suggestionBox, { backgroundColor: C.primaryLight }]} onPress={applySuggestion}>
              <Ionicons name="bulb-outline" size={14} color={C.primary} />
              <Text style={[s.suggestionText, { color: C.primary, fontFamily: "Inter_500Medium" }]}>
                Try <Text style={{ fontFamily: "Inter_700Bold" }}>@{usernameSuggestion}</Text> — tap to use
              </Text>
            </Pressable>
          )}
          <Text style={[s.fieldHint, { color: C.textMuted, fontFamily: "Inter_400Regular" }]}>
            Letters, numbers, underscores and dots · 3–30 chars
          </Text>
        </View>
      )}

      {/* ── Bio ── */}
      {editing ? (
        <View style={[s.fieldCard, { backgroundColor: C.surface }]}>
          <Text style={[s.fieldLabel, { color: C.textSecondary, fontFamily: "Inter_600SemiBold" }]}>BIO</Text>
          <TextInput
            style={[s.bioInput, { color: C.text, fontFamily: "Inter_400Regular", borderColor: C.border }]}
            value={editBio}
            onChangeText={setEditBio}
            placeholder="Tell your friends something about you…"
            placeholderTextColor={C.textMuted}
            multiline
            maxLength={120}
          />
          <Text style={[s.charCount, { color: C.textMuted, fontFamily: "Inter_400Regular" }]}>
            {editBio.length}/120
          </Text>
        </View>
      ) : (
        profile?.bio ? (
          <View style={[s.bioCard, { backgroundColor: C.surface }]}>
            <Text style={[s.bioText, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>{profile.bio}</Text>
          </View>
        ) : null
      )}

      {/* ── Friend Code ── */}
      <View style={[s.codeCard, { backgroundColor: C.surface, borderColor: C.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[s.codeLabel, { color: C.textSecondary, fontFamily: "Inter_600SemiBold" }]}>FRIEND CODE</Text>
          <Text style={[s.codeValue, { color: C.primary, fontFamily: "Inter_700Bold" }]}>
            {profile?.friendCode || "Loading…"}
          </Text>
          <Text style={[s.codeHint, { color: C.textMuted, fontFamily: "Inter_400Regular" }]}>
            Share to add friends · permanent & unique
          </Text>
        </View>
        <Pressable style={[s.copyBtn, { backgroundColor: codeCopied ? C.success : C.primary }]} onPress={copyFriendCode}>
          <Ionicons name={codeCopied ? "checkmark" : "copy-outline"} size={18} color="#fff" />
          <Text style={[s.copyBtnText, { fontFamily: "Inter_600SemiBold" }]}>{codeCopied ? "Copied!" : "Copy"}</Text>
        </Pressable>
      </View>

      {/* ── Stats ── */}
      <Text style={[s.sectionTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>Lifetime Stats</Text>
      <View style={s.statsGrid}>
        <StatCard icon="star" label="Total XP" value={`${state.xp}`} color={C.warning} isDark={isDark} />
        <StatCard icon="flame" label="Streak" value={`${state.streak}d`} color="#FF6B35" isDark={isDark} />
      </View>
      <View style={[s.statsGrid, { marginTop: 10 }]}>
        <StatCard icon="time" label="Study Time" value={studyHoursDisplay} color={C.success} isDark={isDark} />
        <StatCard icon="checkmark-circle" label="Completed" value={`${tasksCompleted}`} color={C.primary} isDark={isDark} />
      </View>
      <View style={[s.statsGrid, { marginTop: 10 }]}>
        <StatCard icon="trending-up" label="Best Streak" value={`${state.streak}d`} color="#9B59B6" isDark={isDark} />
        <StatCard icon="medal" label="Achievements" value={`${achievements}`} color="#F39C12" isDark={isDark} />
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },

  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  screenTitle: { fontSize: 28 },
  headerBtns: { flexDirection: "row", gap: 8, alignItems: "center" },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  cancelBtnText: { fontSize: 14 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1, minWidth: 80, justifyContent: "center" },
  editBtnText: { fontSize: 14 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },

  avatarSection: { alignItems: "center", gap: 12, marginBottom: 20 },
  avatarWrap: { position: "relative" },
  avatar: { width: 90, height: 90, borderRadius: 45, alignItems: "center", justifyContent: "center", borderWidth: 3 },
  avatarInitials: { color: "#fff", fontSize: 30, fontFamily: "Inter_700Bold" },
  avatarOverlay: { position: "absolute", inset: 0, borderRadius: 45, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  colorDot: { width: 28, height: 28, borderRadius: 14 },

  nameBlock: { alignItems: "center", marginBottom: 16 },
  displayName: { fontSize: 22 },
  usernameDisplay: { fontSize: 15, marginTop: 3 },
  loginIdBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, marginTop: 6 },
  loginIdText: { fontSize: 14 },

  fieldCard: { borderRadius: 16, padding: 16, marginBottom: 14, gap: 8 },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fieldLabel: { fontSize: 10, letterSpacing: 0.8 },
  fieldInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  fieldHint: { fontSize: 11, marginTop: 2 },
  charCount: { fontSize: 10, textAlign: "right" },

  usernameInputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 12, paddingLeft: 12, paddingRight: 8, paddingVertical: 2 },
  atPrefix: { fontSize: 18, marginRight: 2 },
  usernameInput: { flex: 1, fontSize: 16, paddingVertical: 10 },

  autoBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1 },
  autoBtnText: { fontSize: 12 },

  errorRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  errorText: { fontSize: 12, flex: 1 },
  suggestionBox: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderRadius: 10 },
  suggestionText: { fontSize: 13, flex: 1 },

  bioCard: { borderRadius: 16, padding: 16, marginBottom: 16 },
  bioInput: { minHeight: 72, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, textAlignVertical: "top" },
  bioText: { fontSize: 14, lineHeight: 20 },

  codeCard: { borderRadius: 20, padding: 18, marginBottom: 24, flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1 },
  codeLabel: { fontSize: 10, letterSpacing: 0.8, marginBottom: 4 },
  codeValue: { fontSize: 26, letterSpacing: 4 },
  codeHint: { fontSize: 11, marginTop: 2 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14 },
  copyBtnText: { color: "#fff", fontSize: 13 },

  sectionTitle: { fontSize: 18, marginBottom: 12 },
  statsGrid: { flexDirection: "row", gap: 10 },
});
