import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator
} from 'react-native';
import { router } from 'expo-router';
import { supabase, Role } from '../lib/supabase';
import { saveUser } from '../lib/storage';
import { registerPushToken } from '../lib/notifications';

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
      const { data: employee, error } = await supabase
        .from('employees')
        .select('*')
        .eq('phone', phone.trim())
        .single();

      if (error || !employee) {
        Alert.alert(
          'Not found',
          'Your phone number is not registered. Ask your manager to add you to the team.'
        );
        return;
      }

      // Register push token
      const pushToken = await registerPushToken();
      if (pushToken) {
        await supabase.from('employees').update({ push_token: pushToken }).eq('id', employee.id);
        employee.push_token = pushToken;
      }

      await saveUser(employee);
      router.replace(`/(${employee.role as Role})` as any);
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
  logo: { fontSize: 36, fontWeight: '800', color: '#0265dc', marginBottom: 6 },
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
    backgroundColor: '#0265dc',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#000' },
  hint: { color: '#444', fontSize: 13, textAlign: 'center', marginTop: 20 },
});
