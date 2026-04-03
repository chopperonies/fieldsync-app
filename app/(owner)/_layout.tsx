import { useEffect, useState } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, Linking } from 'react-native';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { clearUser, getPlan } from '../../lib/storage';

async function logout() {
  await clearUser();
  router.replace('/login');
}

export default function OwnerLayout() {
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    getPlan().then(p => {
      if (p?.subscription_status === 'canceled' || p?.subscription_status === 'past_due') {
        setLocked(true);
      }
    });
  }, []);

  if (locked) {
    return (
      <View style={styles.lockout}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.lockTitle}>Subscription Required</Text>
        <Text style={styles.lockBody}>
          Your LinkCrew subscription is inactive. Choose a plan to restore access to your dashboard.
        </Text>
        <TouchableOpacity style={styles.lockBtn} onPress={() => Linking.openURL('https://linkcrew.io/pricing')}>
          <Text style={styles.lockBtnText}>View Plans</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    );
  }

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

const styles = StyleSheet.create({
  lockout: { flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center', padding: 32 },
  lockIcon: { fontSize: 48, marginBottom: 16 },
  lockTitle: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  lockBody: { color: '#555', fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 32 },
  lockBtn: { backgroundColor: '#0265dc', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, marginBottom: 12 },
  lockBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  logoutBtn: { padding: 12 },
  logoutText: { color: '#444', fontSize: 13 },
});
