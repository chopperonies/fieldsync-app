import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { clearUser } from '../../lib/storage';
import { useTheme } from '../../lib/themeContext';

const ITEMS = [
  { label: 'Crew',      icon: 'person-circle', route: '/(owner)/crew'      },
  { label: 'Invoices',  icon: 'cash',          route: '/(owner)/invoices'  },
  { label: 'Photos',    icon: 'camera',        route: '/(owner)/photos'    },
  { label: 'Supplies',  icon: 'layers',        route: '/(owner)/supplies'  },
  { label: 'Dashboard', icon: 'stats-chart',   route: '/(owner)/dashboard' },
  { label: 'Settings',  icon: 'settings',      route: '/(owner)/settings'  },
];

export default function More() {
  const theme = useTheme();
  async function handleLogout() {
    await clearUser();
    router.replace('/login');
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20 }}>
      {ITEMS.map((item) => (
        <TouchableOpacity
          key={item.route}
          style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => router.push(item.route as any)}
          activeOpacity={0.7}
        >
          <View style={[styles.iconWrap, { backgroundColor: theme.accentMuted }]}>
            <Ionicons name={item.icon as any} size={22} color={theme.accent} />
          </View>
          <Text style={[styles.label, { color: theme.textPrimary }]}>{item.label}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={[styles.row, styles.logoutRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
        onPress={handleLogout}
        activeOpacity={0.7}
      >
        <View style={[styles.iconWrap, { backgroundColor: theme.dangerMuted }]}>
          <Ionicons name="log-out-outline" size={22} color={theme.danger} />
        </View>
        <Text style={[styles.label, { color: theme.danger }]}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 12, padding: 16,
    marginBottom: 10, borderWidth: 1,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  label: { flex: 1, fontSize: 15, fontWeight: '600' },
  logoutRow: { marginTop: 10 },
});
