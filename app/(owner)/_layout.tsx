import { TouchableOpacity } from 'react-native';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { clearUser } from '../../lib/storage';

async function logout() {
  await clearUser();
  router.replace('/login');
}

export default function OwnerLayout() {
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
          title: 'Overview',
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" size={size} color={color} />,
          headerTitle: 'LinkCrew',
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Jobs',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} />,
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
          title: 'Manage',
          tabBarIcon: ({ color, size }) => <Ionicons name="briefcase" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="crew"
        options={{
          title: 'Crew',
          tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="photos"
        options={{
          title: 'Photos',
          tabBarIcon: ({ color, size }) => <Ionicons name="images" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: 'Clients',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="invoices"
        options={{
          title: 'Invoices',
          tabBarIcon: ({ color, size }) => <Ionicons name="receipt" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
