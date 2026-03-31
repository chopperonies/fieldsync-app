import { TouchableOpacity } from 'react-native';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { clearUser } from '../../lib/storage';

async function logout() {
  await clearUser();
  router.replace('/login');
}

export default function CrewLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: { backgroundColor: '#0a0a0a', borderTopColor: '#1a1a1a' },
        tabBarActiveTintColor: '#0265dc',
        tabBarInactiveTintColor: '#555',
        headerStyle: { backgroundColor: '#0a0a0a' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        headerRight: () => (
          <TouchableOpacity onPress={logout} style={{ marginRight: 16 }}>
            <Ionicons name="log-out-outline" size={22} color="#555" />
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Check In',
          tabBarIcon: ({ color, size }) => <Ionicons name="location" size={size} color={color} />,
          headerTitle: 'LinkCrew',
        }}
      />
      <Tabs.Screen
        name="supplies"
        options={{
          title: 'Supplies',
          tabBarIcon: ({ color, size }) => <Ionicons name="cube" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="bottleneck"
        options={{
          title: 'Bottleneck',
          tabBarIcon: ({ color, size }) => <Ionicons name="warning" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="photo"
        options={{
          title: 'Photo',
          tabBarIcon: ({ color, size }) => <Ionicons name="camera" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="notes"
        options={{
          title: 'Notes',
          tabBarIcon: ({ color, size }) => <Ionicons name="document-text" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="hours"
        options={{
          title: 'Hours',
          tabBarIcon: ({ color, size }) => <Ionicons name="time" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
