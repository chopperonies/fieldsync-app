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
  const [hasRemembered, setHasRemembered] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const remembered = await getLoginRole();
      setRole(remembered);
      setHasRemembered(true);
    })();
  }, []);

  function switchRole(next: LoginRole) {
    // Casual switch crew → crew is free. Switching to owner gets a warning
    // when this device was previously signed in as crew.
    if (next === 'owner' && hasRemembered && role === 'crew') {
      Alert.alert(
        'Sign in as Owner?',
        'Only continue if you are the account owner. Failed owner sign-in attempts are logged.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            style: 'destructive',
            onPress: () => { setRole('owner'); setLoginRole('owner'); },
          },
        ],
      );
      return;
    }
    setRole(next);
    setLoginRole(next);
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
    // Remember the role on this device — next login screen defaults to it.
    await setLoginRole(employee.role === 'owner' ? 'owner' : 'crew');

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

        <Text style={styles.roleHeader}>
          {role === 'owner' ? 'Sign in as Owner' : 'Sign in as Crew / Manager'}
        </Text>

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
            <TouchableOpacity onPress={() => switchRole('crew')} style={styles.switchLink}>
              <Text style={styles.switchText}>I'm crew / manager — sign in with phone instead</Text>
            </TouchableOpacity>
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
            <TouchableOpacity onPress={() => switchRole('owner')} style={styles.switchLink}>
              <Text style={styles.switchText}>I'm the account owner — sign in with email</Text>
            </TouchableOpacity>
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
  roleHeader: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 14 },
  switchLink: { padding: 14, alignItems: 'center', marginTop: 4 },
  switchText: { color: '#0ea5e9', fontSize: 13, fontWeight: '600' },
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
