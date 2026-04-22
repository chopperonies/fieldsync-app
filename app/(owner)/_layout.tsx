import { useEffect, useState } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, Linking } from 'react-native';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearUser, getPlan, getUser } from '../../lib/storage';
import { mobileGet } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import OwnerFab from '../../components/OwnerFab';

async function logout() {
  await clearUser();
  router.replace('/login');
}

type LockState = 'subscription' | 'paused' | 'blocked' | null;

export default function OwnerLayout() {
  const theme = useTheme();
  const [lockState, setLockState] = useState<LockState>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    async function checkStatus() {
      const user = await getUser();
      if (user?.tenant_id) {
        try {
          const data: any = await mobileGet('/api/mobile/tenant-plan');
          if (data?.blocked) { setLockState('blocked'); return; }
          if (data?.paused) { setLockState('paused'); return; }
          const trialExpired = data?.subscription_status === 'trialing' && data?.trial_ends_at && new Date(data.trial_ends_at) < new Date();
          if (trialExpired || data?.subscription_status === 'canceled' || data?.subscription_status === 'past_due') {
            setLockState('subscription');
          }
        } catch {
          // Non-blocking — stay unlocked
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
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
    <Tabs
      backBehavior="history"
      screenOptions={{
        tabBarStyle: { backgroundColor: theme.bg, borderTopColor: theme.border, height: 60 + insets.bottom, paddingBottom: 8 + insets.bottom },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        headerStyle: { backgroundColor: theme.bg },
        headerTintColor: theme.textPrimary,
        headerTitleStyle: { fontWeight: '700', color: theme.textPrimary },
        headerRight: undefined,
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
          title: 'Schedule',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={size} color={color} />,
          headerTitle: 'Schedule',
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'search' : 'search-outline'} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={size} color={color} />,
          headerTitle: 'Messages',
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size, focused }) =>
            <Ionicons name={focused ? 'grid' : 'grid-outline'} size={size} color={color} />,
          headerTitle: 'More',
        }}
      />
      {/* Hidden from tab bar — accessible via Search, More screen, or deep links */}
      <Tabs.Screen name="clients"   options={{ href: null }} />
      <Tabs.Screen name="crew"      options={{ href: null }} />
      <Tabs.Screen name="invoices"  options={{ href: null }} />
      <Tabs.Screen name="photos"    options={{ href: null }} />
      <Tabs.Screen name="supplies"  options={{ href: null }} />
      <Tabs.Screen name="dashboard" options={{ href: null }} />
      <Tabs.Screen name="settings"  options={{ href: null }} />
      <Tabs.Screen name="job/[id]"  options={{ href: null, title: 'Job' }} />
      <Tabs.Screen name="message/[id]"  options={{ href: null, title: 'Message' }} />
      <Tabs.Screen name="message-new"   options={{ href: null, title: 'New message' }} />
      <Tabs.Screen name="expense-new"   options={{ href: null, title: 'New expense' }} />
    </Tabs>
    <OwnerFab />
    </View>
  );
}

const styles = StyleSheet.create({
  lockout: { flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center', padding: 32 },
  lockIcon: { fontSize: 48, marginBottom: 16 },
  lockTitle: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  lockBody: { color: '#555', fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 32 },
  lockBtn: { backgroundColor: '#0ea5e9', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, marginBottom: 12 },
  lockBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  logoutBtn: { padding: 12 },
  logoutText: { color: '#444', fontSize: 13 },
});
