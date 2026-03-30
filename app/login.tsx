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
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!phone.trim() || !name.trim()) {
      Alert.alert('Missing info', 'Please enter your name and phone number.');
      return;
    }
    setLoading(true);
    try {
      // Look up employee by phone
      let { data: employee } = await supabase
        .from('employees')
        .select('*')
        .eq('phone', phone.trim())
        .single();

      if (!employee) {
        // Auto-register as crew
        const { data: newEmp, error } = await supabase
          .from('employees')
          .insert({ name: name.trim(), phone: phone.trim(), role: 'crew' })
          .select()
          .single();
        if (error) throw error;
        employee = newEmp;
      }

      // Register push token and save to Supabase
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
        <Text style={styles.logo}>⚡ FieldSync</Text>
        <Text style={styles.subtitle}>Field crew management</Text>

        <TextInput
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor="#555"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />
        <TextInput
          style={styles.input}
          placeholder="Phone number"
          placeholderTextColor="#555"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#000" />
            : <Text style={styles.buttonText}>Sign In</Text>
          }
        </TouchableOpacity>

        <Text style={styles.hint}>New? You'll be registered automatically as crew.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  inner: { flex: 1, justifyContent: 'center', padding: 28 },
  logo: { fontSize: 36, fontWeight: '800', color: '#f97316', marginBottom: 6 },
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
    backgroundColor: '#f97316',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#000' },
  hint: { color: '#444', fontSize: 13, textAlign: 'center', marginTop: 20 },
});
