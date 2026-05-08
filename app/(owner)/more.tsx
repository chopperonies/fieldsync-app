import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  { label: 'Messages',        icon: 'chatbubbles-outline',    route: '/(owner)/messages',  show: () => true },
  { label: 'Requests',        icon: 'file-tray-full-outline', route: '/(owner)/requests',  show: () => true },
  { label: 'Clients',         icon: 'people-outline',         route: '/(owner)/clients',   show: () => true },
  { label: 'Invoices',        icon: 'card-outline',           route: '/(owner)/invoices',  show: (r) => canCreateInvoices(r) },
  { label: 'Photos',          icon: 'camera-outline',         route: '/(owner)/photos',    show: () => true },
  { label: 'Supplies',        icon: 'layers-outline',         route: '/(owner)/supplies',  show: () => true },
  { label: 'Business health', icon: 'stats-chart-outline',    route: '/(owner)/dashboard', show: (r) => canSeeFinancials(r) },
  { label: 'Manage team',     icon: 'person-circle-outline',  route: '/(owner)/crew',      show: () => true },
  { label: 'Settings',        icon: 'options-outline',        route: '/(owner)/settings',  show: () => true },
];

export default function More() {
  const theme = useTheme();
  const role = useRole();
  const insets = useSafeAreaInsets();
  const visibleItems = ITEMS.filter(item => item.show(role));
  async function handleLogout() {
    await clearUser();
    router.replace('/login');
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ paddingBottom: 140 }}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={{ color: theme.textPrimary, fontSize: 22, fontWeight: '800' }}>More</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 4 }}>Work, clients, billing, settings</Text>
      </View>

      <View style={styles.tileRow}>
        <TouchableOpacity
          style={[styles.featureTile, { backgroundColor: theme.surfaceInset }]}
          activeOpacity={0.75}
          onPress={() => router.push('/(owner)/requests' as any)}
        >
          <Ionicons name="file-tray-full-outline" size={22} color={theme.stageAmber} />
          <Text style={{ color: theme.textPrimary, fontSize: 16, fontWeight: '800' }}>Requests</Text>
          <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700' }}>Review and book</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.featureTile, { backgroundColor: theme.surfaceInset }]}
          activeOpacity={0.75}
          onPress={() => router.push('/(owner)/invoices' as any)}
        >
          <Ionicons name="card-outline" size={22} color={theme.stageBlue} />
          <Text style={{ color: theme.textPrimary, fontSize: 16, fontWeight: '800' }}>Invoices</Text>
          <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700' }}>Send and collect</Text>
        </TouchableOpacity>
      </View>

      {visibleItems.map((item, i) => (
        <View key={`${item.label}-${item.route}`}>
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
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  tileRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  featureTile: {
    flex: 1,
    minHeight: 92,
    borderRadius: 8,
    padding: 14,
    justifyContent: 'space-between',
  },
  logoutBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
});
