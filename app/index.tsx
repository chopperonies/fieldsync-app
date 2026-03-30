import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { getUser } from '../lib/storage';

export default function Index() {
  useEffect(() => {
    getUser().then(user => {
      if (user) {
        router.replace(`/(${user.role})` as any);
      } else {
        router.replace('/login');
      }
    });
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' }}>
      <ActivityIndicator size="large" color="#f97316" />
    </View>
  );
}
