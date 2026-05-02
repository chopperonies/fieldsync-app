import { useCallback, useEffect, useRef, useState } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, AppStateStatus } from 'react-native';
import { getLockMethod, getLockPrompted, setLockPrompted, getUser, LockMethod } from '../lib/storage';
import { addNotificationResponseListener } from '../lib/notifications';
import { ThemeProvider, useTheme } from '../lib/themeContext';
import LockScreen from '../components/LockScreen';
import LockSetup from '../components/LockSetup';

const LOCK_AFTER_MS = 5 * 60 * 1000; // re-lock after 5 minutes in background

function ThemedRoot() {
  const theme = useTheme();
  const [locked, setLocked] = useState(false);
  const [lockMethod, setLockMethodState] = useState<LockMethod>('none');
  const [showSetup, setShowSetup] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const refreshState = useCallback(async () => {
    const [m, user, prompted] = await Promise.all([getLockMethod(), getUser(), getLockPrompted()]);
    setLockMethodState(m);
    if (user && !prompted) setShowSetup(true);
    return { m, user };
  }, []);

  // Route notification taps to the right screen. Scope-update push opens
  // the crew job detail so the tech sees the update + ack banner in one tap.
  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let mounted = true;

    addNotificationResponseListener(resp => {
      const data: any = resp?.notification?.request?.content?.data || {};
      if (data.type === 'scope_updated' && data.job_id) {
        router.push({ pathname: '/(owner)/job/[id]', params: { id: String(data.job_id) } } as any);
      } else if (data.type === 'appointment' && data.job_id) {
        router.push({ pathname: '/(owner)/job/[id]', params: { id: String(data.job_id) } } as any);
      } else if (data.type === 'assigned' && data.job_id) {
        router.push({ pathname: '/(owner)/job/[id]', params: { id: String(data.job_id) } } as any);
      }
    }).then(listener => {
      if (!mounted) {
        listener?.remove();
        return;
      }
      sub = listener;
    });

    return () => {
      mounted = false;
      sub?.remove();
    };
  }, []);

  useEffect(() => {
    refreshState();
    const sub = AppState.addEventListener('change', async (state: AppStateStatus) => {
      const { m, user } = await refreshState();
      if (state === 'background' || state === 'inactive') {
        backgroundedAt.current = Date.now();
      } else if (state === 'active') {
        const since = backgroundedAt.current ? Date.now() - backgroundedAt.current : 0;
        if (user && m !== 'none' && since > LOCK_AFTER_MS) setLocked(true);
        backgroundedAt.current = null;
      }
    });
    return () => sub.remove();
  }, [refreshState]);

  async function onSetupDone() {
    await setLockPrompted();
    setShowSetup(false);
    const m = await getLockMethod();
    setLockMethodState(m);
  }

  return (
    <>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.bg },
          headerTintColor: theme.textPrimary,
          contentStyle: { backgroundColor: theme.bg },
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="landing" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false }} />
        <Stack.Screen name="(crew)" options={{ headerShown: false }} />
        <Stack.Screen name="(manager)" options={{ headerShown: false }} />
        <Stack.Screen name="(owner)" options={{ headerShown: false }} />
      </Stack>

      {locked && lockMethod !== 'none' && (
        <LockScreen method={lockMethod} onUnlocked={() => setLocked(false)} />
      )}

      {showSetup && !locked && (
        <LockSetup onDone={onSetupDone} />
      )}
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <ThemedRoot />
    </ThemeProvider>
  );
}
