import { TouchableOpacity } from 'react-native';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearUser } from '../../lib/storage';

async function logout() {
  await clearUser();
  router.replace('/login');
}

export default function CrewLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: { backgroundColor: '#0a0a0a', borderTopColor: '#1e1e1e', height: 60 + insets.bottom, paddingBottom: 8 + insets.bottom },
        tabBarActiveTintColor: '#0ea5e9',
        tabBarInactiveTintColor: '#888',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        headerStyle: { backgroundColor: '#0a0a0a' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        headerRight: () => (
          <TouchableOpacity onPress={logout} style={{ marginRight: 16 }}>
            <Ionicons name="log-out-outline" size={22} color="#888" />
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Check In',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'location' : 'location-outline'} size={size} color={color} />,
          headerTitle: 'LinkCrew',
        }}
      />
      <Tabs.Screen
        name="photo"
        options={{
          title: 'Photo',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'camera' : 'camera-outline'} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="hours"
        options={{
          title: 'Hours',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'time' : 'time-outline'} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="notes"
        options={{
          title: 'Notes',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'create' : 'create-outline'} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="supplies"
        options={{
          title: 'Supplies',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'layers' : 'layers-outline'} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="bottleneck"
        options={{
          title: 'Issues',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'alert-circle' : 'alert-circle-outline'} size={size} color={color} />,
        }}
      />
      {/* Nested dynamic route — hidden from tab bar; reached via router.push from the jobs list */}
      <Tabs.Screen name="job/[id]" options={{ href: null, title: 'Job' }} />
    </Tabs>
  );
}
