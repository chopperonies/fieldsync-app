import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router, useRootNavigationState } from 'expo-router';
import { getUser } from '../lib/storage';

export default function Index() {
  const rootNavState = useRootNavigationState();
  const [user, setUser] = useState<any>(undefined);

  useEffect(() => {
    getUser().then(setUser);
  }, []);

  useEffect(() => {
    if (!rootNavState?.key || user === undefined) return;
    if (user) {
      // Unified app: every role lands on (owner) with role-gated UI inside.
      // Legacy (crew) route group still exists on disk but isn't the
      // entry point anymore. Restricted views are handled by useRole().
      router.replace('/(owner)' as any);
    } else {
      // First-launch chooser: "Start a new business" vs "Join my team".
      router.replace('/landing' as any);
    }
  }, [rootNavState?.key, user]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' }}>
      <ActivityIndicator size="large" color="#0ea5e9" />
    </View>
  );
}
