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
      router.replace(`/(${user.role})` as any);
    } else {
      router.replace('/login');
    }
  }, [rootNavState?.key, user]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' }}>
      <ActivityIndicator size="large" color="#0ea5e9" />
    </View>
  );
}
