import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { clearUser } from '../../lib/storage';
import { useTheme } from '../../lib/themeContext';
import { Row, RowAvatar, Divider } from '../../components/Flat';
import { useRole, canCreateInvoices, canSeeFinancials } from '../../lib/useRole';

type Item = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  show: (role: ReturnType<typeof useRole>) => boolean;
};

const ITEMS: Item[] = [
  { label: 'Crew',      icon: 'person-circle-outline', route: '/(owner)/crew',      show: () => true },
  { label: 'Clients',   icon: 'people-outline',        route: '/(owner)/clients',   show: () => true },
  { label: 'Invoices',  icon: 'cash-outline',          route: '/(owner)/invoices',  show: (r) => canCreateInvoices(r) },
  { label: 'Photos',    icon: 'camera-outline',        route: '/(owner)/photos',    show: () => true },
  { label: 'Supplies',  icon: 'layers-outline',        route: '/(owner)/supplies',  show: () => true },
  { label: 'Dashboard', icon: 'stats-chart-outline',   route: '/(owner)/dashboard', show: (r) => canSeeFinancials(r) },
  { label: 'Settings',  icon: 'settings-outline',      route: '/(owner)/settings',  show: () => true },
];

export default function More() {
  const theme = useTheme();
  const role = useRole();
  const visibleItems = ITEMS.filter(item => item.show(role));
  async function handleLogout() {
    await clearUser();
    router.replace('/login');
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ paddingBottom: 140 }}>
      {visibleItems.map((item, i) => (
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
