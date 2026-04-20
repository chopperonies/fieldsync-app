import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { mobileGet } from '../../lib/mobileApi';

type InvoiceJob = {
  id: string;
  name: string;
  address: string | null;
  status: string;
  payment_status: string | null;
  invoice_amount: number | null;
  created_at: string;
  updated_at: string | null;
  client_id: string | null;
  clients?: { name: string; email?: string | null } | null;
};

type Bucket = 'all' | 'unpaid' | 'paid';

function isPaid(j: InvoiceJob) {
  return String(j.payment_status || '').toLowerCase() === 'paid';
}

export default function OwnerInvoices() {
  const [jobs, setJobs] = useState<InvoiceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Bucket>('all');

  const loadData = useCallback(async () => {
    try {
      const data = await mobileGet<InvoiceJob[]>('/api/mobile/owner/invoices');
      setJobs(data || []);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = jobs.filter(j => {
    if (filter === 'all') return true;
    if (filter === 'paid') return isPaid(j);
    return !isPaid(j);
  });

  const totalPaid = jobs.filter(isPaid).reduce((s, j) => s + (Number(j.invoice_amount) || 0), 0);
  const totalOwed = jobs.filter(j => !isPaid(j)).reduce((s, j) => s + (Number(j.invoice_amount) || 0), 0);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#0ea5e9" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.summary}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>${totalPaid.toLocaleString()}</Text>
          <Text style={styles.summaryLabel}>Collected</Text>
        </View>
        <View style={[styles.summaryCard, { borderColor: '#0ea5e944' }]}>
          <Text style={[styles.summaryValue, { color: '#0ea5e9' }]}>${totalOwed.toLocaleString()}</Text>
          <Text style={styles.summaryLabel}>Outstanding</Text>
        </View>
      </View>

      <View style={styles.filters}>
        {(['all', 'unpaid', 'paid'] as Bucket[]).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'all' ? 'All' : f === 'unpaid' ? 'Unpaid' : 'Paid'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {err && <Text style={styles.err}>{err}</Text>}

      <FlatList
        data={filtered}
        keyExtractor={j => j.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#0ea5e9" />}
        ListEmptyComponent={<Text style={styles.empty}>No invoices yet.</Text>}
        renderItem={({ item }) => {
          const paid = isPaid(item);
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.jobName}>{item.name || 'Untitled job'}</Text>
                  {item.clients?.name && (
                    <Text style={styles.clientName}>{item.clients.name}</Text>
                  )}
                </View>
                <View>
                  <Text style={styles.amount}>${(Number(item.invoice_amount) || 0).toLocaleString()}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: paid ? '#4ade8022' : '#facc1522' }]}>
                    <Text style={[styles.statusText, { color: paid ? '#4ade80' : '#facc15' }]}>
                      {paid ? 'Paid' : 'Unpaid'}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.cardMeta}>
                <Text style={styles.metaText}>
                  Invoiced {new Date(item.updated_at || item.created_at).toLocaleDateString()}
                </Text>
                {item.address ? <Text style={styles.metaText} numberOfLines={1}>{item.address}</Text> : null}
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
  err: { color: '#ef4444', textAlign: 'center', marginTop: 8, fontSize: 13 },
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
  filterChipActive: { backgroundColor: '#0ea5e922', borderColor: '#0ea5e9' },
  filterText: { color: '#555', fontSize: 12, fontWeight: '600' },
  filterTextActive: { color: '#0ea5e9' },
  card: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#2a2a2a' },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  jobName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  clientName: { color: '#888', fontSize: 13, marginTop: 2 },
  amount: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'right' },
  statusBadge: { borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8, marginTop: 4, alignSelf: 'flex-end' },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, borderTopWidth: 1, borderTopColor: '#2a2a2a', paddingTop: 10 },
  metaText: { color: '#555', fontSize: 12 },
});
