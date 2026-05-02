import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Modal, TextInput, Alert,
  StyleSheet, ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { mobileGet, mobilePost } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import LineItemsPicker, { LineItem, lineItemsTotal } from '../../components/LineItemsPicker';

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

const INVOICEABLE_JOB_STATUSES = new Set(['active', 'scheduled', 'in_progress', 'complete', 'completed']);

function isInvoiceableJob(j: JobLite) {
  const status = String(j.status || '').trim().toLowerCase();
  if (Number(j.invoice_amount) > 0) return false;
  if (!INVOICEABLE_JOB_STATUSES.has(status)) return false;
  return true;
}

export default function OwnerInvoices() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [jobs, setJobs] = useState<InvoiceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Bucket>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [availableJobs, setAvailableJobs] = useState<JobLite[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobLite | null>(null);
  const [jobPickerOpen, setJobPickerOpen] = useState(true);
  const [jobQuery, setJobQuery] = useState('');
  const [amount, setAmount] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
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
    setJobPickerOpen(true);
    setJobQuery('');
    setAmount('');
    setLineItems([]);
    setJobsLoading(true);
    try {
      const allJobs = await mobileGet<JobLite[]>('/api/mobile/owner/jobs');
      const eligible = (allJobs || [])
        .filter(isInvoiceableJob)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      setAvailableJobs(eligible);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not load jobs');
    } finally {
      setJobsLoading(false);
    }
  }, []);

  const submitInvoice = useCallback(async () => {
    if (!selectedJob) return Alert.alert('Pick a job first');
    const catalogTotal = lineItemsTotal(lineItems);
    const amt = catalogTotal > 0 ? catalogTotal : parseFloat(amount);
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
  }, [selectedJob, amount, lineItems, loadData]);

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

  const resendInvoice = useCallback(async () => {
    if (!actionJob) return;
    setMarkingPaid(true);
    try {
      const resp: any = await mobilePost(`/api/mobile/owner/jobs/${actionJob.id}/invoice/resend`);
      Alert.alert('Sent', `Invoice re-emailed to ${resp?.emailed_to || actionJob.clients?.email || 'client'}.`);
      setActionJob(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not resend invoice');
    } finally {
      setMarkingPaid(false);
    }
  }, [actionJob]);

  useEffect(() => { loadData(); }, [loadData]);

  const params = useLocalSearchParams<{ open?: string }>();
  // Track when the New Invoice modal was opened from a Search "Create
  // invoice" pill so cancel sends the user back to Search instead of
  // leaving them on the invoices list.
  const [openedViaDeepLink, setOpenedViaDeepLink] = useState(false);
  useEffect(() => {
    if (params.open === 'record_payment') {
      setFilter('unpaid');
      setTimeout(() => router.setParams({ open: undefined } as any), 100);
    }
    if (params.open === 'quick_invoice') {
      openCreateModal();
      setOpenedViaDeepLink(true);
      setTimeout(() => router.setParams({ open: undefined } as any), 100);
    }
  }, [params.open, openCreateModal]);

  function closeCreateModal() {
    setModalOpen(false);
    if (openedViaDeepLink && router.canGoBack()) {
      setOpenedViaDeepLink(false);
      setTimeout(() => router.back(), 50);
    }
  }

  const filtered = jobs.filter(j => {
    if (filter === 'all') return true;
    if (filter === 'paid') return isPaid(j);
    return !isPaid(j);
  });

  const totalPaid = jobs.filter(isPaid).reduce((s, j) => s + (Number(j.invoice_amount) || 0), 0);
  const totalOwed = jobs.filter(j => !isPaid(j)).reduce((s, j) => s + (Number(j.invoice_amount) || 0), 0);
  const filteredAvailableJobs = useMemo(() => {
    const q = jobQuery.trim().toLowerCase();
    if (!q) return availableJobs;
    return availableJobs.filter(j => (
      String(j.name || '').toLowerCase().includes(q) ||
      String(j.clients?.name || '').toLowerCase().includes(q)
    ));
  }, [availableJobs, jobQuery]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.accent} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Invoices</Text>
          <Text style={styles.subtitle}>{jobs.length} total · {jobs.filter(j => !isPaid(j)).length} open</Text>
        </View>
        <TouchableOpacity style={styles.newBtn} onPress={openCreateModal} activeOpacity={0.75}>
          <Text style={styles.newBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.summary}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>${totalPaid.toLocaleString()}</Text>
          <Text style={styles.summaryLabel}>Collected</Text>
        </View>
        <View style={[styles.summaryCard, { borderColor: theme.accent + '44' }]}>
          <Text style={[styles.summaryValue, { color: theme.accent }]}>${totalOwed.toLocaleString()}</Text>
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={theme.accent} />}
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
                  <View style={[styles.statusBadge, { backgroundColor: paid ? theme.successMuted : theme.warningMuted }]}>
                    <Text style={[styles.statusText, { color: paid ? theme.success : theme.warning }]}>
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
                {!paid && <Text style={styles.tapHint}>Tap for actions</Text>}
              </View>
            </View>
          );
          return paid
            ? Row
            : <TouchableOpacity activeOpacity={0.7} onPress={() => setActionJob(item)}>{Row}</TouchableOpacity>;
        }}
      />


      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={closeCreateModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Invoice</Text>
              <TouchableOpacity onPress={closeCreateModal} disabled={submitting}>
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={styles.modalBodyContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              <Text style={styles.label}>Job</Text>
              {selectedJob ? (
                <View style={styles.selectedJobBox}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedJobName}>{selectedJob.name || 'Untitled job'}</Text>
                    <Text style={styles.selectedJobMeta}>
                      {[selectedJob.clients?.name, selectedJob.status?.replace(/_/g, ' ')].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.clearJobBtn}
                    onPress={() => {
                      setSelectedJob(null);
                      setJobPickerOpen(true);
                    }}
                  >
                    <Text style={styles.clearJobText}>Clear</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {selectedJob ? (
                <TouchableOpacity style={styles.changeJobBtn} onPress={() => setJobPickerOpen(v => !v)}>
                  <Text style={styles.changeJobText}>{jobPickerOpen ? 'Hide jobs' : 'Change job'}</Text>
                </TouchableOpacity>
              ) : null}

              {jobsLoading ? (
                <ActivityIndicator color={theme.accent} style={{ marginVertical: 12 }} />
              ) : availableJobs.length === 0 ? (
                <Text style={styles.modalEmpty}>No active jobs available to invoice.</Text>
              ) : jobPickerOpen || !selectedJob ? (
                <>
                  <TextInput
                    style={styles.jobSearch}
                    placeholder="Search active jobs"
                    placeholderTextColor={theme.textMuted}
                    value={jobQuery}
                    onChangeText={setJobQuery}
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                  {filteredAvailableJobs.length === 0 ? (
                    <Text style={styles.modalEmpty}>No matching active jobs.</Text>
                  ) : (
                    <ScrollView style={styles.jobList} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                      {filteredAvailableJobs.map(j => (
                        <TouchableOpacity
                          key={j.id}
                          style={[styles.jobRow, selectedJob?.id === j.id && styles.jobRowActive]}
                          onPress={() => {
                            setSelectedJob(j);
                            setJobPickerOpen(false);
                          }}
                        >
                          <Text style={styles.jobRowName}>{j.name || 'Untitled job'}</Text>
                          <Text style={styles.jobRowClient}>
                            {[j.clients?.name, j.status?.replace(/_/g, ' ')].filter(Boolean).join(' · ')}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </>
              ) : null}

              <LineItemsPicker
                items={lineItems}
                onChange={setLineItems}
                label="Product / Service"
                emptyLabel="Add catalog services or enter a custom invoice item."
              />

              <Text style={styles.label}>Amount</Text>
              <TextInput
                style={styles.input}
                placeholder={lineItems.length ? 'Amount set from line items' : '0.00'}
                placeholderTextColor={theme.textMuted}
                keyboardType="decimal-pad"
                value={lineItems.length ? lineItemsTotal(lineItems).toFixed(2) : amount}
                onChangeText={setAmount}
                editable={lineItems.length === 0}
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.submit, (!selectedJob || (!amount && lineItems.length === 0) || submitting) && { opacity: 0.4 }]}
                onPress={submitInvoice}
                disabled={!selectedJob || (!amount && lineItems.length === 0) || submitting}
              >
                {submitting
                  ? <ActivityIndicator color={theme.accentContrast} />
                  : <Text style={styles.submitText}>Send Invoice</Text>}
              </TouchableOpacity>
            </View>
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
                style={[styles.submitGhost, markingPaid && { opacity: 0.4 }]}
                onPress={resendInvoice}
                disabled={markingPaid}
              >
                <Text style={styles.submitGhostText}>Resend Invoice Email</Text>
              </TouchableOpacity>
            )}

            {actionJob?.clients?.email && (
              <TouchableOpacity
                style={[styles.submit, markingPaid && { opacity: 0.4 }]}
                onPress={() => markPaid(true)}
                disabled={markingPaid}
              >
                {markingPaid ? <ActivityIndicator color={theme.accentContrast} /> : <Text style={styles.submitText}>Mark Paid + Email Receipt</Text>}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.submitGhost, markingPaid && { opacity: 0.4 }]}
              onPress={() => markPaid(false)}
              disabled={markingPaid}
            >
              <Text style={styles.submitGhostText}>Mark Paid (no email)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.submitGhost}
              onPress={() => {
                if (!actionJob) return;
                const id = actionJob.id;
                setActionJob(null);
                router.push({ pathname: '/(owner)/job/[id]', params: { id } } as any);
              }}
              disabled={markingPaid}
            >
              <Text style={styles.submitGhostText}>Open Job</Text>
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

function makeStyles(t: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: t.bg },
    empty: { color: t.textMuted, textAlign: 'center', marginTop: 40, fontSize: 15 },
    err: { color: t.danger, textAlign: 'center', marginTop: 8, fontSize: 13 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 4,
    },
    title: { color: t.textPrimary, fontSize: 22, fontWeight: '800' },
    subtitle: { color: t.textSecondary, fontSize: 13, marginTop: 4 },
    newBtn: {
      backgroundColor: t.accent,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    newBtnText: { color: t.accentContrast, fontSize: 13, fontWeight: '900' },
    summary: { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 0, paddingTop: 10 },
    summaryCard: {
      flex: 1, backgroundColor: t.surface, borderRadius: 12,
      padding: 14, borderWidth: 1, borderColor: t.success + '44',
    },
    summaryValue: { color: t.success, fontSize: 22, fontWeight: '800' },
    summaryLabel: { color: t.textSecondary, fontSize: 12, marginTop: 2 },
    filters: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingVertical: 12, flexWrap: 'wrap' },
    filterChip: {
      borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14,
      borderWidth: 1, borderColor: t.border, backgroundColor: t.surface,
    },
    filterChipActive: { backgroundColor: t.accentMuted, borderColor: t.accent },
    filterText: { color: t.textSecondary, fontSize: 12, fontWeight: '600' },
    filterTextActive: { color: t.accent },
    card: { backgroundColor: t.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: t.border },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
    jobName: { color: t.textPrimary, fontSize: 15, fontWeight: '600' },
    clientName: { color: t.textSecondary, fontSize: 13, marginTop: 2 },
    amount: { color: t.textPrimary, fontSize: 18, fontWeight: '800', textAlign: 'right' },
    statusBadge: { borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8, marginTop: 4, alignSelf: 'flex-end' },
    statusText: { fontSize: 11, fontWeight: '700' },
    cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 10 },
    metaText: { color: t.textMuted, fontSize: 12 },

    fab: {
      position: 'absolute', right: 20, bottom: 28, width: 56, height: 56,
      borderRadius: 28, backgroundColor: t.accent,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
      elevation: 5,
    },
    fabText: { color: t.accentContrast, fontSize: 28, fontWeight: '700', lineHeight: 30 },

    modalBackdrop: { flex: 1, backgroundColor: t.overlay, justifyContent: 'flex-end' },
    modalSheet: {
      backgroundColor: t.surfaceElevated, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      maxHeight: '88%', overflow: 'hidden',
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 },
    modalTitle: { color: t.textPrimary, fontSize: 18, fontWeight: '700' },
    modalClose: { color: t.accent, fontWeight: '600' },
    label: { color: t.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 },
    modalBody: { paddingHorizontal: 20 },
    modalBodyContent: { paddingBottom: 18 },
    modalFooter: {
      paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24,
      borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.surfaceElevated,
    },
    modalEmpty: { color: t.textMuted, textAlign: 'center', marginVertical: 14, fontSize: 14 },
    selectedJobBox: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: t.surfaceInset, borderWidth: 1, borderColor: t.accent + '55',
      borderRadius: 12, padding: 12,
    },
    selectedJobName: { color: t.textPrimary, fontSize: 15, fontWeight: '800' },
    selectedJobMeta: { color: t.textMuted, fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
    clearJobBtn: { borderRadius: 8, borderWidth: 1, borderColor: t.border, paddingHorizontal: 10, paddingVertical: 7 },
    clearJobText: { color: t.textSecondary, fontSize: 12, fontWeight: '800' },
    changeJobBtn: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 2 },
    changeJobText: { color: t.accent, fontSize: 13, fontWeight: '800' },
    jobSearch: {
      backgroundColor: t.surfaceInset, borderWidth: 1, borderColor: t.border,
      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11,
      color: t.textPrimary, fontSize: 15, marginBottom: 8,
    },
    jobList: { maxHeight: 190, borderWidth: 1, borderColor: t.border, borderRadius: 10 },
    jobRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: t.border },
    jobRowActive: { backgroundColor: t.accentMuted },
    jobRowName: { color: t.textPrimary, fontSize: 15, fontWeight: '600' },
    jobRowClient: { color: t.textMuted, fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
    input: {
      backgroundColor: t.surfaceInset, borderWidth: 1, borderColor: t.border,
      borderRadius: 10, padding: 14, color: t.textPrimary, fontSize: 16,
    },
    submit: {
      backgroundColor: t.accent, borderRadius: 12, padding: 16,
      alignItems: 'center',
    },
    submitText: { color: t.accentContrast, fontWeight: '700', fontSize: 16 },
    submitGhost: {
      borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 10,
      borderWidth: 1, borderColor: t.accent,
    },
    submitGhostText: { color: t.accent, fontWeight: '700', fontSize: 15 },
    cancelBtn: { padding: 14, alignItems: 'center', marginTop: 8 },
    cancelText: { color: t.textSecondary, fontSize: 14 },

    actionSheet: {
      backgroundColor: t.surfaceElevated, borderRadius: 16, padding: 20,
      margin: 20, marginTop: 'auto', marginBottom: 'auto',
    },
    actionTitle: { color: t.textPrimary, fontSize: 18, fontWeight: '700' },
    actionSubtitle: { color: t.textSecondary, fontSize: 14, marginTop: 6, marginBottom: 8 },
    tapHint: { color: t.accent, fontSize: 11, fontWeight: '600', marginLeft: 'auto' },
  });
}
