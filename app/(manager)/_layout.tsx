import { TouchableOpacity } from 'react-native';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { clearUser } from '../../lib/storage';

async function logout() {
  await clearUser();
  router.replace('/login');
}

export default function ManagerLayout() {
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
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} />,
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
        name="jobs"
        options={{
          title: 'Jobs',
          tabBarIcon: ({ color, size }) => <Ionicons name="briefcase" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="photos"
        options={{
          title: 'Photos',
          tabBarIcon: ({ color, size }) => <Ionicons name="images" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
