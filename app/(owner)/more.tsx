import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { clearUser } from '../../lib/storage';
import { useTheme } from '../../lib/themeContext';
import { Row, RowAvatar, Divider } from '../../components/Flat';

const ITEMS: Array<{ label: string; icon: keyof typeof Ionicons.glyphMap; route: string }> = [
  { label: 'Crew',      icon: 'person-circle-outline', route: '/(owner)/crew'      },
  { label: 'Invoices',  icon: 'cash-outline',          route: '/(owner)/invoices'  },
  { label: 'Photos',    icon: 'camera-outline',        route: '/(owner)/photos'    },
  { label: 'Supplies',  icon: 'layers-outline',        route: '/(owner)/supplies'  },
  { label: 'Dashboard', icon: 'stats-chart-outline',   route: '/(owner)/dashboard' },
  { label: 'Settings',  icon: 'settings-outline',      route: '/(owner)/settings'  },
];

export default function More() {
  const theme = useTheme();
  async function handleLogout() {
    await clearUser();
    router.replace('/login');
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ paddingBottom: 140 }}>
      {ITEMS.map((item, i) => (
        <View key={item.route}>
          {i > 0 ? <Divider inset={64} /> : null}
          <Row
            leading={<RowAvatar icon={item.icon} tint={theme.accent} />}
            title={item.label}
            trailing={<Ionicons name="chevron-forward" size={16} color={theme.textMuted} />}
            onPress={() => router.push(item.route as any)}
          />
        </View>
      ))}
      <View style={{ height: 24 }} />
      <TouchableOpacity
        style={styles.logoutBar}
        onPress={handleLogout}
        activeOpacity={0.7}
      >
        <RowAvatar icon="log-out-outline" tint={theme.danger} />
        <Text style={{ color: theme.danger, fontSize: 15, fontWeight: '700' }}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  logoutBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
});
