import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { saveUser, savePlan } from '../lib/storage';
import { registerPushToken } from '../lib/notifications';
import { useTheme } from '../lib/themeContext';

export default function Signup() {
  const theme = useTheme();
  const [companyName, setCompanyName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!companyName.trim() || !email.trim() || !password || !phone.trim()) {
      return Alert.alert('Almost there', 'Company, email, password, and phone are all required.');
    }
    if (password.length < 8) {
      return Alert.alert('Password too short', 'Use at least 8 characters.');
    }
    setLoading(true);
    try {
      const res = await fetch('https://linkcrew.io/api/mobile/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName.trim(),
          owner_name: ownerName.trim() || null,
          email: email.trim().toLowerCase(),
          password,
          phone: phone.trim(),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.employee) {
        return Alert.alert('Sign up failed', payload.error || 'Please try again.');
      }
      await saveUser(payload.employee);
      if (payload.tenant) {
        await savePlan({
          plan: payload.tenant.plan ?? 'crew',
          subscription_status: payload.tenant.subscription_status ?? 'trialing',
          max_users: payload.tenant.max_users ?? 1,
        });
      }
      router.replace('/(owner)' as any);
      // Register push token in background.
      registerPushToken().then(pushToken => {
        if (pushToken) {
          fetch('https://linkcrew.io/api/mobile/push-token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${payload.employee.mobile_session_token}`,
            },
            body: JSON.stringify({ push_token: pushToken }),
          });
        }
      }).catch(() => {});
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not create account.');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    backgroundColor: theme.surfaceInset,
    borderWidth: 1, borderColor: theme.border,
    borderRadius: 12, padding: 14, fontSize: 16,
    color: theme.textPrimary, marginBottom: 12,
  } as const;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <ScrollView
        contentContainerStyle={{ padding: 24, paddingTop: 60, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={{ marginBottom: 16, width: 36, height: 36, alignItems: 'flex-start', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
        </TouchableOpacity>

        <Text style={[styles.brand, { color: theme.accent }]}>LinkCrew</Text>
        <Text style={[styles.title, { color: theme.textPrimary, marginTop: 12 }]}>Create your business</Text>
        <Text style={[styles.sub, { color: theme.textMuted }]}>
          Takes about a minute. You can edit everything later in Settings.
        </Text>

        <Text style={[styles.label, { color: theme.textSecondary }]}>Company name *</Text>
        <TextInput
          style={inputStyle}
          placeholder="e.g. Kingston Electric"
          placeholderTextColor={theme.textMuted}
          value={companyName}
          onChangeText={setCompanyName}
          autoCapitalize="words"
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Your name</Text>
        <TextInput
          style={inputStyle}
          placeholder="Optional — shown on invoices"
          placeholderTextColor={theme.textMuted}
          value={ownerName}
          onChangeText={setOwnerName}
          autoCapitalize="words"
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Email *</Text>
        <TextInput
          style={inputStyle}
          placeholder="you@company.com"
          placeholderTextColor={theme.textMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
          autoComplete="email"
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Password *</Text>
        <TextInput
          style={inputStyle}
          placeholder="At least 8 characters"
          placeholderTextColor={theme.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password-new"
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Phone *</Text>
        <TextInput
          style={inputStyle}
          placeholder="(555) 123-4567"
          placeholderTextColor={theme.textMuted}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
        />
        <Text style={[styles.hint, { color: theme.textMuted }]}>
          Used for mobile sign-in and crew can reach you here.
        </Text>

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
          onPress={submit}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={theme.accentContrast} />
            : <Text style={[styles.primaryBtnText, { color: theme.accentContrast }]}>Create account</Text>}
        </TouchableOpacity>

        <Text style={[styles.foot, { color: theme.textMuted }]}>
          14-day free trial. No credit card required.
        </Text>

        <TouchableOpacity onPress={() => router.replace('/login')} style={{ padding: 14, alignItems: 'center', marginTop: 8 }}>
          <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '600' }}>
            Already have an account? Sign in
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  brand: { fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  sub: { fontSize: 14, marginTop: 6, marginBottom: 24, lineHeight: 20 },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.05, marginBottom: 6, marginTop: 4 },
  hint: { fontSize: 11, marginTop: -4, marginBottom: 20, lineHeight: 15 },
  primaryBtn: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  primaryBtnText: { fontSize: 16, fontWeight: '700' },
  foot: { fontSize: 11, textAlign: 'center', marginTop: 14, lineHeight: 16 },
});
