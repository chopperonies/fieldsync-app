import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl, Alert
} from 'react-native';
import { supabase, SupplyRequest } from '../../lib/supabase';
import { getUser } from '../../lib/storage';

const STATUS_COLORS: Record<string, string> = {
  pending: '#0ea5e9',
  ordered: '#3b82f6',
  delivered: '#4ade80',
};

export default function ManagerSupplies() {
  const [requests, setRequests] = useState<SupplyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const user = await getUser();
    let q = supabase.from('supply_requests').select('*, jobs(name), employees(name)').order('created_at', { ascending: false });
    if (user?.tenant_id) q = q.eq('tenant_id', user.tenant_id);
    const { data } = await q;
    setRequests(data || []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function updateStatus(id: string, status: string) {
    await supabase.from('supply_requests').update({ status }).eq('id', id);
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: status as any } : r));
  }

  function confirmUpdate(id: string, status: string, label: string) {
    Alert.alert(`Mark as ${label}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: label, onPress: () => updateStatus(id, status) },
    ]);
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#0ea5e9" /></View>;
  }

  return (
    <FlatList
      data={requests}
      keyExtractor={r => r.id}
      style={styles.container}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#0ea5e9" />}
      ListEmptyComponent={<Text style={styles.empty}>No supply requests yet.</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.jobName}>{(item.jobs as any)?.name}</Text>
              <Text style={styles.employee}>👷 {(item.employees as any)?.name}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] + '22' }]}>
              <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] }]}>
                {item.status.toUpperCase()}
              </Text>
            </View>
          </View>

          <Text style={styles.items}>{item.items}</Text>
          <Text style={styles.meta}>
            {item.urgency === 'same_day' ? '🔴 Same day' : '🟡 Next day'} · {new Date(item.created_at).toLocaleDateString()}
          </Text>

          {item.status !== 'delivered' && (
            <View style={styles.actions}>
              {item.status === 'pending' && (
                <TouchableOpacity style={styles.actionBtn} onPress={() => confirmUpdate(item.id, 'ordered', 'Ordered')}>
                  <Text style={styles.actionText}>Mark Ordered</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#052e16', borderColor: '#4ade80' }]}
                onPress={() => confirmUpdate(item.id, 'delivered', 'Delivered')}
              >
                <Text style={[styles.actionText, { color: '#4ade80' }]}>Mark Delivered</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  empty: { color: '#444', textAlign: 'center', marginTop: 60, fontSize: 15 },
  card: {
    backgroundColor: '#1a1a1a', borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: '#2a2a2a',
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  jobName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  employee: { color: '#666', fontSize: 13, marginTop: 2 },
  statusBadge: { borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  statusText: { fontSize: 11, fontWeight: '700' },
  items: { color: '#ccc', fontSize: 14, marginBottom: 6 },
  meta: { color: '#555', fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: {
    flex: 1, borderRadius: 8, padding: 10, alignItems: 'center',
    backgroundColor: '#e8f0fd', borderWidth: 1, borderColor: '#0ea5e9',
  },
  actionText: { color: '#0ea5e9', fontWeight: '600', fontSize: 13 },
});
