import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl, Alert
} from 'react-native';
import { supabase, Invoice } from '../../lib/supabase';
import { getUser } from '../../lib/storage';

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  draft:   { color: '#555',    label: 'Draft' },
  sent:    { color: '#0265dc', label: 'Sent' },
  paid:    { color: '#4ade80', label: 'Paid' },
  overdue: { color: '#ef4444', label: 'Overdue' },
};

export default function OwnerInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  const loadData = useCallback(async () => {
    const user = await getUser();
    let q = supabase
      .from('invoices')
      .select('*, jobs(name, address), clients(name, email)')
      .order('created_at', { ascending: false });
    if (user?.tenant_id) q = q.eq('tenant_id', user.tenant_id);
    const { data } = await q;
    setInvoices(data || []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = filter === 'all' ? invoices : invoices.filter(i => i.status === filter);

  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount || 0), 0);
  const totalOwed = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + (i.amount || 0), 0);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#0265dc" /></View>;
  }

  return (
    <View style={styles.container}>
      {/* Summary */}
      <View style={styles.summary}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>${totalPaid.toLocaleString()}</Text>
          <Text style={styles.summaryLabel}>Collected</Text>
        </View>
        <View style={[styles.summaryCard, { borderColor: '#0265dc44' }]}>
          <Text style={[styles.summaryValue, { color: '#0265dc' }]}>${totalOwed.toLocaleString()}</Text>
          <Text style={styles.summaryLabel}>Outstanding</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={styles.filters}>
        {['all', 'sent', 'paid', 'overdue', 'draft'].map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#0265dc" />}
        ListEmptyComponent={<Text style={styles.empty}>No invoices found.</Text>}
        renderItem={({ item }) => {
          const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.draft;
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.jobName}>{(item.jobs as any)?.name || 'Unknown job'}</Text>
                  {(item.clients as any)?.name && (
                    <Text style={styles.clientName}>👤 {(item.clients as any).name}</Text>
                  )}
                </View>
                <View>
                  <Text style={styles.amount}>${(item.amount || 0).toLocaleString()}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: cfg.color + '22' }]}>
                    <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.cardMeta}>
                <Text style={styles.metaText}>
                  Created {new Date(item.created_at).toLocaleDateString()}
                </Text>
                {item.sent_at && (
                  <Text style={styles.metaText}>Sent {new Date(item.sent_at).toLocaleDateString()}</Text>
                )}
                {item.paid_at && (
                  <Text style={[styles.metaText, { color: '#4ade80' }]}>
                    Paid {new Date(item.paid_at).toLocaleDateString()}
                  </Text>
                )}
                {item.due_date && item.status !== 'paid' && (
                  <Text style={[styles.metaText, item.status === 'overdue' ? { color: '#ef4444' } : {}]}>
                    Due {new Date(item.due_date).toLocaleDateString()}
                  </Text>
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  empty: { color: '#444', textAlign: 'center', marginTop: 40, fontSize: 15 },
  summary: { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 0 },
  summaryCard: {
    flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: '#4ade8044',
  },
  summaryValue: { color: '#4ade80', fontSize: 22, fontWeight: '800' },
  summaryLabel: { color: '#666', fontSize: 12, marginTop: 2 },
  filters: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingVertical: 12, flexWrap: 'wrap' },
  filterChip: {
    borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14,
    borderWidth: 1, borderColor: '#2a2a2a', backgroundColor: '#111',
  },
  filterChipActive: { backgroundColor: '#0265dc22', borderColor: '#0265dc' },
  filterText: { color: '#555', fontSize: 12, fontWeight: '600' },
  filterTextActive: { color: '#0265dc' },
  card: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#2a2a2a' },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  jobName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  clientName: { color: '#666', fontSize: 13, marginTop: 2 },
  amount: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'right' },
  statusBadge: { borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8, marginTop: 4, alignSelf: 'flex-end' },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, borderTopWidth: 1, borderTopColor: '#2a2a2a', paddingTop: 10 },
  metaText: { color: '#555', fontSize: 12 },
});
