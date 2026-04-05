import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { clearUser } from '../../lib/storage';

const ITEMS = [
  { label: 'Invoices',  icon: 'cash',         route: '/(owner)/invoices'  },
  { label: 'Photos',    icon: 'camera',        route: '/(owner)/photos'    },
  { label: 'Supplies',  icon: 'layers',        route: '/(owner)/supplies'  },
  { label: 'Dashboard', icon: 'stats-chart',   route: '/(owner)/dashboard' },
  { label: 'Settings',  icon: 'settings',      route: '/(owner)/settings'  },
];

export default function More() {
  async function handleLogout() {
    await clearUser();
    router.replace('/login');
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      {ITEMS.map((item) => (
        <TouchableOpacity
          key={item.route}
          style={styles.row}
          onPress={() => router.push(item.route as any)}
          activeOpacity={0.7}
        >
          <View style={styles.iconWrap}>
            <Ionicons name={item.icon as any} size={22} color="#0265dc" />
          </View>
          <Text style={styles.label}>{item.label}</Text>
          <Ionicons name="chevron-forward" size={18} color="#444" />
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={[styles.row, styles.logoutRow]} onPress={handleLogout} activeOpacity={0.7}>
        <View style={[styles.iconWrap, { backgroundColor: '#1a0a0a' }]}>
          <Ionicons name="log-out-outline" size={22} color="#ef4444" />
        </View>
        <Text style={[styles.label, { color: '#ef4444' }]}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#111', borderRadius: 12, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: '#1e1e1e',
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: '#0a1a2e', justifyContent: 'center', alignItems: 'center',
  },
  label: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '600' },
  logoutRow: { marginTop: 10 },
});
