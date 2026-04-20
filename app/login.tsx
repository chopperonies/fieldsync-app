import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator
} from 'react-native';
import { router } from 'expo-router';
import { supabase, Role } from '../lib/supabase';
import { saveUser, savePlan, getBiometricPrompted, setBiometricPrompted, setBiometricEnabled } from '../lib/storage';
import { registerPushToken } from '../lib/notifications';
import { isBiometricAvailable } from '../lib/biometric';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!phone.trim()) {
      Alert.alert('Missing info', 'Please enter your phone number.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('https://linkcrew.io/api/login-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.employee) {
        Alert.alert(
          'Not found',
          payload.error || 'Your phone number is not registered. Ask your manager to add you to the team.'
        );
        return;
      }
      const employee = payload.employee;

      await saveUser(employee);

      // Fetch and store plan info for owners
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

      // First-time biometric enrollment prompt
      const [prompted, available] = await Promise.all([getBiometricPrompted(), isBiometricAvailable()]);
      if (!prompted && available) {
        await setBiometricPrompted();
        Alert.alert(
          'Enable App Lock?',
          'Use Face ID or fingerprint to secure the app when you reopen it.',
          [
            { text: 'Not Now', style: 'cancel' },
            { text: 'Enable', onPress: () => setBiometricEnabled(true) },
          ]
        );
      }

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
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not sign in.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>LinkCrew</Text>
        <Text style={styles.subtitle}>Field crew management</Text>

        <TextInput
          style={styles.input}
          placeholder="Phone number"
          placeholderTextColor="#555"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoFocus
        />

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#000" />
            : <Text style={styles.buttonText}>Sign In</Text>
          }
        </TouchableOpacity>

        <Text style={styles.hint}>Your manager adds you to the team. Contact them if you can't sign in.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  inner: { flex: 1, justifyContent: 'center', padding: 28 },
  logo: { fontSize: 36, fontWeight: '800', color: '#0ea5e9', marginBottom: 6 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 48 },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    marginBottom: 14,
  },
  button: {
    backgroundColor: '#0ea5e9',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#000' },
  hint: { color: '#444', fontSize: 13, textAlign: 'center', marginTop: 20 },
});
