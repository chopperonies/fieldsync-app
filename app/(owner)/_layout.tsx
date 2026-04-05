import { useEffect, useState } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, Linking } from 'react-native';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { clearUser, getPlan, getUser } from '../../lib/storage';
import { supabase } from '../../lib/supabase';

async function logout() {
  await clearUser();
  router.replace('/login');
}

type LockState = 'subscription' | 'paused' | 'blocked' | null;

export default function OwnerLayout() {
  const [lockState, setLockState] = useState<LockState>(null);

  useEffect(() => {
    async function checkStatus() {
      const user = await getUser();
      if (user?.tenant_id) {
        const { data } = await supabase.from('tenants')
          .select('subscription_status, trial_ends_at, paused, blocked')
          .eq('id', user.tenant_id).single();
        if (data?.blocked) { setLockState('blocked'); return; }
        if (data?.paused) { setLockState('paused'); return; }
        const trialExpired = data?.subscription_status === 'trialing' && data?.trial_ends_at && new Date(data.trial_ends_at) < new Date();
        if (trialExpired || data?.subscription_status === 'canceled' || data?.subscription_status === 'past_due') {
          setLockState('subscription');
        }
      }
    }
    checkStatus();
  }, []);

  if (lockState === 'blocked') {
    return (
      <View style={styles.lockout}>
        <Text style={styles.lockIcon}>🚫</Text>
        <Text style={styles.lockTitle}>Account Suspended</Text>
        <Text style={styles.lockBody}>Your account has been suspended. Contact hello@linkcrew.io for more information.</Text>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (lockState === 'paused') {
    return (
      <View style={styles.lockout}>
        <Text style={styles.lockIcon}>⏸</Text>
        <Text style={styles.lockTitle}>Account Paused</Text>
        <Text style={styles.lockBody}>Your account has been paused. Choose a plan to restore access.</Text>
        <TouchableOpacity style={styles.lockBtn} onPress={() => Linking.openURL('https://linkcrew.io/pricing')}>
          <Text style={styles.lockBtnText}>View Plans</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (lockState === 'subscription') {
    return (
      <View style={styles.lockout}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.lockTitle}>Subscription Required</Text>
        <Text style={styles.lockBody}>Your LinkCrew subscription is inactive. Choose a plan to restore access.</Text>
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
        tabBarStyle: { backgroundColor: '#0a0a0a', borderTopColor: '#1e1e1e', height: 60, paddingBottom: 8 },
        tabBarActiveTintColor: '#0265dc',
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
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />,
          headerTitle: 'LinkCrew',
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: 'Jobs',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'hammer' : 'hammer-outline'} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: 'Clients',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'people' : 'people-outline'} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="invoices"
        options={{
          title: 'Invoices',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'cash' : 'cash-outline'} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="crew"
        options={{
          title: 'Crew',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="photos"
        options={{
          title: 'Photos',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'camera' : 'camera-outline'} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'stats-chart' : 'stats-chart-outline'} size={size} color={color} />,
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
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'settings' : 'settings-outline'} size={size} color={color} />,
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
