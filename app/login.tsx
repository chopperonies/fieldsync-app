import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Role } from '../lib/supabase';
import {
  saveUser, savePlan, getLoginRole, setLoginRole, LoginRole,
} from '../lib/storage';
import { registerPushToken } from '../lib/notifications';

export default function Login() {
  const [role, setRole] = useState<LoginRole>('owner');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => setRole(await getLoginRole()))();
  }, []);

  async function onRoleChange(next: LoginRole) {
    setRole(next);
    await setLoginRole(next);
  }

  async function loginCrew() {
    if (!phone.trim()) return Alert.alert('Missing info', 'Enter your phone number.');
    setLoading(true);
    try {
      const res = await fetch('https://linkcrew.io/api/login-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.employee) {
        Alert.alert('Not found', payload.error || 'Phone not registered. If you are the account owner, switch to the Owner tab.');
        return;
      }
      await finishLogin(payload.employee);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not sign in.');
    } finally {
      setLoading(false);
    }
  }

  async function loginOwner() {
    if (!email.trim() || !password) return Alert.alert('Missing info', 'Enter your email and password.');
    setLoading(true);
    try {
      const res = await fetch('https://linkcrew.io/api/login-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.employee) {
        Alert.alert('Sign in failed', payload.error || 'Invalid email or password.');
        return;
      }
      await finishLogin(payload.employee);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not sign in.');
    } finally {
      setLoading(false);
    }
  }

  async function finishLogin(employee: any) {
    await saveUser(employee);

    if (employee.role === 'owner' && employee.tenant_id) {
      try {
        const planRes = await fetch('https://linkcrew.io/api/mobile/tenant-plan', {
          headers: { Authorization: `Bearer ${employee.mobile_session_token}` },
        });
        if (planRes.ok) {
          const tenant = await planRes.json();
          await savePlan({
            plan: tenant.plan ?? null,
            subscription_status: tenant.subscription_status ?? null,
            max_users: tenant.max_users ?? 1,
          });
        }
      } catch {}
    }

    router.replace(`/(${employee.role as Role})` as any);

    // Register push token in background — don't block login
    registerPushToken().then(pushToken => {
      if (pushToken) {
        fetch('https://linkcrew.io/api/mobile/push-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${employee.mobile_session_token}`,
          },
          body: JSON.stringify({ push_token: pushToken }),
        });
      }
    }).catch(() => {});
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>LinkCrew</Text>
        <Text style={styles.subtitle}>Field crew management</Text>

        <View style={styles.toggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, role === 'owner' && styles.toggleBtnActive]}
            onPress={() => onRoleChange('owner')}
          >
            <Text style={[styles.toggleText, role === 'owner' && styles.toggleTextActive]}>Owner</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, role === 'crew' && styles.toggleBtnActive]}
            onPress={() => onRoleChange('crew')}
          >
            <Text style={[styles.toggleText, role === 'crew' && styles.toggleTextActive]}>Crew / Manager</Text>
          </TouchableOpacity>
        </View>

        {role === 'owner' ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#555"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              autoComplete="email"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#555"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
            />
            <TouchableOpacity style={styles.button} onPress={loginOwner} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.buttonText}>Sign In</Text>}
            </TouchableOpacity>
            <Text style={styles.hint}>Use the same email and password you use at linkcrew.io/app.</Text>
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="Phone number"
              placeholderTextColor="#555"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
            />
            <TouchableOpacity style={styles.button} onPress={loginCrew} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.buttonText}>Sign In</Text>}
            </TouchableOpacity>
            <Text style={styles.hint}>Your manager adds you to the team by phone number. Contact them if you can't sign in.</Text>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  inner: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  logo: { fontSize: 36, fontWeight: '800', color: '#0ea5e9', marginBottom: 6 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 32 },
  toggle: {
    flexDirection: 'row', backgroundColor: '#111', borderRadius: 12,
    padding: 4, marginBottom: 18, borderWidth: 1, borderColor: '#1e1e1e',
  },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 9 },
  toggleBtnActive: { backgroundColor: '#0ea5e9' },
  toggleText: { color: '#666', fontSize: 14, fontWeight: '700' },
  toggleTextActive: { color: '#000' },
  input: {
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
    borderRadius: 12, padding: 16, fontSize: 16, color: '#fff', marginBottom: 12,
  },
  button: {
    backgroundColor: '#0ea5e9', borderRadius: 12,
    padding: 16, alignItems: 'center', marginTop: 4,
  },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#000' },
  hint: { color: '#444', fontSize: 13, textAlign: 'center', marginTop: 18 },
});
