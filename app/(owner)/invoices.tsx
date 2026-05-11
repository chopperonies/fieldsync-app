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
// Worksheet rows: name + qty + price (per-unit). Mirrors the web invoice
// editor — quick inline editing, auto-totalled, no catalog lookup.
type WorksheetItem = { id: string; name: string; qty: string; price: string };

function newRowId() { return `wi-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`; }
function rowSubtotal(r: WorksheetItem): number {
  return (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0);
}
function worksheetSubtotal(rows: WorksheetItem[]): number {
  return rows.reduce((s, r) => s + rowSubtotal(r), 0);
}

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
  const [subject, setSubject] = useState('');
  const [worksheet, setWorksheet] = useState<WorksheetItem[]>([]);
  const [taxPct, setTaxPct] = useState('0');
  const [discountMode, setDiscountMode] = useState<'pct' | 'amt'>('pct');
  const [discountValue, setDiscountValue] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  // Two notes streams. internalNotes lives on the job and goes to crew/Notes
  // tab — never to the customer. customerNotes lands on the invoice email
  // (payment terms, thank-yous, etc.) and is not stored on the job.
  const [internalNotes, setInternalNotes] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [invoiceStep, setInvoiceStep] = useState<'edit' | 'preview'>('edit');

  const subtotal = useMemo(() => worksheetSubtotal(worksheet), [worksheet]);
  const discountAmount = useMemo(() => {
    const v = parseFloat(discountValue) || 0;
    if (v <= 0) return 0;
    const raw = discountMode === 'pct' ? subtotal * v / 100 : v;
    // Never let the discount take the line below zero.
    return Math.min(raw, subtotal);
  }, [discountMode, discountValue, subtotal]);
  const taxableSubtotal = subtotal - discountAmount;
  const taxAmount = useMemo(() => {
    const pct = parseFloat(taxPct) || 0;
    return taxableSubtotal * pct / 100;
  }, [taxableSubtotal, taxPct]);
  const totalDue = taxableSubtotal + taxAmount;

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

  // Seed the worksheet from a job. Prefer the existing invoice_amount over
  // estimate_amount so re-opening an already-invoiced job lands the editor
  // on the same total the client got, not on the original quote.
  const applySelectedJob = useCallback((job: JobLite) => {
    setSelectedJob(job);
    setJobPickerOpen(false);
    const clientName = job.clients?.name || '';
    setSubject(clientName ? `For Services Rendered — ${clientName}` : (job.name || 'For Services Rendered'));
    const inv = Number(job.invoice_amount) || 0;
    const est = Number(job.estimate_amount) || 0;
    const seed = inv > 0 ? inv : est;
    setWorksheet([{
      id: newRowId(),
      name: job.name || 'Service',
      qty: '1',
      price: seed > 0 ? seed.toFixed(2) : '0',
    }]);
    setTaxPct('0');
    setDiscountMode('pct');
    setDiscountValue('');
    setRecipientName(job.clients?.name || '');
    setRecipientEmail(job.clients?.email || '');
    setInternalNotes(job.description || '');
    setCustomerNotes('');
  }, []);

  const openCreateModal = useCallback(async (preselectJobId?: string | null) => {
    setModalOpen(true);
    setSelectedJob(null);
    setJobPickerOpen(true);
    setJobQuery('');
    setSubject('');
    setWorksheet([]);
    setTaxPct('0');
    setDiscountMode('pct');
    setDiscountValue('');
    setRecipientName('');
    setRecipientEmail('');
    setInternalNotes('');
    setCustomerNotes('');
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
        applySelectedJob(requested);
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

  // Persist edits (recipient + internal notes/scope + worksheet totals) back
  // onto the job without firing an invoice email. Lets the owner use this
  // editor as a working scratchpad — including adding/removing line items on
  // an already-issued invoice — without spamming the customer.
  const saveAndClose = useCallback(async () => {
    if (!selectedJob) {
      setModalOpen(false);
      return;
    }
    const lineDesc = worksheet
      .filter(r => r.name.trim() || rowSubtotal(r) > 0)
      .map(r => `${r.qty}× ${r.name.trim() || 'Item'} @ $${(parseFloat(r.price) || 0).toFixed(2)}`)
      .join(', ');
    const composedDescription = [
      subject.trim() + (lineDesc ? ` (${lineDesc})` : ''),
      internalNotes.trim() ? `Internal: ${internalNotes.trim()}` : null,
    ].filter(Boolean).join(' ') || null;

    const trimmedName = recipientName.trim();
    const trimmedEmail = recipientEmail.trim();

    setSubmitting(true);
    try {
      // Reconcile the client record (mirror submit's behavior).
      try {
        if (!selectedJob.client_id && trimmedName) {
          const created = await mobilePost<{ id: string }>(
            '/api/mobile/owner/clients',
            { name: trimmedName, email: trimmedEmail || null, phone: null },
          );
          if (created?.id) {
            await mobilePatch(`/api/mobile/owner/jobs/${selectedJob.id}`, { client_id: created.id });
          }
        } else if (selectedJob.client_id) {
          const patch: { name?: string; email?: string | null } = {};
          if (trimmedName && trimmedName !== (selectedJob.clients?.name || '')) patch.name = trimmedName;
          if (trimmedEmail !== (selectedJob.clients?.email || '')) patch.email = trimmedEmail || null;
          if (Object.keys(patch).length > 0) {
            await mobilePatch(`/api/mobile/owner/clients/${selectedJob.client_id}`, patch);
          }
        }
      } catch (clientErr: any) {
        console.warn('[invoice save] client update skipped:', clientErr?.message);
      }

      if (totalDue > 0) {
        // Push amount + breakdown + description via the invoice endpoint with
        // send_email:false. This is the path that actually persists worksheet
        // edits (line items, discount, tax) back to the invoice — a plain
        // description PATCH would lose the new total on the next reopen.
        await mobilePost(`/api/mobile/owner/jobs/${selectedJob.id}/invoice`, {
          amount: totalDue,
          description: composedDescription,
          recipient_email: trimmedEmail || null,
          subtotal,
          tax_amount: taxAmount,
          discount_amount: discountAmount,
          discount_label: discountAmount > 0 && discountMode === 'pct' && discountValue
            ? `${parseFloat(discountValue) || 0}%`
            : null,
          send_email: false,
        });
      } else if (composedDescription !== (selectedJob.description ?? null)) {
        await mobilePatch(`/api/mobile/owner/jobs/${selectedJob.id}`, { description: composedDescription });
      }
      setModalOpen(false);
      setInvoiceStep('edit');
      await loadData();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'Try again.');
    } finally {
      setSubmitting(false);
    }
  }, [selectedJob, worksheet, subject, internalNotes, recipientName, recipientEmail, totalDue, subtotal, taxAmount, discountAmount, discountMode, discountValue, loadData]);

  const submitInvoice = useCallback(async () => {
    if (!selectedJob) return Alert.alert('Pick a job first');
    if (totalDue <= 0) return Alert.alert('Add at least one line item with a price');

    // Two strings. job.description (internal) carries subject + line items
    // + internal notes — visible to crew and the owner inside the app.
    // customerNotes (one string, no embedded subject/line items because the
    // email already renders those structurally) is what shows up under
    // "Notes" on the customer-facing email.
    const lineDesc = worksheet
      .filter(r => r.name.trim() || rowSubtotal(r) > 0)
      .map(r => `${r.qty}× ${r.name.trim() || 'Item'} @ $${(parseFloat(r.price) || 0).toFixed(2)}`)
      .join(', ');
    const composedDescription = [
      subject.trim() + (lineDesc ? ` (${lineDesc})` : ''),
      internalNotes.trim() ? `Internal: ${internalNotes.trim()}` : null,
    ].filter(Boolean).join(' ') || null;
    const trimmedCustomerNotes = customerNotes.trim();

    const trimmedName = recipientName.trim();
    const trimmedEmail = recipientEmail.trim();

    setSubmitting(true);
    try {
      // Reconcile the client record with whatever the owner just typed.
      // Three cases: no client yet (create + link), client exists with stale
      // info (patch), or unchanged (skip). All non-blocking — if the client
      // write fails we still try to send the invoice.
      let updatedClient: { name?: string | null; email?: string | null } | null = null;
      try {
        if (!selectedJob.client_id && trimmedName) {
          const created = await mobilePost<{ id: string; name: string; email?: string | null }>(
            '/api/mobile/owner/clients',
            { name: trimmedName, email: trimmedEmail || null, phone: null },
          );
          if (created?.id) {
            await mobilePatch(`/api/mobile/owner/jobs/${selectedJob.id}`, { client_id: created.id });
            updatedClient = { name: created.name, email: created.email };
          }
        } else if (selectedJob.client_id) {
          const patch: { name?: string; email?: string | null } = {};
          if (trimmedName && trimmedName !== (selectedJob.clients?.name || '')) {
            patch.name = trimmedName;
          }
          if (trimmedEmail !== (selectedJob.clients?.email || '')) {
            patch.email = trimmedEmail || null;
          }
          if (Object.keys(patch).length > 0) {
            await mobilePatch(`/api/mobile/owner/clients/${selectedJob.client_id}`, patch);
            updatedClient = patch;
          }
        }
      } catch (clientErr: any) {
        // Surface but don't block — the owner may still want the invoice posted.
        console.warn('[invoice] client update skipped:', clientErr?.message);
      }

      const resp: any = await mobilePost(`/api/mobile/owner/jobs/${selectedJob.id}/invoice`, {
        amount: totalDue,
        description: composedDescription,
        customer_notes: trimmedCustomerNotes || null,
        recipient_email: trimmedEmail || null,
        subtotal,
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        discount_label: discountAmount > 0 && discountMode === 'pct' && discountValue
          ? `${parseFloat(discountValue) || 0}%`
          : null,
      });
      setModalOpen(false);
      setInvoiceStep('edit');
      await loadData();
      if (resp?.invoice_email_sent) {
        Alert.alert('Invoice sent', `Emailed to ${resp.invoice_emailed_to}`);
      } else if (!trimmedEmail) {
        Alert.alert('Invoice created', 'No email entered — invoice saved but not sent. Add an email above to email future invoices.');
      } else {
        Alert.alert('Invoice created', 'Saved, but the email did not go out. Check the recipient email and try Resend from the invoices list.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to send');
    } finally {
      setSubmitting(false);
    }
  }, [selectedJob, totalDue, worksheet, subject, internalNotes, customerNotes, recipientName, recipientEmail, subtotal, taxAmount, discountAmount, discountMode, discountValue, loadData]);

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
  const canPreviewInvoice = !!selectedJob && totalDue > 0;

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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeCreateModal} />
          <View style={styles.modalSheet}>
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
                                onPress={() => applySelectedJob(j)}
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
                      <>
                        <View style={{ marginTop: 14 }}>
                          <Text style={styles.label}>Bill to</Text>
                          <View style={styles.recipientCard}>
                            <View style={styles.recipientFieldRow}>
                              <Ionicons name="person-outline" size={16} color={theme.textSecondary} style={styles.recipientFieldIcon} />
                              <TextInput
                                style={styles.recipientInput}
                                placeholder="Client name"
                                placeholderTextColor={theme.textMuted}
                                value={recipientName}
                                onChangeText={setRecipientName}
                                autoCapitalize="words"
                              />
                            </View>
                            <View style={styles.recipientFieldRow}>
                              <Ionicons name="mail-outline" size={16} color={theme.textSecondary} style={styles.recipientFieldIcon} />
                              <TextInput
                                style={styles.recipientInput}
                                placeholder="Email (required to email)"
                                placeholderTextColor={theme.textMuted}
                                value={recipientEmail}
                                onChangeText={setRecipientEmail}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                autoCorrect={false}
                              />
                            </View>
                            <Text style={styles.recipientHint}>
                              {selectedJob.client_id
                                ? 'Edits save to the client record.'
                                : 'A new client will be created and linked to this job.'}
                            </Text>
                          </View>
                        </View>

                        <View style={{ marginTop: 14 }}>
                          <Text style={styles.label}>Subject</Text>
                          <TextInput
                            style={styles.subjectInput}
                            placeholder="For services rendered…"
                            placeholderTextColor={theme.textMuted}
                            value={subject}
                            onChangeText={setSubject}
                          />
                        </View>

                        <View style={{ marginTop: 14 }}>
                          <View style={styles.worksheetHead}>
                            <Text style={styles.label}>Line items</Text>
                            <TouchableOpacity
                              onPress={() => setWorksheet(prev => [...prev, { id: newRowId(), name: '', qty: '1', price: '0' }])}
                              style={styles.addLineBtn}
                              activeOpacity={0.75}
                            >
                              <Ionicons name="add" size={16} color={theme.success} />
                              <Text style={styles.addLineText}>Add line</Text>
                            </TouchableOpacity>
                          </View>

                          {worksheet.map((row) => (
                            <View key={row.id} style={styles.worksheetCard}>
                              {/* Description spans the full row so a long
                                  scope doesn't scroll out of view as you type. */}
                              <TextInput
                                style={styles.descInput}
                                placeholder="Description"
                                placeholderTextColor={theme.textMuted}
                                value={row.name}
                                onChangeText={(v) => setWorksheet(prev => prev.map(r => r.id === row.id ? { ...r, name: v } : r))}
                                multiline
                                textAlignVertical="top"
                              />
                              <View style={styles.worksheetMeta}>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.cellLabel}>Qty</Text>
                                  <TextInput
                                    style={[styles.cellInput, styles.numCell]}
                                    keyboardType="decimal-pad"
                                    value={row.qty}
                                    onChangeText={(v) => setWorksheet(prev => prev.map(r => r.id === row.id ? { ...r, qty: v } : r))}
                                  />
                                </View>
                                <View style={{ flex: 1.2 }}>
                                  <Text style={styles.cellLabel}>Price</Text>
                                  <TextInput
                                    style={[styles.cellInput, styles.numCell]}
                                    keyboardType="decimal-pad"
                                    value={row.price}
                                    onChangeText={(v) => setWorksheet(prev => prev.map(r => r.id === row.id ? { ...r, price: v } : r))}
                                  />
                                </View>
                                <View style={{ flex: 1.2 }}>
                                  <Text style={styles.cellLabel}>Total</Text>
                                  <Text style={styles.cellTotal}>${rowSubtotal(row).toFixed(2)}</Text>
                                </View>
                                <TouchableOpacity
                                  onPress={() => setWorksheet(prev => prev.filter(r => r.id !== row.id))}
                                  hitSlop={8}
                                  style={styles.removeBtn}
                                >
                                  <Ionicons name="close" size={18} color={theme.danger} />
                                </TouchableOpacity>
                              </View>
                            </View>
                          ))}

                          {worksheet.length === 0 ? (
                            <Text style={styles.worksheetEmpty}>Tap "Add line" to start.</Text>
                          ) : null}
                        </View>

                        <View style={{ marginTop: 14, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                          <Text style={[styles.label, { flex: 1 }]}>Discount</Text>
                          <View style={styles.discountModeWrap}>
                            {(['pct', 'amt'] as const).map(m => (
                              <TouchableOpacity
                                key={m}
                                onPress={() => setDiscountMode(m)}
                                style={[
                                  styles.discountModeBtn,
                                  discountMode === m && { backgroundColor: theme.surface },
                                ]}
                              >
                                <Text style={[
                                  styles.discountModeText,
                                  discountMode === m && { color: theme.textPrimary, fontWeight: '800' },
                                ]}>
                                  {m === 'pct' ? '%' : '$'}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                          <TextInput
                            style={[
                              styles.cellInput,
                              { width: 90, textAlign: 'right' },
                              !discountValue && styles.cellInputDimmed,
                            ]}
                            keyboardType="decimal-pad"
                            placeholder="optional"
                            placeholderTextColor={theme.textMuted}
                            value={discountValue}
                            onChangeText={setDiscountValue}
                          />
                        </View>

                        <View style={{ marginTop: 14, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                          <Text style={[styles.label, { flex: 1 }]}>Tax %</Text>
                          <TextInput
                            style={[styles.cellInput, { width: 90, textAlign: 'right' }]}
                            keyboardType="decimal-pad"
                            value={taxPct}
                            onChangeText={setTaxPct}
                          />
                        </View>

                        <View style={styles.totalsBox}>
                          <View style={styles.totalsRow}>
                            <Text style={styles.totalsLabel}>Subtotal</Text>
                            <Text style={styles.totalsValue}>${subtotal.toFixed(2)}</Text>
                          </View>
                          {discountAmount > 0 ? (
                            <View style={styles.totalsRow}>
                              <Text style={[styles.totalsLabel, { color: theme.success }]}>
                                Discount {discountMode === 'pct' && discountValue ? `(${parseFloat(discountValue) || 0}%)` : ''}
                              </Text>
                              <Text style={[styles.totalsValue, { color: theme.success }]}>
                                −${discountAmount.toFixed(2)}
                              </Text>
                            </View>
                          ) : null}
                          <View style={styles.totalsRow}>
                            <Text style={styles.totalsLabel}>Tax</Text>
                            <Text style={styles.totalsValue}>${taxAmount.toFixed(2)}</Text>
                          </View>
                          <View style={[styles.totalsRow, { marginTop: 6 }]}>
                            <Text style={styles.totalDueLabel}>Total due</Text>
                            <Text style={styles.totalDueValue}>${totalDue.toFixed(2)}</Text>
                          </View>
                        </View>

                        <View style={{ marginTop: 14 }}>
                          <View style={styles.notesLabelRow}>
                            <Ionicons name="mail-outline" size={14} color={theme.accent} />
                            <Text style={styles.label}>Notes for client</Text>
                            <View style={[styles.notesPill, { backgroundColor: theme.accent + '22' }]}>
                              <Text style={[styles.notesPillText, { color: theme.accent }]}>On invoice</Text>
                            </View>
                          </View>
                          <Text style={styles.notesHint}>Payment terms, thank-you message, anything you want the client to read.</Text>
                          <TextInput
                            style={styles.notesInput}
                            placeholder="e.g. Net 15. Thanks for your business!"
                            placeholderTextColor={theme.textMuted}
                            value={customerNotes}
                            onChangeText={setCustomerNotes}
                            multiline
                            textAlignVertical="top"
                          />
                        </View>

                        <View style={{ marginTop: 14 }}>
                          <View style={styles.notesLabelRow}>
                            <Ionicons name="lock-closed-outline" size={14} color={theme.textSecondary} />
                            <Text style={styles.label}>Internal notes</Text>
                            <View style={[styles.notesPill, { backgroundColor: theme.surfaceInset }]}>
                              <Text style={[styles.notesPillText, { color: theme.textSecondary }]}>Crew only</Text>
                            </View>
                          </View>
                          <Text style={styles.notesHint}>Saved to the job — visible to crew, never sent to the client.</Text>
                          <TextInput
                            style={styles.notesInput}
                            placeholder="Scope details, gotchas, reminders…"
                            placeholderTextColor={theme.textMuted}
                            value={internalNotes}
                            onChangeText={setInternalNotes}
                            multiline
                            textAlignVertical="top"
                          />
                        </View>
                      </>
                    ) : null}
                  </>
                ) : (
                <View style={styles.previewCard}>
                  <Text style={styles.previewEyebrow}>Invoice Preview</Text>
                  <Text style={styles.previewTitle}>{selectedJob?.name || 'Untitled job'}</Text>
                  <Text style={styles.previewMeta}>
                    {[
                      recipientName.trim() || selectedJob?.clients?.name || 'No client',
                      recipientEmail.trim() || selectedJob?.clients?.email || 'No email on file',
                    ].filter(Boolean).join(' · ')}
                  </Text>

                  {subject.trim() ? (
                    <Text style={styles.previewSubject}>{subject.trim()}</Text>
                  ) : null}

                  <View style={styles.previewDivider} />

                  {worksheet.filter(r => r.name.trim() || rowSubtotal(r) > 0).map(row => (
                    <View key={row.id} style={styles.previewLine}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.previewLineName}>{row.name.trim() || 'Item'}</Text>
                        <Text style={styles.previewLineMeta}>
                          {(parseFloat(row.qty) || 0)} × ${(parseFloat(row.price) || 0).toFixed(2)}
                        </Text>
                      </View>
                      <Text style={styles.previewLineAmount}>${rowSubtotal(row).toFixed(2)}</Text>
                    </View>
                  ))}

                  <View style={styles.previewDivider} />

                  <View style={styles.previewTotalsRow}>
                    <Text style={styles.previewTotalsLabel}>Subtotal</Text>
                    <Text style={styles.previewTotalsValue}>${subtotal.toFixed(2)}</Text>
                  </View>
                  {discountAmount > 0 ? (
                    <View style={styles.previewTotalsRow}>
                      <Text style={[styles.previewTotalsLabel, { color: theme.success }]}>
                        Discount {discountMode === 'pct' && discountValue ? `(${parseFloat(discountValue) || 0}%)` : ''}
                      </Text>
                      <Text style={[styles.previewTotalsValue, { color: theme.success }]}>
                        −${discountAmount.toFixed(2)}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.previewTotalsRow}>
                    <Text style={styles.previewTotalsLabel}>
                      Tax {parseFloat(taxPct) > 0 ? `${parseFloat(taxPct)}%` : ''}
                    </Text>
                    <Text style={styles.previewTotalsValue}>${taxAmount.toFixed(2)}</Text>
                  </View>
                  <View style={styles.previewTotalRow}>
                    <Text style={styles.previewTotalLabel}>Total due</Text>
                    <Text style={styles.previewTotal}>${totalDue.toFixed(2)}</Text>
                  </View>

                  {customerNotes.trim() ? (
                    <Text style={styles.previewDescription}>{customerNotes.trim()}</Text>
                  ) : null}
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
                  <TouchableOpacity
                    style={[styles.saveOnlyBtn, (submitting || !selectedJob) && { opacity: 0.4 }]}
                    onPress={saveAndClose}
                    disabled={submitting || !selectedJob}
                  >
                    <Ionicons name="save-outline" size={16} color={theme.accent} />
                    <Text style={styles.saveOnlyText}>Save changes (don't send)</Text>
                  </TouchableOpacity>
                  {!canPreviewInvoice ? (
                    <Text style={styles.disabledHint}>
                      {!selectedJob ? 'Pick a job first.' : 'Add a line item with a price.'}
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
          </View>
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
                openCreateModal(id);
              }}
              disabled={markingPaid}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="create-outline" size={18} color={theme.accent} />
                <Text style={styles.submitGhostText}>Edit invoice</Text>
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

    modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: t.overlay },
    modalBackdrop: { flex: 1, backgroundColor: t.overlay, justifyContent: 'flex-end' }, // legacy — used by the actions sheet below
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
    saveOnlyBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      paddingVertical: 12, marginTop: 8,
    },
    saveOnlyText: { color: t.accent, fontSize: 14, fontWeight: '700' },
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

    subjectInput: {
      backgroundColor: t.surfaceInset,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: t.textPrimary,
      fontSize: 14,
      marginTop: 6,
    },
    recipientCard: {
      backgroundColor: t.surface,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
      padding: 12,
      marginTop: 6,
      gap: 8,
    },
    recipientFieldRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: t.surfaceInset,
      borderRadius: 8,
      paddingHorizontal: 10,
    },
    recipientFieldIcon: { width: 18 },
    recipientInput: {
      flex: 1,
      paddingVertical: 10,
      color: t.textPrimary,
      fontSize: 14,
    },
    recipientHint: { color: t.textMuted, fontSize: 11, lineHeight: 15 },
    worksheetHead: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 8,
    },
    addLineBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999,
      backgroundColor: t.successMuted,
    },
    addLineText: { color: t.success, fontSize: 13, fontWeight: '800' },
    worksheetCard: {
      backgroundColor: t.surface,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
      padding: 12,
      marginTop: 8,
      gap: 8,
    },
    descInput: {
      backgroundColor: t.surfaceInset,
      borderRadius: 8,
      paddingHorizontal: 12, paddingVertical: 10,
      color: t.textPrimary, fontSize: 14, lineHeight: 20,
      minHeight: 60,
    },
    worksheetMeta: {
      flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    },
    cellLabel: {
      color: t.textMuted, fontSize: 10, fontWeight: '900',
      textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4,
    },
    numCell: { textAlign: 'right' },
    removeBtn: {
      width: 32, height: 36,
      alignItems: 'center', justifyContent: 'center',
      borderRadius: 6,
    },
    cellInput: {
      backgroundColor: t.surfaceInset,
      borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: 9,
      color: t.textPrimary, fontSize: 13,
    },
    cellInputDimmed: { opacity: 0.55 },
    discountModeWrap: {
      flexDirection: 'row',
      backgroundColor: t.surfaceInset,
      borderRadius: 8,
      padding: 2,
    },
    discountModeBtn: {
      width: 32, height: 30,
      alignItems: 'center', justifyContent: 'center',
      borderRadius: 6,
    },
    discountModeText: { color: t.textSecondary, fontSize: 13, fontWeight: '700' },
    cellTotal: {
      color: t.textPrimary, fontSize: 14, fontWeight: '800',
      textAlign: 'right', fontVariant: ['tabular-nums'],
      paddingVertical: 10,
    },
    worksheetEmpty: {
      color: t.textMuted, fontSize: 13, fontStyle: 'italic',
      paddingVertical: 12, textAlign: 'center',
    },
    totalsBox: {
      marginTop: 12,
      backgroundColor: t.surfaceInset,
      borderRadius: 12,
      padding: 14,
      gap: 4,
    },
    totalsRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    totalsLabel: { color: t.textSecondary, fontSize: 13, fontWeight: '600' },
    totalsValue: { color: t.textPrimary, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
    totalDueLabel: { color: t.textPrimary, fontSize: 15, fontWeight: '800' },
    totalDueValue: { color: t.accent, fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
    notesInput: {
      backgroundColor: t.surfaceInset,
      borderRadius: 12,
      padding: 14,
      color: t.textPrimary,
      fontSize: 14,
      lineHeight: 20,
      minHeight: 80,
      marginTop: 6,
    },
    notesLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    notesPill: {
      marginLeft: 'auto',
      paddingVertical: 2, paddingHorizontal: 8,
      borderRadius: 999,
    },
    notesPillText: { fontSize: 11, fontWeight: '800' },
    notesHint: { color: t.textMuted, fontSize: 12, marginTop: 4, lineHeight: 16 },
    previewSubject: { color: t.textPrimary, fontSize: 14, fontWeight: '700', marginTop: 10 },
    previewTotalsRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginTop: 4,
    },
    previewTotalsLabel: { color: t.textSecondary, fontSize: 13 },
    previewTotalsValue: { color: t.textPrimary, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
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
