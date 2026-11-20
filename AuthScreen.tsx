import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";

type AuthTab = "login" | "register";
type ForgotStep = "none" | "email" | "code";

interface Props {
  onSkip: () => void;
}

export default function AuthScreen({ onSkip }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const C = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { login, register, forgotPassword, resetPassword } = useAuth();
  const { loadCloudState } = useApp();

  const [tab, setTab] = useState<AuthTab>("login");
  const [forgotStep, setForgotStep] = useState<ForgotStep>("none");

  // Login fields
  const [loginId, setLoginId] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [loginShowPw, setLoginShowPw] = useState(false);

  // Register fields
  const [regEmail, setRegEmail] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPw, setRegPw] = useState("");
  const [regShowPw, setRegShowPw] = useState(false);

  // Forgot password
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotNewPw, setForgotNewPw] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const topPad = Platform.OS === "web" ? insets.top + 67 : insets.top;

  const clearError = () => { setError(""); setSuccessMsg(""); };

  // ─── Login ────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    clearError();
    if (!loginId.trim() || !loginPw) { setError("Enter your email/username and password."); return; }
    setLoading(true);
    const result = await login(loginId.trim(), loginPw);
    setLoading(false);
    if (result.error) { setError(result.error); return; }
    if (result.appState) {
      await loadCloudState(result.appState);
    }
  };

  // ─── Register ─────────────────────────────────────────────────────────────
  const handleRegister = async () => {
    clearError();
    if (!regEmail.trim() && !regUsername.trim()) { setError("Enter an email or username."); return; }
    if (!regPw) { setError("Enter a password."); return; }
    if (regPw.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    const result = await register({
      email: regEmail.trim() || undefined,
      username: regUsername.trim().toLowerCase() || undefined,
      password: regPw,
    });
    setLoading(false);
    if (result.error) { setError(result.error); }
  };

  // ─── Forgot password ──────────────────────────────────────────────────────
  const handleForgotSend = async () => {
    clearError();
    if (!forgotEmail.trim()) { setError("Enter your email address."); return; }
    setLoading(true);
    const result = await forgotPassword(forgotEmail.trim());
    setLoading(false);
    if (result.error) { setError(result.error); return; }
    setForgotSent(true);
    setForgotStep("code");
    setSuccessMsg("Check your email for a reset code.");
  };

  const handleForgotReset = async () => {
    clearError();
    if (!forgotCode.trim()) { setError("Enter the code from your email."); return; }
    if (!forgotNewPw || forgotNewPw.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    const result = await resetPassword(forgotCode.trim(), forgotNewPw);
    setLoading(false);
    if (result.error) { setError(result.error); return; }
    setSuccessMsg("Password reset! You are now logged in.");
    setForgotStep("none");
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  const renderForgot = () => (
    <View style={[s.forgotBox, { backgroundColor: C.surface, borderColor: C.border }]}>
      <View style={s.forgotHeader}>
        <Text style={[s.forgotTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>Reset Password</Text>
        <Pressable onPress={() => { setForgotStep("none"); clearError(); }}>
          <Ionicons name="close" size={20} color={C.textSecondary} />
        </Pressable>
      </View>

      {forgotStep === "email" && (
        <>
          <Text style={[s.forgotHint, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
            Enter your email and we'll send a reset code.
          </Text>
          <InputField
            icon="mail-outline"
            placeholder="Email address"
            value={forgotEmail}
            onChangeText={setForgotEmail}
            keyboardType="email-address"
            isDark={isDark}
          />
          <ActionButton label="Send Reset Code" onPress={handleForgotSend} loading={loading} color={C.primary} />
        </>
      )}

      {forgotStep === "code" && (
        <>
          <Text style={[s.forgotHint, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
            Enter the 8-character code from your email.
          </Text>
          <InputField
            icon="key-outline"
            placeholder="Reset code"
            value={forgotCode}
            onChangeText={(v) => setForgotCode(v.toUpperCase())}
            autoCapitalize="characters"
            isDark={isDark}
          />
          <InputField
            icon="lock-closed-outline"
            placeholder="New password"
            value={forgotNewPw}
            onChangeText={setForgotNewPw}
            secureTextEntry
            isDark={isDark}
          />
          <ActionButton label="Reset Password" onPress={handleForgotReset} loading={loading} color={C.primary} />
        </>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[s.root, { backgroundColor: C.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: topPad + 20, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={s.hero}>
          <View style={[s.logoCircle, { backgroundColor: C.primary }]}>
            <Ionicons name="flash" size={36} color="#fff" />
          </View>
          <Text style={[s.appTitle, { color: C.text, fontFamily: "Inter_700Bold" }]}>Taskschedular AI</Text>
          <Text style={[s.appSubtitle, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
            Sign in to sync your study data across devices
          </Text>
        </View>

        {/* Tab switcher */}
        <View style={[s.tabBar, { backgroundColor: C.surface }]}>
          {(["login", "register"] as AuthTab[]).map((t) => (
            <Pressable
              key={t}
              style={[s.tabBtn, tab === t && { backgroundColor: C.primary }]}
              onPress={() => { setTab(t); clearError(); setForgotStep("none"); }}
            >
              <Text style={[s.tabBtnText,
                { color: tab === t ? "#fff" : C.textSecondary, fontFamily: tab === t ? "Inter_700Bold" : "Inter_500Medium" }
              ]}>
                {t === "login" ? "Log In" : "Sign Up"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Forgot password overlay */}
        {forgotStep !== "none" ? renderForgot() : (
          <View style={[s.card, { backgroundColor: C.surface }]}>
            {tab === "login" ? (
              <>
                <InputField
                  icon="person-outline"
                  placeholder="Email or username"
                  value={loginId}
                  onChangeText={setLoginId}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  isDark={isDark}
                />
                <InputField
                  icon="lock-closed-outline"
                  placeholder="Password"
                  value={loginPw}
                  onChangeText={setLoginPw}
                  secureTextEntry={!loginShowPw}
                  rightIcon={loginShowPw ? "eye-off-outline" : "eye-outline"}
                  onRightIcon={() => setLoginShowPw(!loginShowPw)}
                  isDark={isDark}
                />
                <Pressable style={s.forgotLink} onPress={() => { setForgotStep("email"); clearError(); }}>
                  <Text style={[s.forgotLinkText, { color: C.primary, fontFamily: "Inter_500Medium" }]}>
                    Forgot password?
                  </Text>
                </Pressable>
                <ActionButton label="Log In" onPress={handleLogin} loading={loading} color={C.primary} />
              </>
            ) : (
              <>
                <InputField
                  icon="mail-outline"
                  placeholder="Email address"
                  value={regEmail}
                  onChangeText={setRegEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  isDark={isDark}
                />
                <View style={[s.atRow, { backgroundColor: C.background, borderColor: C.border }]}>
                  <View style={s.atIconWrap}>
                    <Ionicons name="at-outline" size={18} color={C.primary} />
                  </View>
                  <Text style={[s.atSign, { color: C.primary, fontFamily: "Inter_700Bold" }]}>@</Text>
                  <TextInput
                    style={[s.atInput, { color: C.text, fontFamily: "Inter_500Medium" }]}
                    placeholder="username"
                    placeholderTextColor={C.textMuted}
                    value={regUsername}
                    onChangeText={(v) => setRegUsername(v.toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 30))}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <InputField
                  icon="lock-closed-outline"
                  placeholder="Password (min 6 chars)"
                  value={regPw}
                  onChangeText={setRegPw}
                  secureTextEntry={!regShowPw}
                  rightIcon={regShowPw ? "eye-off-outline" : "eye-outline"}
                  onRightIcon={() => setRegShowPw(!regShowPw)}
                  isDark={isDark}
                />
                <ActionButton label="Create Account" onPress={handleRegister} loading={loading} color={C.primary} />
              </>
            )}
          </View>
        )}

        {/* Error / Success */}
        {error ? (
          <View style={[s.msgBox, { backgroundColor: C.dangerLight }]}>
            <Ionicons name="alert-circle-outline" size={16} color={C.danger} />
            <Text style={[s.msgText, { color: C.danger, fontFamily: "Inter_500Medium" }]}>{error}</Text>
          </View>
        ) : null}
        {successMsg ? (
          <View style={[s.msgBox, { backgroundColor: C.successLight }]}>
            <Ionicons name="checkmark-circle-outline" size={16} color={C.success} />
            <Text style={[s.msgText, { color: C.success, fontFamily: "Inter_500Medium" }]}>{successMsg}</Text>
          </View>
        ) : null}

        {/* Skip */}
        <Pressable style={s.skipBtn} onPress={onSkip}>
          <Text style={[s.skipText, { color: C.textSecondary, fontFamily: "Inter_400Regular" }]}>
            Continue without account
          </Text>
          <Ionicons name="chevron-forward" size={14} color={C.textMuted} />
        </Pressable>

        <Text style={[s.privacyNote, { color: C.textMuted, fontFamily: "Inter_400Regular" }]}>
          Your data is encrypted and never shared.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function InputField({
  icon, placeholder, value, onChangeText, secureTextEntry, keyboardType,
  autoCapitalize, rightIcon, onRightIcon, isDark,
}: {
  icon: string; placeholder: string; value: string;
  onChangeText: (v: string) => void; secureTextEntry?: boolean;
  keyboardType?: any; autoCapitalize?: any;
  rightIcon?: string; onRightIcon?: () => void; isDark: boolean;
}) {
  const C = isDark ? Colors.dark : Colors.light;
  return (
    <View style={[s.inputRow, { backgroundColor: C.background, borderColor: C.border }]}>
      <Ionicons name={icon as any} size={18} color={C.textSecondary} style={{ marginLeft: 4 }} />
      <TextInput
        style={[s.input, { color: C.text, fontFamily: "Inter_500Medium" }]}
        placeholder={placeholder}
        placeholderTextColor={C.textMuted}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? "none"}
        autoCorrect={false}
      />
      {rightIcon && (
        <Pressable onPress={onRightIcon} style={{ padding: 8 }}>
          <Ionicons name={rightIcon as any} size={18} color={C.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

function ActionButton({ label, onPress, loading, color }: {
  label: string; onPress: () => void; loading?: boolean; color: string;
}) {
  return (
    <Pressable
      style={[s.actionBtn, { backgroundColor: color, opacity: loading ? 0.7 : 1 }]}
      onPress={onPress}
      disabled={loading}
    >
      {loading
        ? <ActivityIndicator color="#fff" />
        : <Text style={[s.actionBtnText, { fontFamily: "Inter_700Bold" }]}>{label}</Text>
      }
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 20, gap: 16 },

  hero: { alignItems: "center", gap: 10, marginBottom: 8 },
  logoCircle: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  appTitle: { fontSize: 26 },
  appSubtitle: { fontSize: 14, textAlign: "center" },

  tabBar: { flexDirection: "row", borderRadius: 16, padding: 5, gap: 6 },
  tabBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  tabBtnText: { fontSize: 15 },

  card: { borderRadius: 20, padding: 20, gap: 12 },

  inputRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  input: { flex: 1, fontSize: 15, paddingVertical: 12 },

  atRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 14, paddingLeft: 10, paddingRight: 8, paddingVertical: 4 },
  atIconWrap: { marginRight: 4 },
  atSign: { fontSize: 18, marginRight: 2 },
  atInput: { flex: 1, fontSize: 15, paddingVertical: 12 },

  forgotLink: { alignSelf: "flex-end" },
  forgotLinkText: { fontSize: 13 },

  actionBtn: { borderRadius: 16, paddingVertical: 16, alignItems: "center", justifyContent: "center", marginTop: 4 },
  actionBtnText: { color: "#fff", fontSize: 16 },

  forgotBox: { borderRadius: 20, padding: 20, gap: 14, borderWidth: 1 },
  forgotHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  forgotTitle: { fontSize: 18 },
  forgotHint: { fontSize: 13, lineHeight: 19 },

  msgBox: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 14 },
  msgText: { flex: 1, fontSize: 13 },

  skipBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 14 },
  skipText: { fontSize: 14 },

  privacyNote: { fontSize: 11, textAlign: "center", paddingBottom: 10 },
});
