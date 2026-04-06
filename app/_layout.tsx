import { useEffect, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, AppStateStatus, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { getBiometricEnabled, getUser } from '../lib/storage';
import { authenticate } from '../lib/biometric';

const LOCK_AFTER_MS = 5 * 60 * 1000; // lock after 5 minutes in background

export default function RootLayout() {
  const [locked, setLocked] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  async function tryUnlock() {
    setAuthenticating(true);
    const success = await authenticate();
    setAuthenticating(false);
    if (success) setLocked(false);
  }

  useEffect(() => {
    let enabled = false;
    let loggedIn = false;

    async function init() {
      enabled = await getBiometricEnabled();
      const user = await getUser();
      loggedIn = !!user;
    }
    init();

    const subscription = AppState.addEventListener('change', async (state: AppStateStatus) => {
      // Refresh enabled/loggedIn state on each transition
      enabled = await getBiometricEnabled();
      const user = await getUser();
      loggedIn = !!user;

      if (state === 'background' || state === 'inactive') {
        backgroundedAt.current = Date.now();
      } else if (state === 'active') {
        const since = backgroundedAt.current ? Date.now() - backgroundedAt.current : 0;
        if (enabled && loggedIn && since > LOCK_AFTER_MS) {
          setLocked(true);
          setAuthenticating(true);
          const success = await authenticate();
          setAuthenticating(false);
          if (success) setLocked(false);
        }
        backgroundedAt.current = null;
      }
    });

    return () => subscription.remove();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0a0a0a' },
          headerTintColor: '#ffffff',
          contentStyle: { backgroundColor: '#0a0a0a' },
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(crew)" options={{ headerShown: false }} />
        <Stack.Screen name="(manager)" options={{ headerShown: false }} />
        <Stack.Screen name="(owner)" options={{ headerShown: false }} />
      </Stack>

      {locked && (
        <View style={styles.lockScreen}>
          <Text style={styles.lockLogo}>Link<Text style={styles.lockLogoAccent}>Crew</Text></Text>
          <Text style={styles.lockSub}>Your session is locked</Text>
          {authenticating
            ? <ActivityIndicator size="large" color="#0ea5e9" style={{ marginTop: 32 }} />
            : (
              <TouchableOpacity style={styles.unlockBtn} onPress={tryUnlock}>
                <Text style={styles.unlockBtnText}>Unlock with Face ID / Fingerprint</Text>
              </TouchableOpacity>
            )
          }
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  lockScreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  lockLogo: { fontSize: 38, fontWeight: '800', color: '#fff' },
  lockLogoAccent: { color: '#0ea5e9' },
  lockSub: { color: '#555', fontSize: 15, marginTop: 8 },
  unlockBtn: {
    marginTop: 40,
    backgroundColor: '#0ea5e9',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 28,
  },
  unlockBtnText: { color: '#000', fontWeight: '700', fontSize: 15 },
});
