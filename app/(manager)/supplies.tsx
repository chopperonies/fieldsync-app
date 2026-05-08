import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SupplyRequest } from '../../lib/supabase';
import { mobileGet, mobilePatch } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import { ScreenHeader } from '../../components/Flat';

export default function ManagerSupplies() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const statusColors: Record<string, string> = {
    pending: theme.info,
    ordered: theme.accent,
    delivered: theme.success,
  };
  const [requests, setRequests] = useState<SupplyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await mobileGet<SupplyRequest[]>('/api/mobile/owner/supplies');
      setRequests(data || []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function updateStatus(id: string, status: string) {
    try {
      await mobilePatch(`/api/mobile/owner/supplies/${id}`, { status });
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: status as any } : r));
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not update.');
    }
  }

  function confirmUpdate(id: string, status: string, label: string) {
    Alert.alert(`Mark as ${label}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: label, onPress: () => updateStatus(id, status) },
    ]);
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.accent} /></View>;
  }

  const openCount = requests.filter(r => r.status !== 'delivered').length;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Supplies" subtitle={`${openCount} open ${openCount === 1 ? 'request' : 'requests'}`} showBack={false} />
      <FlatList
        data={requests}
        keyExtractor={r => r.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={theme.accent} />}
        ListEmptyComponent={<Text style={styles.empty}>No supply requests yet.</Text>}
        renderItem={({ item }) => {
          const color = statusColors[item.status] || theme.textSecondary;
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.jobName}>{(item.jobs as any)?.name}</Text>
                  <Text style={styles.employee}>{(item.employees as any)?.name}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: color + '22' }]}>
                  <Text style={[styles.statusText, { color }]}>{item.status.toUpperCase()}</Text>
                </View>
              </View>

              <Text style={styles.items}>{item.items}</Text>
              <View style={styles.metaRow}>
                <Ionicons
                  name={item.urgency === 'same_day' ? 'flash-outline' : 'time-outline'}
                  size={12}
                  color={item.urgency === 'same_day' ? theme.danger : theme.warning}
                />
                <Text style={styles.meta}>
                  {item.urgency === 'same_day' ? 'Same day' : 'Next day'} · {new Date(item.created_at).toLocaleDateString()}
                </Text>
              </View>

              {item.status !== 'delivered' && (
                <View style={styles.actions}>
                  {item.status === 'pending' && (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => confirmUpdate(item.id, 'ordered', 'Ordered')}>
                      <Text style={styles.actionText}>Mark ordered</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.actionBtn, { borderColor: theme.success, backgroundColor: theme.success + '14' }]}
                    onPress={() => confirmUpdate(item.id, 'delivered', 'Delivered')}
                  >
                    <Text style={[styles.actionText, { color: theme.success }]}>Mark delivered</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: t.bg },
    empty: { color: t.textMuted, textAlign: 'center', marginTop: 60, fontSize: 15 },
    card: {
      backgroundColor: t.surface, borderRadius: 14,
      padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
    jobName: { color: t.textPrimary, fontSize: 15, fontWeight: '700' },
    employee: { color: t.textSecondary, fontSize: 13, marginTop: 2 },
    statusBadge: { borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
    statusText: { fontSize: 11, fontWeight: '800' },
    items: { color: t.textPrimary, fontSize: 14, marginBottom: 6 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    meta: { color: t.textMuted, fontSize: 12 },
    actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
    actionBtn: {
      flex: 1, borderRadius: 8, padding: 10, alignItems: 'center',
      backgroundColor: t.accent + '14',
      borderWidth: 1, borderColor: t.accent + '55',
    },
    actionText: { color: t.accent, fontWeight: '700', fontSize: 13 },
  });
}
