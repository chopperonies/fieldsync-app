import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Modal, TextInput, Alert,
  StyleSheet, ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { mobileGet, mobilePost } from '../../lib/mobileApi';

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

type JobLite = {
  id: string;
  name: string;
  status: string;
  invoice_amount: number | null;
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

  const [modalOpen, setModalOpen] = useState(false);
  const [availableJobs, setAvailableJobs] = useState<JobLite[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobLite | null>(null);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [actionJob, setActionJob] = useState<InvoiceJob | null>(null);
  const [markingPaid, setMarkingPaid] = useState(false);

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

  const openCreateModal = useCallback(async () => {
    setModalOpen(true);
    setSelectedJob(null);
    setAmount('');
    setJobsLoading(true);
    try {
      const allJobs = await mobileGet<JobLite[]>('/api/mobile/owner/jobs');
      const eligible = (allJobs || []).filter(j => !(Number(j.invoice_amount) > 0));
      setAvailableJobs(eligible);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not load jobs');
    } finally {
      setJobsLoading(false);
    }
  }, []);

  const submitInvoice = useCallback(async () => {
    if (!selectedJob) return Alert.alert('Pick a job first');
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return Alert.alert('Enter a valid amount');
    setSubmitting(true);
    try {
      const resp: any = await mobilePost(`/api/mobile/owner/jobs/${selectedJob.id}/invoice`, { amount: amt });
      setModalOpen(false);
      await loadData();
      if (resp?.invoice_email_sent) {
        Alert.alert('Invoice sent', `Emailed to ${resp.invoice_emailed_to}`);
      } else {
        Alert.alert('Invoice created', 'No client email on file — nothing to send. Update client email in CRM to email future invoices.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to send');
    } finally {
      setSubmitting(false);
    }
  }, [selectedJob, amount, loadData]);

  const markPaid = useCallback(async (withEmail: boolean) => {
    if (!actionJob) return;
    setMarkingPaid(true);
    try {
      const body = withEmail ? { notify: 'email' } : {};
      const resp: any = await mobilePost(`/api/mobile/owner/jobs/${actionJob.id}/mark-paid`, body);
      setActionJob(null);
      await loadData();
      if (withEmail) {
        if (resp?.receipt_email_sent) {
          Alert.alert('Marked paid', `Receipt emailed to ${actionJob.clients?.email}`);
        } else {
          Alert.alert('Marked paid', 'No client email on file — no receipt sent.');
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to mark paid');
    } finally {
      setMarkingPaid(false);
    }
  }, [actionJob, loadData]);

  useEffect(() => { loadData(); }, [loadData]);

  const params = useLocalSearchParams<{ open?: string }>();
  useEffect(() => {
    if (params.open === 'record_payment') setFilter('unpaid');
  }, [params.open]);

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
          const Row = (
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
                {!paid && <Text style={styles.tapHint}>Tap to record payment</Text>}
              </View>
            </View>
          );
          return paid
            ? Row
            : <TouchableOpacity activeOpacity={0.7} onPress={() => setActionJob(item)}>{Row}</TouchableOpacity>;
        }}
      />


      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Invoice</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)} disabled={submitting}>
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Job</Text>
            {jobsLoading ? (
              <ActivityIndicator color="#0ea5e9" style={{ marginVertical: 12 }} />
            ) : availableJobs.length === 0 ? (
              <Text style={styles.empty}>No jobs available to invoice.</Text>
            ) : (
              <ScrollView style={styles.jobList} keyboardShouldPersistTaps="handled">
                {availableJobs.map(j => (
                  <TouchableOpacity
                    key={j.id}
                    style={[styles.jobRow, selectedJob?.id === j.id && styles.jobRowActive]}
                    onPress={() => setSelectedJob(j)}
                  >
                    <Text style={styles.jobRowName}>{j.name}</Text>
                    {j.clients?.name && <Text style={styles.jobRowClient}>{j.clients.name}</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <Text style={styles.label}>Amount</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor="#444"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />

            <TouchableOpacity
              style={[styles.submit, (!selectedJob || !amount || submitting) && { opacity: 0.4 }]}
              onPress={submitInvoice}
              disabled={!selectedJob || !amount || submitting}
            >
              {submitting
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.submitText}>Send Invoice</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!actionJob} animationType="fade" transparent onRequestClose={() => setActionJob(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.actionSheet}>
            <Text style={styles.actionTitle}>{actionJob?.name}</Text>
            <Text style={styles.actionSubtitle}>
              ${(Number(actionJob?.invoice_amount) || 0).toLocaleString()} · {actionJob?.clients?.name || 'No client'}
            </Text>

            {actionJob?.clients?.email && (
              <TouchableOpacity
                style={[styles.submit, markingPaid && { opacity: 0.4 }]}
                onPress={() => markPaid(true)}
                disabled={markingPaid}
              >
                {markingPaid ? <ActivityIndicator color="#000" /> : <Text style={styles.submitText}>Mark Paid + Email Receipt</Text>}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.submitGhost, markingPaid && { opacity: 0.4 }]}
              onPress={() => markPaid(false)}
              disabled={markingPaid}
            >
              <Text style={styles.submitGhostText}>Mark Paid (no email)</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setActionJob(null)} disabled={markingPaid}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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

  fab: {
    position: 'absolute', right: 20, bottom: 28, width: 56, height: 56,
    borderRadius: 28, backgroundColor: '#0ea5e9',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  fabText: { color: '#000', fontSize: 28, fontWeight: '700', lineHeight: 30 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#0f0f0f', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 32, maxHeight: '85%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  modalClose: { color: '#0ea5e9', fontWeight: '600' },
  label: { color: '#888', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 },
  jobList: { maxHeight: 260, borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 10 },
  jobRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#1f1f1f' },
  jobRowActive: { backgroundColor: '#0ea5e922' },
  jobRowName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  jobRowClient: { color: '#666', fontSize: 12, marginTop: 2 },
  input: {
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
    borderRadius: 10, padding: 14, color: '#fff', fontSize: 16,
  },
  submit: {
    backgroundColor: '#0ea5e9', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 20,
  },
  submitText: { color: '#000', fontWeight: '700', fontSize: 16 },
  submitGhost: {
    borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 10,
    borderWidth: 1, borderColor: '#0ea5e9',
  },
  submitGhostText: { color: '#0ea5e9', fontWeight: '700', fontSize: 15 },
  cancelBtn: { padding: 14, alignItems: 'center', marginTop: 8 },
  cancelText: { color: '#888', fontSize: 14 },

  actionSheet: {
    backgroundColor: '#0f0f0f', borderRadius: 16, padding: 20,
    margin: 20, marginTop: 'auto', marginBottom: 'auto',
  },
  actionTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  actionSubtitle: { color: '#888', fontSize: 14, marginTop: 6, marginBottom: 8 },
  tapHint: { color: '#0ea5e9', fontSize: 11, fontWeight: '600', marginLeft: 'auto' },
});
