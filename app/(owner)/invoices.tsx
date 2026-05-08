import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Modal, TextInput, Alert,
  StyleSheet, ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform, ScrollView, Pressable,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { mobileGet, mobilePost, mobilePatch } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import LineItemsPicker, { LineItem, lineItemsTotal, lineItemsSummary } from '../../components/LineItemsPicker';

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
  estimate_amount?: number | null;
  client_id: string | null;
  description?: string | null;
  address?: string | null;
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
  const insets = useSafeAreaInsets();
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
  const [notes, setNotes] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [invoiceStep, setInvoiceStep] = useState<'edit' | 'preview'>('edit');

  const [actionJob, setActionJob] = useState<InvoiceJob | null>(null);
  const [markingPaid, setMarkingPaid] = useState(false);

  // Inline "create a job for this invoice" mini-form
  const [inlineJobOpen, setInlineJobOpen] = useState(false);
  const [inlineJobName, setInlineJobName] = useState('');
  const [inlineJobAddress, setInlineJobAddress] = useState('');
  const [inlineJobClient, setInlineJobClient] = useState('');
  const [inlineJobPhone, setInlineJobPhone] = useState('');
  const [creatingJob, setCreatingJob] = useState(false);

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

  const openCreateModal = useCallback(async (preselectJobId?: string | null) => {
    setModalOpen(true);
    setSelectedJob(null);
    setJobPickerOpen(true);
    setJobQuery('');
    setAmount('');
    setLineItems([]);
    setNotes('');
    setNotesDirty(false);
    setInvoiceStep('edit');
    setInlineJobOpen(false);
    setInlineJobName('');
    setInlineJobAddress('');
    setInlineJobClient('');
    setInlineJobPhone('');
    setJobsLoading(true);
    try {
      const allJobs = await mobileGet<JobLite[]>('/api/mobile/owner/jobs');
      const eligible = (allJobs || [])
        .filter(isInvoiceableJob)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      // If an explicit job_id came in (deep link from job detail), make sure it
      // shows up in the picker even if the status filter would have hidden it —
      // the user already said "invoice this one."
      const requested = preselectJobId
        ? (allJobs || []).find(j => j.id === preselectJobId) || null
        : null;
      const merged = requested && !eligible.some(j => j.id === requested.id)
        ? [requested, ...eligible]
        : eligible;
      setAvailableJobs(merged);
      if (requested) {
        setSelectedJob(requested);
        setJobPickerOpen(false);
        // Pre-fill the invoice amount from the job's estimate so the owner
        // doesn't have to retype the number they already quoted.
        const est = Number(requested.estimate_amount) || 0;
        if (est > 0) setAmount(est.toFixed(2));
        // Pre-fill the editable scope/notes from the job's description so the
        // owner can revise it before the invoice goes out.
        setNotes(requested.description || '');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not load jobs');
    } finally {
      setJobsLoading(false);
    }
  }, []);

  const createJobForInvoice = useCallback(async () => {
    const name = inlineJobName.trim();
    const address = inlineJobAddress.trim();
    if (!name) { Alert.alert('Add a job name'); return; }
    if (!address) { Alert.alert('Add a job address'); return; }
    setCreatingJob(true);
    try {
      const created = await mobilePost<JobLite>('/api/mobile/owner/jobs', {
        name,
        address,
        client_name: inlineJobClient.trim() || null,
        client_phone: inlineJobPhone.trim() || null,
        status: 'completed',
      });
      if (!created?.id) throw new Error('Job creation returned no id');
      // Add to availableJobs so the picker reflects it, and select it.
      setAvailableJobs(prev => [created, ...prev]);
      setSelectedJob(created);
      setInlineJobOpen(false);
      setJobPickerOpen(false);
      setInlineJobName('');
      setInlineJobAddress('');
      setInlineJobClient('');
      setInlineJobPhone('');
    } catch (e: any) {
      Alert.alert('Could not create job', e?.message || 'Try again.');
    } finally {
      setCreatingJob(false);
    }
  }, [inlineJobName, inlineJobAddress, inlineJobClient, inlineJobPhone]);

  const submitInvoice = useCallback(async () => {
    if (!selectedJob) return Alert.alert('Pick a job first');
    const catalogTotal = lineItemsTotal(lineItems);
    const amt = catalogTotal > 0 ? catalogTotal : parseFloat(amount);
    if (!amt || amt <= 0) return Alert.alert('Enter a valid amount');

    // Combine the editable scope notes with any line items added in this
    // invoice flow into one description that goes on the email + the job row.
    const segments: string[] = [];
    if (notes.trim()) segments.push(notes.trim());
    if (lineItems.length > 0) {
      segments.push(`Line items:\n${lineItemsSummary(lineItems)}`);
    }
    const composedDescription = segments.join('\n\n') || null;

    setSubmitting(true);
    try {
      // Persist notes back onto the job if the user edited them, so future
      // invoice flows (and the job detail screen) reflect the latest scope.
      if (notesDirty && composedDescription !== (selectedJob.description ?? null)) {
        try {
          await mobilePatch(`/api/mobile/owner/jobs/${selectedJob.id}`, { description: composedDescription });
        } catch {
          // Non-blocking — keep going with the invoice even if patch fails.
        }
      }
      const resp: any = await mobilePost(`/api/mobile/owner/jobs/${selectedJob.id}/invoice`, {
        amount: amt,
        description: composedDescription,
      });
      setModalOpen(false);
      setInvoiceStep('edit');
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
  }, [selectedJob, amount, lineItems, notes, notesDirty, loadData]);

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

  const params = useLocalSearchParams<{ open?: string; job_id?: string }>();
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
      openCreateModal(params.job_id || null);
      setOpenedViaDeepLink(true);
      setTimeout(() => router.setParams({ open: undefined, job_id: undefined } as any), 100);
    }
  }, [params.open, params.job_id, openCreateModal]);

  function closeCreateModal() {
    setModalOpen(false);
    setInvoiceStep('edit');
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
  const invoiceTotal = lineItemsTotal(lineItems);
  const manualAmount = parseFloat(amount);
  const previewTotal = invoiceTotal > 0 ? invoiceTotal : (Number.isFinite(manualAmount) ? manualAmount : 0);
  const canPreviewInvoice = !!selectedJob && previewTotal > 0;

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.accent} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={{ paddingRight: 4 }}>
          <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Invoices</Text>
          <Text style={styles.subtitle}>{jobs.length} total · {jobs.filter(j => !isPaid(j)).length} open</Text>
        </View>
        <TouchableOpacity style={styles.newBtn} onPress={() => openCreateModal()} activeOpacity={0.75}>
          <Text style={styles.newBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.summary}>
        <View style={[styles.summaryCard, { borderColor: theme.success + '44' }]}>
          <Text style={styles.summaryEyebrow}>Collected</Text>
          <Text style={[styles.summaryValue, { color: theme.success }]}>
            ${totalPaid.toLocaleString()}
          </Text>
        </View>
        <View style={[styles.summaryCard, { borderColor: theme.warning + '44' }]}>
          <Text style={styles.summaryEyebrow}>Outstanding</Text>
          <Text style={[styles.summaryValue, { color: theme.warning }]}>
            ${totalOwed.toLocaleString()}
          </Text>
        </View>
      </View>

      <View style={styles.filterSegment}>
        {(['all', 'unpaid', 'paid'] as Bucket[]).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterSegmentItem, filter === f && styles.filterSegmentItemActive]}
            onPress={() => setFilter(f)}
            activeOpacity={0.75}
          >
            <Text style={[styles.filterSegmentText, filter === f && styles.filterSegmentTextActive]}>
              {f === 'all' ? 'All' : f === 'unpaid' ? 'Unpaid' : 'Paid'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {err && <Text style={styles.err}>{err}</Text>}

      <FlatList
        data={filtered}
        keyExtractor={j => j.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24, gap: 6 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={theme.accent} />}
        ListEmptyComponent={<Text style={styles.empty}>No invoices yet.</Text>}
        renderItem={({ item }) => {
          const paid = isPaid(item);
          const dateLabel = new Date(item.updated_at || item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          const Row = (
            <View style={styles.invoiceRow}>
              <View style={[styles.invoiceStripe, { backgroundColor: paid ? theme.success : theme.warning }]} />
              <View style={{ flex: 1, paddingVertical: 12, paddingRight: 12, paddingLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={styles.jobName} numberOfLines={1}>{item.name || 'Untitled job'}</Text>
                  <Text style={styles.amount}>${(Number(item.invoice_amount) || 0).toLocaleString()}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 3 }}>
                  <Text style={styles.clientName} numberOfLines={1}>
                    {[item.clients?.name, dateLabel].filter(Boolean).join(' · ')}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: paid ? theme.successMuted : theme.warningMuted }]}>
                    <Text style={[styles.statusText, { color: paid ? theme.success : theme.warning }]}>
                      {paid ? 'Paid' : 'Unpaid'}
                    </Text>
                  </View>
                </View>
              </View>
              {!paid ? (
                <View style={{ paddingRight: 10, justifyContent: 'center' }}>
                  <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                </View>
              ) : null}
            </View>
          );
          return paid
            ? Row
            : <TouchableOpacity activeOpacity={0.7} onPress={() => setActionJob(item)}>{Row}</TouchableOpacity>;
        }}
      />


      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={closeCreateModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={styles.modalBackdrop} onPress={closeCreateModal}>
            <Pressable onPress={() => {}} style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={closeCreateModal} disabled={submitting} hitSlop={10} style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={22} color={theme.textMuted} />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>
                  {invoiceStep === 'edit' ? 'New invoice' : 'Preview'}
                </Text>
                <View style={styles.modalCloseBtn} />
              </View>

              <ScrollView
                style={styles.modalBody}
                contentContainerStyle={styles.modalBodyContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                {invoiceStep === 'edit' ? (
                  <>
                    <Text style={styles.label}>Job</Text>
                    {selectedJob && !jobPickerOpen ? (
                      <View style={styles.selectedJobBox}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.selectedJobName} numberOfLines={1}>{selectedJob.name || 'Untitled job'}</Text>
                          <Text style={styles.selectedJobMeta} numberOfLines={1}>
                            {[selectedJob.clients?.name, selectedJob.status?.replace(/_/g, ' ')].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.changeJobChip}
                          onPress={() => setJobPickerOpen(true)}
                        >
                          <Text style={styles.changeJobChipText}>Change</Text>
                        </TouchableOpacity>
                      </View>
                    ) : jobsLoading ? (
                      <ActivityIndicator color={theme.accent} style={{ marginVertical: 12 }} />
                    ) : inlineJobOpen ? (
                      <View style={styles.inlineJobBox}>
                        <TextInput
                          style={styles.inlineInput}
                          placeholder="Job name (e.g. Roof inspection)"
                          placeholderTextColor={theme.textMuted}
                          value={inlineJobName}
                          onChangeText={setInlineJobName}
                          autoFocus
                        />
                        <TextInput
                          style={styles.inlineInput}
                          placeholder="Address"
                          placeholderTextColor={theme.textMuted}
                          value={inlineJobAddress}
                          onChangeText={setInlineJobAddress}
                        />
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TextInput
                            style={[styles.inlineInput, { flex: 1.4 }]}
                            placeholder="Client name (optional)"
                            placeholderTextColor={theme.textMuted}
                            value={inlineJobClient}
                            onChangeText={setInlineJobClient}
                          />
                          <TextInput
                            style={[styles.inlineInput, { flex: 1 }]}
                            placeholder="Phone"
                            placeholderTextColor={theme.textMuted}
                            keyboardType="phone-pad"
                            value={inlineJobPhone}
                            onChangeText={setInlineJobPhone}
                          />
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                          <TouchableOpacity
                            style={[styles.inlineCancel]}
                            onPress={() => setInlineJobOpen(false)}
                            disabled={creatingJob}
                          >
                            <Text style={styles.inlineCancelText}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.inlineCreate, creatingJob && { opacity: 0.5 }]}
                            onPress={createJobForInvoice}
                            disabled={creatingJob}
                          >
                            {creatingJob
                              ? <ActivityIndicator color={theme.accentContrast} />
                              : <Text style={styles.inlineCreateText}>Create job</Text>}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <>
                        <TouchableOpacity
                          style={styles.newJobOption}
                          onPress={() => setInlineJobOpen(true)}
                          activeOpacity={0.75}
                        >
                          <Ionicons name="add-circle-outline" size={20} color={theme.accent} />
                          <Text style={styles.newJobOptionText}>Create a new job</Text>
                        </TouchableOpacity>
                        {availableJobs.length > 5 && (
                          <TextInput
                            style={styles.jobSearch}
                            placeholder="Search active jobs"
                            placeholderTextColor={theme.textMuted}
                            value={jobQuery}
                            onChangeText={setJobQuery}
                            autoCorrect={false}
                            autoCapitalize="none"
                          />
                        )}
                        {availableJobs.length === 0 ? (
                          <Text style={styles.modalEmpty}>No active jobs to pick from. Create one above.</Text>
                        ) : filteredAvailableJobs.length === 0 ? (
                          <Text style={styles.modalEmpty}>No matching jobs.</Text>
                        ) : (
                          <ScrollView style={styles.jobList} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                            {filteredAvailableJobs.map(j => (
                              <TouchableOpacity
                                key={j.id}
                                style={[styles.jobRow, selectedJob?.id === j.id && styles.jobRowActive]}
                                onPress={() => {
                                  setSelectedJob(j);
                                  setJobPickerOpen(false);
                                  const est = Number(j.estimate_amount) || 0;
                                  if (est > 0) setAmount(est.toFixed(2));
                                  setNotes(j.description || '');
                                  setNotesDirty(false);
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
                    )}

                    {selectedJob && !jobPickerOpen ? (
                      <View style={{ marginTop: 14 }}>
                        <View style={styles.scopeHeader}>
                          <Text style={styles.label}>Scope of work</Text>
                          {Number(selectedJob.estimate_amount) > 0 ? (
                            <Text style={styles.scopeEstimate}>
                              Original estimate: ${Number(selectedJob.estimate_amount).toFixed(2)}
                            </Text>
                          ) : null}
                        </View>
                        <TextInput
                          style={styles.notesInput}
                          placeholder="What's on this invoice? Line items, schedule notes, scope details — all editable."
                          placeholderTextColor={theme.textMuted}
                          value={notes}
                          onChangeText={(v) => { setNotes(v); setNotesDirty(true); }}
                          multiline
                          textAlignVertical="top"
                        />
                      </View>
                    ) : null}

                    <LineItemsPicker
                      items={lineItems}
                      onChange={setLineItems}
                      label="Add line items (optional)"
                      emptyLabel="Skip if your scope above already itemizes the work."
                    />

                    {lineItems.length > 0 ? (
                      <View style={styles.lineItemsTotal}>
                        <Text style={styles.lineItemsTotalLabel}>Total</Text>
                        <Text style={styles.lineItemsTotalValue}>${invoiceTotal.toFixed(2)}</Text>
                      </View>
                    ) : (
                      <>
                        <View style={styles.orDivider}>
                          <View style={styles.orLine} />
                          <Text style={styles.orText}>OR ENTER A CUSTOM AMOUNT</Text>
                          <View style={styles.orLine} />
                        </View>
                        <TextInput
                          style={styles.amountInput}
                          placeholder="$0.00"
                          placeholderTextColor={theme.textMuted}
                          keyboardType="decimal-pad"
                          value={amount}
                          onChangeText={setAmount}
                        />
                      </>
                    )}
                  </>
                ) : (
                <View style={styles.previewCard}>
                  <Text style={styles.previewEyebrow}>Invoice Preview</Text>
                  <Text style={styles.previewTitle}>{selectedJob?.name || 'Untitled job'}</Text>
                  <Text style={styles.previewMeta}>
                    {[selectedJob?.clients?.name || 'No client', selectedJob?.clients?.email || 'No email on file']
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {notes.trim() ? (
                    <Text style={styles.previewDescription}>{notes.trim()}</Text>
                  ) : null}

                  <View style={styles.previewDivider} />

                  {lineItems.length > 0 ? (
                    lineItems.map(item => {
                      const quantity = Number(item.quantity) || 1;
                      const unitPrice = Number(item.unitPrice) || 0;
                      const total = quantity * unitPrice;
                      return (
                        <View key={item.id} style={styles.previewLine}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.previewLineName}>{item.name || 'Item'}</Text>
                            {item.description ? <Text style={styles.previewLineMeta}>{item.description}</Text> : null}
                            <Text style={styles.previewLineMeta}>{quantity} x ${unitPrice.toFixed(2)}</Text>
                          </View>
                          <Text style={styles.previewLineAmount}>${total.toFixed(2)}</Text>
                        </View>
                      );
                    })
                  ) : (
                    <View style={styles.previewLine}>
                      <Text style={styles.previewLineName}>Invoice amount</Text>
                      <Text style={styles.previewLineAmount}>${previewTotal.toFixed(2)}</Text>
                    </View>
                  )}

                  <View style={styles.previewTotalRow}>
                    <Text style={styles.previewTotalLabel}>Total</Text>
                    <Text style={styles.previewTotal}>${previewTotal.toFixed(2)}</Text>
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              {invoiceStep === 'edit' ? (
                <>
                  <TouchableOpacity
                    style={[styles.submit, (!canPreviewInvoice || submitting) && { opacity: 0.4 }]}
                    onPress={() => setInvoiceStep('preview')}
                    disabled={!canPreviewInvoice || submitting}
                  >
                    <Text style={styles.submitText}>Preview invoice</Text>
                  </TouchableOpacity>
                  {!canPreviewInvoice ? (
                    <Text style={styles.disabledHint}>
                      {!selectedJob ? 'Pick a job first.' : 'Add line items or enter an amount.'}
                    </Text>
                  ) : null}
                </>
              ) : (
                <View style={styles.footerRow}>
                  <TouchableOpacity
                    style={[styles.submitGhost, styles.footerGhost]}
                    onPress={() => setInvoiceStep('edit')}
                    disabled={submitting}
                  >
                    <Text style={styles.submitGhostText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.submit, styles.footerPrimary, submitting && { opacity: 0.4 }]}
                    onPress={submitInvoice}
                    disabled={submitting}
                  >
                    {submitting
                      ? <ActivityIndicator color={theme.accentContrast} />
                      : <Text style={styles.submitText}>Send invoice</Text>}
                  </TouchableOpacity>
                </View>
              )}
            </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!actionJob} animationType="fade" transparent onRequestClose={() => setActionJob(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => !markingPaid && setActionJob(null)}>
          <Pressable style={styles.actionSheet} onPress={() => {}}>
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
                {markingPaid ? <ActivityIndicator color={theme.accentContrast} /> : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="checkmark-circle-outline" size={18} color={theme.accentContrast} />
                    <Text style={styles.submitText}>Mark paid + email receipt</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}

            {actionJob?.clients?.email && (
              <TouchableOpacity
                style={[styles.submitGhost, markingPaid && { opacity: 0.4 }]}
                onPress={resendInvoice}
                disabled={markingPaid}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="mail-outline" size={18} color={theme.accent} />
                  <Text style={styles.submitGhostText}>Resend invoice email</Text>
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.submitGhost, markingPaid && { opacity: 0.4 }]}
              onPress={() => markPaid(false)}
              disabled={markingPaid}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="checkmark-outline" size={18} color={theme.accent} />
                <Text style={styles.submitGhostText}>Mark paid (no email)</Text>
              </View>
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="open-outline" size={18} color={theme.accent} />
                <Text style={styles.submitGhostText}>Open job</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setActionJob(null)} disabled={markingPaid}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
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
      gap: 6,
      paddingHorizontal: 12,
      paddingBottom: 8,
    },
    title: { color: t.textPrimary, fontSize: 18, fontWeight: '800' },
    subtitle: { color: t.textMuted, fontSize: 12, marginTop: 1 },
    newBtn: {
      backgroundColor: t.accent,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    newBtnText: { color: t.accentContrast, fontSize: 12, fontWeight: '900' },
    summary: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 },
    summaryCard: {
      flex: 1,
      backgroundColor: t.surface,
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: t.border,
    },
    summaryEyebrow: {
      color: t.textMuted,
      fontSize: 9.5,
      fontWeight: '800',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    summaryValue: { color: t.textPrimary, fontSize: 18, fontWeight: '800', marginTop: 2, fontVariant: ['tabular-nums'] },
    summaryLabel: { color: t.textSecondary, fontSize: 12, marginTop: 2 },

    filterSegment: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginTop: 8,
      marginBottom: 4,
      padding: 3,
      borderRadius: 8,
      backgroundColor: t.surfaceInset,
      borderWidth: 1,
      borderColor: t.border,
    },
    filterSegmentItem: {
      flex: 1, minHeight: 32,
      alignItems: 'center', justifyContent: 'center',
      borderRadius: 6,
    },
    filterSegmentItemActive: {
      backgroundColor: t.surfaceElevated,
      borderWidth: 1, borderColor: t.border,
    },
    filterSegmentText: { color: t.textSecondary, fontSize: 12.5, fontWeight: '800' },
    filterSegmentTextActive: { color: t.textPrimary },

    invoiceRow: {
      flexDirection: 'row',
      backgroundColor: t.surface,
      borderRadius: 10,
      borderWidth: 1, borderColor: t.border,
      overflow: 'hidden',
    },
    invoiceStripe: { width: 3 },
    jobName: { color: t.textPrimary, fontSize: 14, fontWeight: '800', flex: 1 },
    clientName: { color: t.textMuted, fontSize: 12, flex: 1 },
    amount: { color: t.textPrimary, fontSize: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
    statusBadge: { borderRadius: 6, paddingVertical: 2, paddingHorizontal: 7 },
    statusText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },

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
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
    modalTitle: { color: t.textPrimary, fontSize: 16, fontWeight: '800' },
    modalClose: { color: t.accent, fontWeight: '600' },
    modalCloseBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    changeJobChip: {
      borderRadius: 999, borderWidth: 1, borderColor: t.accent + '55',
      paddingHorizontal: 10, paddingVertical: 5,
      backgroundColor: t.accentSoft,
    },
    changeJobChipText: { color: t.accent, fontSize: 11, fontWeight: '900' },
    orDivider: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginTop: 14, marginBottom: 8,
    },
    orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: t.border },
    orText: {
      color: t.textMuted, fontSize: 9.5, fontWeight: '800',
      letterSpacing: 0.6,
    },
    amountInput: {
      backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
      borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14,
      fontSize: 22, fontWeight: '800',
      color: t.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    lineItemsTotal: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginTop: 12,
      paddingHorizontal: 14, paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: t.accentSoft,
      borderWidth: 1, borderColor: t.accent + '44',
    },
    lineItemsTotalLabel: { color: t.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
    lineItemsTotalValue: { color: t.accent, fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'] },
    disabledHint: {
      color: t.textMuted, fontSize: 11, fontWeight: '700',
      textAlign: 'center', marginTop: 8,
    },
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
    newJobOption: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingVertical: 12, paddingHorizontal: 14,
      borderRadius: 10,
      borderWidth: 1, borderStyle: 'dashed', borderColor: t.accent + '88',
      backgroundColor: t.accentSoft,
      marginBottom: 8,
    },
    newJobOptionText: { color: t.accent, fontSize: 14, fontWeight: '800' },
    inlineJobBox: {
      gap: 8,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1, borderColor: t.accent + '55',
      backgroundColor: t.accentSoft,
    },
    inlineInput: {
      backgroundColor: t.surface,
      borderWidth: 1, borderColor: t.border,
      borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
      color: t.textPrimary, fontSize: 14,
    },
    inlineCancel: {
      flex: 1, paddingVertical: 11, borderRadius: 8,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: t.border,
      backgroundColor: t.surface,
    },
    inlineCancelText: { color: t.textSecondary, fontSize: 13, fontWeight: '800' },
    inlineCreate: {
      flex: 1.4, paddingVertical: 11, borderRadius: 8,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: t.accent,
    },
    inlineCreateText: { color: t.accentContrast, fontSize: 13, fontWeight: '900' },
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
    footerRow: { flexDirection: 'row', gap: 10 },
    footerGhost: { flex: 1, marginTop: 0 },
    footerPrimary: { flex: 1 },
    previewCard: {
      backgroundColor: t.surfaceInset,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 12,
      padding: 14,
      marginTop: 8,
    },
    previewEyebrow: {
      color: t.accent,
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    previewTitle: { color: t.textPrimary, fontSize: 18, fontWeight: '800', marginTop: 6 },
    previewMeta: { color: t.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
    previewDescription: { color: t.textSecondary, fontSize: 13, marginTop: 10, lineHeight: 19 },
    previewDivider: { height: 1, backgroundColor: t.border, marginVertical: 14 },

    scopeHeader: {
      flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
      gap: 8, marginBottom: 6,
    },
    scopeEstimate: { color: t.textMuted, fontSize: 12, fontWeight: '700' },
    notesInput: {
      backgroundColor: t.surfaceInset,
      borderRadius: 12,
      padding: 14,
      color: t.textPrimary,
      fontSize: 14,
      lineHeight: 20,
      minHeight: 110,
    },
    previewLine: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    previewLineName: { color: t.textPrimary, fontSize: 14, fontWeight: '700' },
    previewLineMeta: { color: t.textMuted, fontSize: 12, marginTop: 2 },
    previewLineAmount: { color: t.textPrimary, fontSize: 14, fontWeight: '800' },
    previewTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14 },
    previewTotalLabel: { color: t.textSecondary, fontSize: 13, fontWeight: '800' },
    previewTotal: { color: t.textPrimary, fontSize: 22, fontWeight: '900' },
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
