import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Linking, Modal, TextInput, Share,
  KeyboardAvoidingView, Platform, Image, RefreshControl, Keyboard, Switch,
} from 'react-native';
import { Stack, useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileGet, mobilePatch, mobilePost } from '../../../lib/mobileApi';
import { Job, Employee, supabase } from '../../../lib/supabase';
import CalendarPicker, { prettyDate } from '../../../components/CalendarPicker';
import { useTheme } from '../../../lib/themeContext';
import { useKeyboardVisible } from '../../../lib/useKeyboardVisible';
import { Theme } from '../../../lib/theme';
import { STATUS_META, normalizeStatusKey, lifecycleIndex, LIFECYCLE_ORDER, JobStatusKey } from '../../../lib/jobStatus';
import { callNumber, textNumber } from '../../../lib/phone';
import { useRole, isOwnerRole, canEditSettings } from '../../../lib/useRole';
import JobAttachments from '../../../components/JobAttachments';

// Map UI status key → backend DB status (crew-driven lifecycle).
const PILL_TO_BACKEND: Record<string, string> = {
  complete: 'completed',
  canceled: 'cancelled',
  on_hold: 'on_hold',
  on_the_way: 'en_route',
};
function toBackendStatus(uiKey: string) {
  return PILL_TO_BACKEND[uiKey] || uiKey;
}

// "[x] " prefix on a checklist string marks the item as done. Lives in the
// string itself so we don't need a schema change on jobs.checklist_items.
const CHECKLIST_DONE_RE = /^\s*\[x\]\s*/i;
function isChecklistItemDone(s: string): boolean {
  return CHECKLIST_DONE_RE.test(s || '');
}
function checklistItemText(s: string): string {
  return (s || '').replace(CHECKLIST_DONE_RE, '');
}

type Assignment = {
  id: string;
  employee_id: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  employees: { id: string; name: string; phone?: string | null; role?: string | null } | null;
};
type Update = {
  id: string;
  type: string | null;
  message: string | null;
  photo_url: string | null;
  created_at: string;
  employees?: { name: string } | null;
};

// Owner-facing pipeline keys — subset of STATUS_META we let the owner advance through.
const PIPELINE_KEYS = ['quoted', 'scheduled', 'in_progress', 'complete', 'invoiced', 'on_hold'] as const;

type Tab = 'overview' | 'crew' | 'notes' | 'photos';

export default function OwnerJobDetail() {
  const { id, tab: tabParam } = useLocalSearchParams<{ id: string; tab?: string }>();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = makeStyles(theme);
  const kbVisible = useKeyboardVisible();

  const role = useRole();
  const isApprover = role === 'owner' || role === 'manager' || role === 'supervisor';
  const isCrew = role === 'crew';

  const initialTab: Tab = (['overview', 'crew', 'notes', 'photos'] as const).includes(tabParam as Tab)
    ? (tabParam as Tab)
    : 'overview';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [job, setJob] = useState<Job | null>(null);
  // First-entry timestamp per status (lifecycle popup uses this).
  const [statusEnteredAt, setStatusEnteredAt] = useState<Record<string, { at: string; actor?: string | null }>>({});
  const [client, setClient] = useState<any>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [scopeAcks, setScopeAcks] = useState<{ employee_id: string; acked_at: string; acked_scope_updated_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [picker, setPicker] = useState<null | 'schedule' | 'estimate' | 'details' | 'assign'>(null);
  const [photoViewerUrl, setPhotoViewerUrl] = useState<string | null>(null);

  // Shared edit state
  const [scheduledDate, setScheduledDate] = useState<string | null>(null);
  const [estimateAmt, setEstimateAmt] = useState('');
  const [detailsDescription, setDetailsDescription] = useState('');
  const [detailsChecklist, setDetailsChecklist] = useState<string[]>([]);
  // Inline checklist editing — quick add, in-place edit, toggle done.
  const [quickChecklistDraft, setQuickChecklistDraft] = useState('');
  const [quickChecklistSaving, setQuickChecklistSaving] = useState(false);
  const [editingChecklistIndex, setEditingChecklistIndex] = useState<number | null>(null);
  const [editingChecklistDraft, setEditingChecklistDraft] = useState('');
  const [invoiceAmt, setInvoiceAmt] = useState('');
  const [saving, setSaving] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [chipsHaveOverflow, setChipsHaveOverflow] = useState(false);
  const [chipsAtEnd, setChipsAtEnd] = useState(false);
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [clientNameDraft, setClientNameDraft] = useState('');
  const [clientPhoneDraft, setClientPhoneDraft] = useState('');
  const [clientEmailDraft, setClientEmailDraft] = useState('');
  const [clientSaving, setClientSaving] = useState(false);

  // Assign crew state
  const [allCrew, setAllCrew] = useState<Employee[]>([]);
  const [selectedCrewIds, setSelectedCrewIds] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    try {
      const data = await mobileGet<{
        job: Job; client: any; assignments: Assignment[]; updates: Update[]; photoCount: number;
        scope_acks?: { employee_id: string; acked_at: string; acked_scope_updated_at: string }[];
      }>(`/api/mobile/owner/jobs/${id}`);
      setJob(data.job);
      setClient(data.client);
      setAssignments(data.assignments || []);
      setUpdates(data.updates || []);
      setScopeAcks(data.scope_acks || []);
      // Best-effort: pull lifecycle timestamps for the popup. If the audit
      // table is empty (older job pre-migration) the map just stays empty.
      mobileGet<Array<{ to_status: string; created_at: string; actor_name?: string | null }>>(`/api/mobile/owner/jobs/${id}/status-history`)
        .then(events => {
          const map: Record<string, { at: string; actor?: string | null }> = {};
          for (const e of (events || [])) {
            // First entry into each status wins (so revert tells you when
            // you originally entered the step you're rolling back to).
            if (e.to_status && !map[e.to_status]) {
              map[e.to_status] = { at: e.created_at, actor: e.actor_name || null };
            }
          }
          setStatusEnteredAt(map);
        })
        .catch(() => {});
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not load job');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Resetting the sub-tab to Overview on blur means navigating away (modal,
  // thread, photo viewer) and returning lands you on the summary instead of
  // the last specialized tab — matches the iOS Mail/Maps convention.
  useFocusEffect(useCallback(() => {
    return () => { setTab('overview'); };
  }, []));

  async function advance(statusKey: string) {
    if (!job) return;
    const backendStatus = toBackendStatus(statusKey);
    try {
      // Owner/manager keep PATCH (writes status plus can set other fields).
      // Crew/supervisor go through the role-aware transition API.
      if (isApprover) {
        const updated = await mobilePatch<Job>(`/api/mobile/owner/jobs/${job.id}`, { status: backendStatus });
        setJob(prev => prev ? { ...prev, ...updated } : prev);
      } else {
        const resp = await mobilePost<any>(`/api/mobile/jobs/${job.id}/transition`, { to_status: backendStatus });
        setJob(prev => prev ? { ...prev, status: resp?.job?.status || backendStatus } : prev);
      }
    } catch (e: any) {
      if (/checkpoint/i.test(e?.message || '')) {
        Alert.alert('Hold on', 'Some required plans aren\'t confirmed yet. Review the Plans & Documents section first.');
      } else {
        Alert.alert('Error', e?.message || 'Could not update status');
      }
    }
  }

  async function toggleRequiresApproval(next: boolean) {
    if (!job) return;
    // Optimistic update so the toggle feels instant.
    setJob(prev => prev ? ({ ...prev, requires_owner_approval: next } as any) : prev);
    try {
      await mobilePatch<Job>(`/api/mobile/owner/jobs/${job.id}`, { requires_owner_approval: next });
    } catch (e: any) {
      // Roll back on failure.
      setJob(prev => prev ? ({ ...prev, requires_owner_approval: !next } as any) : prev);
      Alert.alert('Could not update', e?.message || 'Try again.');
    }
  }

  async function addQuickChecklistItem() {
    if (!job) return;
    const value = quickChecklistDraft.trim();
    if (!value) return;
    const next = [
      ...(Array.isArray((job as any).checklist_items) ? (job as any).checklist_items : []),
      value,
    ];
    setQuickChecklistSaving(true);
    try {
      await mobilePatch(`/api/mobile/owner/jobs/${job.id}`, { checklist_items: next });
      setQuickChecklistDraft('');
      await load();
    } catch (e: any) {
      Alert.alert('Could not add', e?.message || 'Try again.');
    } finally {
      setQuickChecklistSaving(false);
    }
  }

  async function removeChecklistItem(index: number) {
    if (!job) return;
    const current = Array.isArray((job as any).checklist_items) ? (job as any).checklist_items : [];
    const next = current.filter((_: string, i: number) => i !== index);
    try {
      await mobilePatch(`/api/mobile/owner/jobs/${job.id}`, { checklist_items: next });
      await load();
    } catch (e: any) {
      Alert.alert('Could not remove', e?.message || 'Try again.');
    }
  }

  // Done-state lives in the string itself: a "[x] " prefix marks a
  // completed item. Keeps the checklist as a string[] (no schema change)
  // and round-trips through the existing PATCH endpoint cleanly.
  async function toggleChecklistItem(index: number) {
    if (!job) return;
    const current = Array.isArray((job as any).checklist_items) ? [...(job as any).checklist_items] : [];
    const raw = current[index];
    if (raw === undefined) return;
    const done = isChecklistItemDone(raw);
    const text = checklistItemText(raw);
    current[index] = done ? text : `[x] ${text}`;
    try {
      await mobilePatch(`/api/mobile/owner/jobs/${job.id}`, { checklist_items: current });
      await load();
    } catch (e: any) {
      Alert.alert('Could not update', e?.message || 'Try again.');
    }
  }

  function beginChecklistEdit(index: number, text: string) {
    setEditingChecklistIndex(index);
    setEditingChecklistDraft(text);
  }

  async function commitChecklistEdit(index: number) {
    if (!job) {
      setEditingChecklistIndex(null);
      return;
    }
    const current = Array.isArray((job as any).checklist_items) ? [...(job as any).checklist_items] : [];
    const raw = current[index];
    if (raw === undefined) {
      setEditingChecklistIndex(null);
      return;
    }
    const trimmed = editingChecklistDraft.trim();
    if (!trimmed) {
      // Empty edit removes the row.
      const next = current.filter((_: string, i: number) => i !== index);
      try {
        await mobilePatch(`/api/mobile/owner/jobs/${job.id}`, { checklist_items: next });
      } catch (e: any) {
        Alert.alert('Could not save', e?.message || 'Try again.');
      }
      setEditingChecklistIndex(null);
      setEditingChecklistDraft('');
      await load();
      return;
    }
    const done = isChecklistItemDone(raw);
    if (trimmed === checklistItemText(raw)) {
      // No change — bail without a network call.
      setEditingChecklistIndex(null);
      setEditingChecklistDraft('');
      return;
    }
    current[index] = done ? `[x] ${trimmed}` : trimmed;
    try {
      await mobilePatch(`/api/mobile/owner/jobs/${job.id}`, { checklist_items: current });
      setEditingChecklistIndex(null);
      setEditingChecklistDraft('');
      await load();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'Try again.');
    }
  }

  async function approveClose() {
    if (!job) return;
    try {
      await mobilePost(`/api/mobile/jobs/${job.id}/approve`, {});
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not approve');
    }
  }

  async function openJobThread() {
    if (!job) return;
    try {
      const thread = await mobilePost<{ id: string }>('/api/mobile/chat/threads', { job_id: job.id });
      if (thread?.id) {
        router.push({ pathname: '/(owner)/message/[id]', params: { id: thread.id } } as any);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not open thread');
    }
  }

  async function rejectClose() {
    if (!job) return;
    // Alert.prompt is iOS-only. Android: confirm + bounce back without reason.
    // Future: replace with a proper modal that takes a reason on both OSs.
    Alert.alert(
      'Reject closure?',
      'This bounces the job back to In Progress and notifies the crew.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              await mobilePost(`/api/mobile/jobs/${job.id}/reject-completion`, {});
              await load();
            } catch (e: any) { Alert.alert('Error', e?.message || 'Could not reject'); }
          },
        },
      ],
    );
  }

  async function saveScheduledDate(v: string | null) {
    if (!job) return;
    try {
      const updated = await mobilePatch<Job>(`/api/mobile/owner/jobs/${job.id}`, { scheduled_date: v });
      setJob(prev => prev ? { ...prev, ...updated } : prev);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save schedule');
    }
  }

  async function saveEstimate() {
    if (!job) return;
    const n = estimateAmt.trim() === '' ? null : parseFloat(estimateAmt);
    if (n !== null && (isNaN(n) || n < 0)) return Alert.alert('Invalid amount');
    setSaving(true);
    try {
      const updated = await mobilePatch<Job>(`/api/mobile/owner/jobs/${job.id}`, { estimate_amount: n });
      setJob(prev => prev ? { ...prev, ...updated } : prev);
      setPicker(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  async function saveDetails() {
    if (!job) return;
    setSaving(true);
    try {
      // Checklist is managed inline on the dedicated card now; the Scope
      // modal only edits the description.
      const updated = await mobilePatch<Job>(`/api/mobile/owner/jobs/${job.id}`, {
        description: detailsDescription.trim() || null,
      });
      setJob(prev => prev ? { ...prev, ...updated } : prev);
      setPicker(null);
      Alert.alert('Saved', 'Crew on site will be notified.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  async function sendInvoice() {
    if (!job) return;
    const n = parseFloat(invoiceAmt);
    if (!n || n <= 0) return Alert.alert('Enter a valid amount');
    setSaving(true);
    try {
      const resp: any = await mobilePost(`/api/mobile/owner/jobs/${job.id}/invoice`, { amount: n });
      setJob(prev => prev ? { ...prev, ...resp.job } : prev);
      setPicker(null);
      setInvoiceAmt('');
      Alert.alert(
        resp?.invoice_email_sent ? 'Invoice sent' : 'Invoice created',
        resp?.invoice_email_sent ? `Emailed to ${resp.invoice_emailed_to}` : 'No client email on file, nothing was sent.'
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not send invoice');
    } finally {
      setSaving(false);
    }
  }

  function openFullInvoice() {
    if (!job) return;
    router.push({ pathname: '/(owner)/invoices', params: { open: 'quick_invoice', job_id: job.id } } as any);
  }

  async function markPaid(withEmail: boolean) {
    if (!job) return;
    Alert.alert('Mark as paid?', 'This records the payment and optionally emails a receipt.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: withEmail ? 'Mark + Email Receipt' : 'Mark Paid',
        onPress: async () => {
          try {
            const resp: any = await mobilePost(`/api/mobile/owner/jobs/${job.id}/mark-paid`, withEmail ? { notify: 'email' } : {});
            setJob(prev => prev ? { ...prev, ...resp.job } : prev);
            Alert.alert('Saved', withEmail && resp?.receipt_email_sent ? 'Receipt emailed.' : 'Marked paid.');
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not mark paid');
          }
        },
      },
    ]);
  }

  async function shareWorkOrder() {
    if (!job) return;
    const url = `https://linkcrew.io/workorder?job_id=${job.id}`;
    await Share.share({ message: `View work order / estimate: ${url}`, url });
  }

  async function emailWorkOrder() {
    if (!job) return;
    try {
      const resp: any = await mobilePost(`/api/mobile/owner/jobs/${job.id}/send-workorder`);
      Alert.alert('Sent', `Work order emailed to ${resp?.emailed_to || 'client'}.`);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not send');
    }
  }

  function openWorkOrderSheet() {
    if (!job) return;
    const email = client?.email || null;
    const buttons: any[] = [];
    if (email) {
      buttons.push({ text: `Email to ${email}`, onPress: emailWorkOrder });
    } else {
      buttons.push({
        text: 'Add client email to enable',
        onPress: openClientEditor,
      });
    }
    buttons.push({ text: 'Share link…', onPress: shareWorkOrder });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Send work order', undefined, buttons);
  }

  function openDirections() {
    if (!job?.address) return Alert.alert('No address', 'This job has no address on file.');
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`);
  }

  function openClientEditor() {
    setClientNameDraft(client?.name || '');
    setClientPhoneDraft(client?.phone || '');
    setClientEmailDraft(client?.email || '');
    setClientModalOpen(true);
  }

  function textClient() {
    if (!clientPhone) {
      return Alert.alert('No client phone', 'Add a phone number to this job\'s client contact.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Add phone', onPress: openClientEditor },
      ]);
    }
    textNumber(clientPhone);
  }

  function callClient() {
    if (!clientPhone) {
      return Alert.alert('No client phone', 'Add a phone number to this job\'s client contact.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Add phone', onPress: openClientEditor },
      ]);
    }
    callNumber(clientPhone);
  }

  async function saveClientContact() {
    if (!job) return;
    const hasAnyContact = clientNameDraft.trim() || clientPhoneDraft.trim() || clientEmailDraft.trim();
    if (!hasAnyContact) return Alert.alert('Add client info', 'Enter a name, phone, or email.');
    setClientSaving(true);
    try {
      await mobilePatch(`/api/mobile/owner/jobs/${job.id}`, {
        client_name: clientNameDraft.trim() || null,
        client_phone: clientPhoneDraft.trim() || null,
        client_email: clientEmailDraft.trim() || null,
      });
      setClientModalOpen(false);
      await load();
      Alert.alert('Saved', 'Client contact updated.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save client contact.');
    } finally {
      setClientSaving(false);
    }
  }

  async function uploadJobPhoto(base64: string): Promise<string | null> {
    if (!job) return null;
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fileName = `${job.id}/${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from('photos')
      .upload(fileName, bytes, { contentType: 'image/jpeg' });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('photos').getPublicUrl(fileName);
    return data.publicUrl;
  }

  async function handleAddPhoto() {
    if (!job) return;
    setCameraBusy(true);
    try {
      const result = await ImagePicker.launchCameraAsync({ quality: 0.8, base64: true });
      if (result.canceled || !result.assets[0].base64) return;
      const url = await uploadJobPhoto(result.assets[0].base64);
      if (!url) return;
      await mobilePost(`/api/mobile/owner/jobs/${job.id}/updates`, {
        type: 'photo',
        message: 'Site photo',
        photo_url: url,
      });
      await load();
      Alert.alert('Uploaded', 'Photo saved to this job.');
    } catch (e: any) {
      Alert.alert('Failed', e?.message || 'Could not save photo.');
    } finally {
      setCameraBusy(false);
    }
  }

  async function submitNoteFromModal() {
    if (!job || !noteText.trim()) return;
    setNoteSaving(true);
    try {
      await mobilePost(`/api/mobile/owner/jobs/${job.id}/updates`, {
        type: 'note',
        message: noteText.trim(),
      });
      setNoteText('');
      setNoteModalOpen(false);
      await load();
      Alert.alert('Note saved');
    } catch (e: any) {
      Alert.alert('Failed', e?.message || 'Could not save note.');
    } finally {
      setNoteSaving(false);
    }
  }

  async function openAssignModal() {
    try {
      const crew = await mobileGet<Employee[]>('/api/mobile/owner/crew');
      setAllCrew((crew || []).filter(e => e.role === 'crew' || e.role === 'manager'));
    } catch {
      setAllCrew([]);
    }
    setSelectedCrewIds(new Set(assignments.map(a => a.employee_id)));
    setPicker('assign');
  }

  async function saveAssignments() {
    if (!job) return;
    setAssigning(true);
    try {
      await mobilePost(`/api/mobile/owner/jobs/${job.id}/assignments`, {
        employee_ids: [...selectedCrewIds],
      });
      await load();
      setPicker(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save assignments');
    } finally {
      setAssigning(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }
  if (!job) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
        <Text style={{ color: '#888' }}>Job not found.</Text>
      </View>
    );
  }

  const statusKey = normalizeStatusKey(job.status);
  const currentIndex = lifecycleIndex(job.status);

  const invoiceAmtExisting = Number((job as any).invoice_amount) || 0;
  const paid = String((job as any).payment_status || '').toLowerCase() === 'paid';
  const hasDate = !!((job as any).scheduled_date);
  const clientPhone = client?.phone || null;
  const clientEmail = client?.email || null;

  function handlePipePress(target: JobStatusKey) {
    const targetIdx = LIFECYCLE_ORDER.indexOf(target);
    const label = STATUS_META.find(s => s.key === target)?.label || target;
    const stamp = statusEnteredAt[target];
    const tsLine = stamp
      ? `Entered ${new Date(stamp.at).toLocaleString()}${stamp.actor ? ` · ${stamp.actor}` : ''}.`
      : 'No entry timestamp recorded for this step.';
    // Tap on the current step → just show the timestamp.
    if (targetIdx !== -1 && currentIndex !== -1 && targetIdx === currentIndex) {
      Alert.alert(label, tsLine);
      return;
    }
    // Revert confirm: only when moving backward on the linear path.
    if (targetIdx !== -1 && currentIndex !== -1 && targetIdx < currentIndex) {
      Alert.alert(
        `${label} — revert?`,
        [
          tsLine,
          'Reverting moves the job backward. Crew phones and the dashboard update instantly.',
        ].join('\n\n'),
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Revert', style: 'destructive', onPress: () => advance(target) },
        ],
      );
      return;
    }
    // Advancing to In progress without an appointment date — nudge.
    if (target === 'in_progress' && !hasDate) {
      Alert.alert(
        'No appointment date picked',
        'The job has no date on the calendar. Set one or use today?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Pick date', onPress: () => { setScheduledDate(null); setPicker('schedule'); } },
          {
            text: 'Use today & continue',
            onPress: async () => {
              const today = new Date();
              const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
              await saveScheduledDate(iso);
              advance('in_progress');
            },
          },
        ],
      );
      return;
    }
    advance(target);
  }

  // Next-step guidance card — replaces the redundant hero pill.
  type NextStep = {
    tone: typeof STATUS_META[number]['tone'];
    icon: typeof STATUS_META[number]['icon'];
    title: string;
    body: string;
    ctaLabel?: string;
    onCta?: () => void;
  };
  let nextStep: NextStep | null = null;
  switch (statusKey) {
    case 'quoted':
      nextStep = {
        tone: 'stageIndigo', icon: 'document-text-outline',
        title: 'Estimate is out',
        body: 'Client hasn\'t accepted yet. Mark Booked once they say yes.',
        ctaLabel: 'Mark as Booked', onCta: () => advance('scheduled'),
      };
      break;
    case 'scheduled':
      nextStep = hasDate
        ? {
            tone: 'stageCyan', icon: 'checkmark-circle-outline',
            title: 'All set',
            body: 'Appointment picked. Move to In progress when the crew is on site.',
            ctaLabel: 'Mark In progress', onCta: () => handlePipePress('in_progress'),
          }
        : {
            tone: 'stageBlue', icon: 'calendar-outline',
            title: 'Pick an appointment',
            body: 'Give the crew a date — they\'ll be notified.',
            ctaLabel: 'Set date',
            onCta: () => { setScheduledDate(null); setPicker('schedule'); },
          };
      break;
    case 'on_the_way':
      nextStep = {
        tone: 'stagePurple', icon: 'navigate-outline',
        title: 'Crew is en route',
        body: 'They\'ll flip to In progress when they arrive. No action needed from you.',
      };
      break;
    case 'in_progress':
      nextStep = {
        tone: 'stageGreen', icon: 'construct-outline',
        title: 'Work is underway',
        body: 'Crew on site. Mark Complete when the job is done.',
        ctaLabel: 'Mark Complete', onCta: () => advance('complete'),
      };
      break;
    case 'on_hold':
      nextStep = {
        tone: 'stageCyan', icon: 'play-circle-outline',
        title: 'Paused',
        body: 'Crew sees a hold banner. Resume to put them back on it.',
        ctaLabel: 'Resume', onCta: () => advance('in_progress'),
      };
      break;
    case 'complete':
      nextStep = invoiceAmtExisting > 0
        ? {
            tone: 'stagePurple', icon: 'receipt-outline',
            title: 'Time to send the bill',
            body: `$${invoiceAmtExisting.toLocaleString()} invoice is ready. Mark Invoiced once sent.`,
            ctaLabel: 'Mark Invoiced', onCta: () => advance('invoiced'),
          }
        : {
            tone: 'stagePurple', icon: 'receipt-outline',
            title: 'Send the bill',
            body: 'Work is done. Create an invoice to close this out.',
            ctaLabel: 'Create & preview invoice', onCta: openFullInvoice,
          };
      break;
    case 'invoiced':
      nextStep = paid
        ? {
            tone: 'stageGreen', icon: 'checkmark-done-circle-outline',
            title: 'Paid in full',
            body: 'Nothing left to do. Job closed out.',
          }
        : {
            tone: 'stageAmber', icon: 'cash-outline',
            title: 'Waiting on payment',
            body: 'Invoice sent. Tap when the client pays.',
            ctaLabel: 'Mark Paid', onCta: () => markPaid(true),
          };
      break;
    case 'canceled':
      nextStep = {
        tone: 'danger', icon: 'close-circle-outline',
        title: 'Job canceled',
        body: 'No further work scheduled.',
      };
      break;
  }
  const invoiceAmountExisting = Number((job as any).invoice_amount) || 0;
  const isPaid = String((job as any).payment_status || '').toLowerCase() === 'paid';
  const photoUpdates = updates.filter(u => u.type === 'photo' && u.photo_url);
  const noteUpdates = updates.filter(u => u.type === 'note' && u.message);
  const hasAssignedFieldWorker = assignments.some(a => String(a.employees?.role || '').toLowerCase() === 'crew');
  const requiresApproval = !!(job as any).requires_owner_approval;
  const showApprovalCard =
    requiresApproval &&
    normalizeStatusKey(job.status) === 'complete' &&
    String(job.status).toLowerCase() === 'completed' &&
    isApprover &&
    hasAssignedFieldWorker;

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'crew',     label: 'Crew', count: assignments.length },
    { key: 'notes',    label: 'Notes', count: noteUpdates.length },
    { key: 'photos',   label: 'Photos', count: photoUpdates.length },
  ];

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header card */}
      <View style={[styles.headerCard, { paddingTop: insets.top + 8 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={{ paddingRight: 4 }}>
            <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { flex: 1, fontSize: 18 }]} numberOfLines={1}>{job.name}</Text>
        </View>
        <View style={{ flex: 1 }}>
          {job.address ? <Text style={styles.subtitle}>{job.address}</Text> : null}
          <View style={styles.clientHeaderRow}>
            <Text style={client?.name ? styles.clientLine : styles.clientMissing}>
              {client?.name || 'No client contact'}
            </Text>
            <TouchableOpacity onPress={openClientEditor} style={styles.clientEditChip} activeOpacity={0.75}>
              <Text style={styles.clientEditChipText}>{client?.id ? 'Edit contact' : 'Add contact'}</Text>
            </TouchableOpacity>
          </View>
          {clientPhone || clientEmail ? (
            <Text style={styles.clientContactLine}>
              {[clientPhone, clientEmail].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>

        <View style={styles.visitActionsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.visitActionsScroll}
          scrollEventThrottle={16}
          onContentSizeChange={(cw, _ch) => {
            // No way to read the ScrollView's width directly here; rely on the
            // first onScroll layout snapshot. As a fallback, mark overflow true
            // by default if there are enough chips to plausibly overflow.
          }}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            const hasOverflow = contentSize.width > layoutMeasurement.width + 1;
            setChipsHaveOverflow(hasOverflow);
            setChipsAtEnd(hasOverflow ? contentOffset.x + layoutMeasurement.width >= contentSize.width - 6 : true);
          }}
        >
          <View style={styles.visitActions}>
            <TouchableOpacity
              style={[styles.visitActionChip, !job.address && styles.visitActionDisabled]}
              disabled={!job.address}
              onPress={openDirections}
            >
              <Ionicons name="navigate-outline" size={15} color={job.address ? theme.accent : theme.textMuted} />
              <Text style={[styles.visitActionText, !job.address && styles.visitActionTextDisabled]}>Directions</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.visitActionChip, !clientPhone && styles.visitActionDisabled]}
              onPress={textClient}
            >
              <Ionicons name="chatbubble-outline" size={15} color={clientPhone ? theme.accent : theme.textMuted} />
              <Text style={[styles.visitActionText, !clientPhone && styles.visitActionTextDisabled]}>Text client</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.visitActionChip, !clientPhone && styles.visitActionDisabled]}
              onPress={callClient}
            >
              <Ionicons name="call-outline" size={15} color={clientPhone ? theme.accent : theme.textMuted} />
              <Text style={[styles.visitActionText, !clientPhone && styles.visitActionTextDisabled]}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.visitActionChip} onPress={openJobThread}>
              <Ionicons name="chatbubbles-outline" size={15} color={theme.accent} />
              <Text style={styles.visitActionText}>Open thread</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.visitActionChip} onPress={openWorkOrderSheet}>
              <Ionicons name="document-text-outline" size={15} color={theme.accent} />
              <Text style={styles.visitActionText}>Work order</Text>
            </TouchableOpacity>
            {statusKey === 'scheduled' ? (
              <TouchableOpacity style={styles.visitActionChip} onPress={() => handlePipePress('in_progress')}>
                <Ionicons name="play-circle-outline" size={15} color={theme.stageGreen} />
                <Text style={[styles.visitActionText, { color: theme.stageGreen }]}>Start</Text>
              </TouchableOpacity>
            ) : null}
            {statusKey === 'in_progress' ? (
              <TouchableOpacity style={styles.visitActionChip} onPress={() => advance('complete')}>
                <Ionicons name="checkmark-circle-outline" size={15} color={theme.stageGreen} />
                <Text style={[styles.visitActionText, { color: theme.stageGreen }]}>Complete</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </ScrollView>
        {chipsHaveOverflow && !chipsAtEnd ? (
          <View pointerEvents="none" style={styles.visitActionsFade}>
            <View style={[styles.visitActionsFadeSlice, { backgroundColor: theme.surface, opacity: 0.15 }]} />
            <View style={[styles.visitActionsFadeSlice, { backgroundColor: theme.surface, opacity: 0.4 }]} />
            <View style={[styles.visitActionsFadeSlice, { backgroundColor: theme.surface, opacity: 0.7 }]} />
            <View style={[styles.visitActionsFadeSlice, { backgroundColor: theme.surface, opacity: 1 }]} />
            <Ionicons name="chevron-forward" size={14} color={theme.textMuted} style={styles.visitActionsFadeChevron} />
          </View>
        ) : null}
        </View>

        {/* Tabs — segmented control */}
        <View style={styles.tabSegment}>
          {TABS.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabSegmentItem, tab === t.key && styles.tabSegmentItemActive]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.75}
            >
              <Text style={[styles.tabSegmentText, tab === t.key && styles.tabSegmentTextActive]}>
                {t.label}{typeof t.count === 'number' && t.count > 0 ? ` ${t.count}` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {showApprovalCard && (
        <View style={[styles.approvalBanner, { borderColor: theme.success + '55', backgroundColor: theme.success + '0c' }]}>
          <Text style={[styles.cardTitle, { color: theme.success, marginBottom: 4 }]}>Awaiting your approval</Text>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 10 }}>
            Field work is marked complete. Approve to close this job, or reject to bounce it back.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[styles.nextStepBtn, { backgroundColor: theme.success, flex: 1, marginTop: 0 }]}
              onPress={approveClose}
            >
              <Text style={styles.nextStepBtnText}>Approve & close</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.nextStepBtn, { backgroundColor: theme.danger + '22', flex: 1, marginTop: 0 }]}
              onPress={rejectClose}
            >
              <Text style={[styles.nextStepBtnText, { color: theme.danger }]}>Reject</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#0ea5e9" />}
      >
        {tab === 'overview' && (
          <>
            {nextStep && (() => {
              const tint = theme[nextStep.tone];
              return (
                <View style={[styles.nextStepCompact, { backgroundColor: tint + '0f', borderColor: tint + '55' }]}>
                  <View style={styles.compactHead}>
                    <Ionicons name={nextStep.icon} size={14} color={tint} />
                    <Text style={[styles.compactEyebrow, { color: tint }]}>LIFECYCLE</Text>
                    <Text style={styles.compactCurrent} numberOfLines={1}>· {nextStep.title}</Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.compactStripContent}
                  >
                    {PIPELINE_KEYS.map((k, i) => {
                      const p = STATUS_META.find(s => s.key === k)!;
                      const color = theme[p.tone];
                      const targetIdx = LIFECYCLE_ORDER.indexOf(k);
                      const active = statusKey === p.key;
                      const isPast = targetIdx !== -1 && currentIndex !== -1 && targetIdx < currentIndex;
                      const isLast = i === PIPELINE_KEYS.length - 1;
                      const dotBg = isPast ? theme.success : active ? color : 'transparent';
                      const dotBorder = isPast ? theme.success : active ? color : theme.border;
                      const labelColor = isPast ? theme.textMuted : active ? color : theme.textMuted;
                      return (
                        <View key={p.key} style={styles.compactStep}>
                          <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => handlePipePress(p.key)}
                            style={styles.compactStepTouch}
                          >
                            <View style={styles.compactStepRow}>
                              <View style={[
                                styles.compactDot,
                                { backgroundColor: dotBg, borderColor: dotBorder },
                                active && styles.timelineDotActive,
                              ]}>
                                {isPast ? <Ionicons name="checkmark" size={9} color="#fff" /> : null}
                              </View>
                              {!isLast && (
                                <View style={[
                                  styles.compactConnector,
                                  { backgroundColor: isPast ? theme.success + '55' : theme.border },
                                ]} />
                              )}
                            </View>
                            <Text
                              style={[
                                styles.compactLabel,
                                { color: labelColor },
                                active && { fontWeight: '800', color },
                              ]}
                              numberOfLines={1}
                            >
                              {p.label}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </ScrollView>
                  {/* Lifecycle CTA was duplicating actions from cards below
                      (Mark Paid lives on the Invoice card). Tap a step in
                      the strip directly when you want to advance/revert. */}
                </View>
              );
            })()}

            {/* Checklist — promoted out of Scope so it's a primary tool for crew/owner */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Checklist</Text>
                {Array.isArray((job as any).checklist_items) && (job as any).checklist_items.length > 0 ? (
                  <Text style={styles.checklistMeta}>
                    {((job as any).checklist_items as string[]).filter(isChecklistItemDone).length}
                    {' / '}
                    {(job as any).checklist_items.length}
                  </Text>
                ) : null}
              </View>
              {Array.isArray((job as any).checklist_items) && (job as any).checklist_items.length > 0 ? (
                <View style={{ marginTop: 4 }}>
                  {((job as any).checklist_items as string[]).map((line, i) => {
                    const done = isChecklistItemDone(line);
                    const text = checklistItemText(line);
                    const isEditing = editingChecklistIndex === i;
                    return (
                      <View key={`${i}-${line}`} style={styles.checklistRow}>
                        <TouchableOpacity
                          onPress={() => toggleChecklistItem(i)}
                          hitSlop={6}
                          style={[
                            styles.checklistBox,
                            { borderColor: done ? theme.success : theme.border },
                            done && { backgroundColor: theme.success },
                          ]}
                        >
                          {done ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                        </TouchableOpacity>
                        {isEditing ? (
                          <TextInput
                            style={[styles.checklistEditInput, { color: theme.textPrimary }]}
                            value={editingChecklistDraft}
                            onChangeText={setEditingChecklistDraft}
                            onSubmitEditing={() => commitChecklistEdit(i)}
                            onBlur={() => commitChecklistEdit(i)}
                            autoFocus
                            returnKeyType="done"
                          />
                        ) : (
                          <TouchableOpacity
                            style={{ flex: 1 }}
                            onPress={() => toggleChecklistItem(i)}
                            onLongPress={() => beginChecklistEdit(i, text)}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.checklistText,
                                { color: done ? theme.textMuted : theme.textPrimary },
                                done && { textDecorationLine: 'line-through' },
                              ]}
                            >
                              {text}
                            </Text>
                          </TouchableOpacity>
                        )}
                        {!isEditing ? (
                          <>
                            <TouchableOpacity
                              onPress={() => beginChecklistEdit(i, text)}
                              hitSlop={8}
                              style={styles.checklistIconBtn}
                            >
                              <Ionicons name="pencil-outline" size={15} color={theme.textMuted} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => removeChecklistItem(i)}
                              hitSlop={8}
                              style={styles.checklistIconBtn}
                            >
                              <Ionicons name="close" size={16} color={theme.textMuted} />
                            </TouchableOpacity>
                          </>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.checklistEmpty}>No items yet — add as you go.</Text>
              )}
              <View style={styles.checklistAddRow}>
                <TextInput
                  style={styles.checklistAddInput}
                  placeholder="Add a checklist item…"
                  placeholderTextColor={theme.textMuted}
                  value={quickChecklistDraft}
                  onChangeText={setQuickChecklistDraft}
                  onSubmitEditing={addQuickChecklistItem}
                  returnKeyType="done"
                  editable={!quickChecklistSaving}
                />
                <TouchableOpacity
                  onPress={addQuickChecklistItem}
                  disabled={!quickChecklistDraft.trim() || quickChecklistSaving}
                  style={[
                    styles.checklistAddBtn,
                    { backgroundColor: quickChecklistDraft.trim() ? theme.accent : theme.surfaceInset },
                  ]}
                >
                  {quickChecklistSaving
                    ? <ActivityIndicator size="small" color={theme.accentContrast} />
                    : <Ionicons name="add" size={20} color={quickChecklistDraft.trim() ? theme.accentContrast : theme.textMuted} />}
                </TouchableOpacity>
              </View>
            </View>

            {/* Approval gate toggle — only relevant when crew is doing the work */}
            {isApprover && hasAssignedFieldWorker && (
              <View style={[styles.card, { marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
                <Ionicons
                  name={requiresApproval ? 'shield-checkmark' : 'shield-outline'}
                  size={20}
                  color={requiresApproval ? theme.accent : theme.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.textPrimary, fontSize: 14, fontWeight: '700' }}>
                    Require my approval to close
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                    {requiresApproval
                      ? 'Crew must mark complete; you approve before close-out.'
                      : 'Crew completion closes the job automatically.'}
                  </Text>
                </View>
                <Switch
                  value={requiresApproval}
                  onValueChange={toggleRequiresApproval}
                  trackColor={{ false: theme.border, true: theme.accent + '88' }}
                  thumbColor={requiresApproval ? theme.accent : theme.surface}
                />
              </View>
            )}

            {/* Schedule + Estimate */}
            <View style={styles.rowTwo}>
              <TouchableOpacity
                style={styles.fieldCard}
                onPress={() => { setScheduledDate((job as any).scheduled_date || null); setPicker('schedule'); }}
              >
                <Ionicons name="calendar-outline" size={18} color={theme.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Appointment</Text>
                  <Text style={styles.fieldValue}>{prettyDate((job as any).scheduled_date)}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.fieldCard}
                onPress={() => { setEstimateAmt((job as any).estimate_amount ? String((job as any).estimate_amount) : ''); setPicker('estimate'); }}
              >
                <Ionicons name="pricetag-outline" size={18} color="#6366f1" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Estimate</Text>
                  <Text style={styles.fieldValue}>
                    {(job as any).estimate_amount ? `$${Number((job as any).estimate_amount).toLocaleString()}` : 'Not set'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Scope */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Scope of Work</Text>
                <TouchableOpacity
                  onPress={() => {
                    setDetailsDescription((job as any).description || '');
                    setDetailsChecklist(Array.isArray((job as any).checklist_items) ? [...(job as any).checklist_items] : []);
                    setPicker('details');
                  }}
                  style={styles.cardEdit}
                >
                  <Text style={styles.cardEditText}>
                    {(job as any).description || ((job as any).checklist_items?.length ?? 0) > 0 ? 'Edit' : 'Add'}
                  </Text>
                </TouchableOpacity>
              </View>
              {(job as any).description ? (
                <Text style={styles.scopeText}>{(job as any).description}</Text>
              ) : (
                <Text style={{ color: theme.textMuted, fontSize: 12, fontStyle: 'italic' }}>
                  No scope yet — tap Add to set instructions. Crew on site will be pinged when you save.
                </Text>
              )}
            </View>

            {/* Plans / schematics / work-order attachments */}
            <JobAttachments
              jobId={job.id}
              hasWorkflow={!!((job as any).workflow_id || (job as any).service_pro_workflow_id)}
            />

            {/* Crew-specific "Request completion" big button when in_progress */}
            {isCrew && (normalizeStatusKey(job.status) === 'in_progress') && (
              <TouchableOpacity
                style={[styles.nextStepBtn, { backgroundColor: theme.stageGreen, marginBottom: 12 }]}
                onPress={() => advance('complete')}
              >
                <Text style={styles.nextStepBtnText}>Request completion</Text>
              </TouchableOpacity>
            )}

            {/* Invoice */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Invoice</Text>
                {invoiceAmountExisting > 0 ? (
                  <View style={[styles.invoicePill, { backgroundColor: isPaid ? '#4ade8022' : '#facc1522' }]}>
                    <Text style={[styles.invoicePillText, { color: isPaid ? '#4ade80' : '#facc15' }]}>
                      {isPaid ? 'Paid' : 'Unpaid'}
                    </Text>
                  </View>
                ) : null}
              </View>
              {invoiceAmountExisting > 0 ? (
                <View>
                  <Text style={styles.invoiceAmount}>${invoiceAmountExisting.toLocaleString()}</Text>
                  {!isPaid && (
                    <>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => markPaid(true)}>
                          <Text style={styles.actionBtnText}>Mark Paid + Email</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#1a1a1a' }]} onPress={() => markPaid(false)}>
                          <Text style={[styles.actionBtnText, { color: '#0ea5e9' }]}>Mark Paid (no email)</Text>
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity
                        style={[styles.actionBtnGhost, { marginTop: 8 }]}
                        onPress={openFullInvoice}
                      >
                        <Ionicons name="create-outline" size={18} color={theme.accent} />
                        <Text style={styles.actionBtnGhostText}>Edit invoice</Text>
                      </TouchableOpacity>
                      {client?.email ? (
                        <TouchableOpacity
                          style={[styles.actionBtnGhost, { marginTop: 8 }]}
                          onPress={async () => {
                            try {
                              const resp: any = await mobilePost(`/api/mobile/owner/jobs/${job.id}/invoice/resend`);
                              Alert.alert('Sent', `Invoice re-emailed to ${resp?.emailed_to || client.email}`);
                            } catch (e: any) {
                              Alert.alert('Error', e?.message || 'Could not resend');
                            }
                          }}
                        >
                          <Ionicons name="mail-outline" size={18} color={theme.accent} />
                          <Text style={styles.actionBtnGhostText}>Resend to {client.email}</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={[styles.actionBtnGhost, { marginTop: 8, borderColor: theme.warning + '88' }]}
                          onPress={openClientEditor}
                        >
                          <Ionicons name="mail-outline" size={18} color={theme.warning} />
                          <Text style={[styles.actionBtnGhostText, { color: theme.warning }]}>
                            {client?.id ? 'Add client email' : 'Add client to email this invoice'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </View>
              ) : statusKey === 'complete' ? (
                // Lifecycle card already has the prominent "Create & preview
                // invoice" CTA when status is complete — don't duplicate it.
                null
              ) : (
                <TouchableOpacity style={styles.actionBtn} onPress={openFullInvoice}>
                  <Text style={styles.actionBtnText}>Create &amp; preview invoice</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        {tab === 'crew' && (
          <>
            <View style={styles.cardHeader}>
              <Text style={styles.sectionLabel}>Assigned ({assignments.length})</Text>
              <TouchableOpacity onPress={openAssignModal} style={styles.cardEdit}>
                <Text style={styles.cardEditText}>{assignments.length === 0 ? '+ Assign' : 'Edit'}</Text>
              </TouchableOpacity>
            </View>
            {assignments.length === 0 ? (
              <View style={styles.card}>
                <Text style={{ color: '#666' }}>No crew assigned yet.</Text>
              </View>
            ) : (
              assignments.map(a => {
                const latestScope = (job as any)?.scope_updated_at as string | null;
                const ack = scopeAcks.find(x => x.employee_id === a.employee_id);
                const hasUnreadScope =
                  !!latestScope && (!ack || ack.acked_scope_updated_at < latestScope);
                return (
                  <View key={a.id} style={[styles.card, { marginBottom: 8 }]}>
                    <View style={styles.cardRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.crewName}>{a.employees?.name || 'Unknown'}</Text>
                        {a.employees?.phone && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
                            <Text style={styles.crewPhone}>{a.employees.phone}</Text>
                            <TouchableOpacity onPress={() => textNumber(a.employees?.phone)} hitSlop={6}>
                              <Ionicons name="chatbubble-outline" size={14} color={theme.accent} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => callNumber(a.employees?.phone)} hitSlop={6}>
                              <Ionicons name="call-outline" size={14} color={theme.accent} />
                            </TouchableOpacity>
                          </View>
                        )}
                        {latestScope && (
                          <Text style={[
                            { fontSize: 11, marginTop: 6, fontWeight: '700' },
                            hasUnreadScope ? { color: '#f59e0b' } : { color: '#4ade80' },
                          ]}>
                            {hasUnreadScope
                              ? '⚠ Hasn\'t acknowledged latest instructions'
                              : `✓ Acknowledged ${ack?.acked_at ? new Date(ack.acked_at).toLocaleString() : ''}`}
                          </Text>
                        )}
                      </View>
                      <View style={[
                        styles.crewStatus,
                        { backgroundColor: a.checked_in_at && !a.checked_out_at ? '#052e16' : '#0c1a2e' },
                      ]}>
                        <Text style={{
                          color: a.checked_in_at && !a.checked_out_at ? '#4ade80' : '#3b82f6',
                          fontSize: 11, fontWeight: '700',
                        }}>
                          {a.checked_in_at && !a.checked_out_at ? 'On site' : a.checked_out_at ? 'Checked out' : 'Assigned'}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}

        {tab === 'notes' && (
          <>
            <View style={styles.cardHeader}>
              <Text style={styles.sectionLabel}>Notes ({noteUpdates.length})</Text>
              <TouchableOpacity onPress={() => setNoteModalOpen(true)} style={styles.cardEdit}>
                <Text style={styles.cardEditText}>+ Note</Text>
              </TouchableOpacity>
            </View>
            {noteUpdates.length === 0 ? (
              <View style={styles.card}>
                <Text style={{ color: '#666' }}>No notes yet.</Text>
              </View>
            ) : (
              noteUpdates.map(u => (
                <View key={u.id} style={[styles.card, { marginBottom: 8 }]}>
                  <Text style={styles.noteBody}>{u.message}</Text>
                  <Text style={styles.noteMeta}>
                    {u.employees?.name || 'Crew'} · {new Date(u.created_at).toLocaleString()}
                  </Text>
                </View>
              ))
            )}
          </>
        )}

        {tab === 'photos' && (
          <>
            <View style={styles.cardHeader}>
              <Text style={styles.sectionLabel}>Photos ({photoUpdates.length})</Text>
              <TouchableOpacity onPress={handleAddPhoto} style={styles.cardEdit} disabled={cameraBusy}>
                <Text style={styles.cardEditText}>{cameraBusy ? 'Uploading' : '+ Photo'}</Text>
              </TouchableOpacity>
            </View>
            {photoUpdates.length === 0 ? (
              <View style={styles.card}>
                <Text style={{ color: '#666' }}>No photos yet.</Text>
              </View>
            ) : (
              <View style={styles.photoGrid}>
                {photoUpdates.map(u => (
                  <TouchableOpacity key={u.id} style={styles.photoCell} onPress={() => setPhotoViewerUrl(u.photo_url)}>
                    <Image source={{ uri: u.photo_url! }} style={styles.photo} />
                    <Text style={styles.photoMeta}>
                      {u.employees?.name || 'Crew'} · {new Date(u.created_at).toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Calendar picker for schedule */}
      <CalendarPicker
        visible={picker === 'schedule'}
        value={scheduledDate}
        title="Schedule date"
        onClose={() => setPicker(null)}
        onSelect={async (v) => {
          setScheduledDate(v);
          await saveScheduledDate(v);
        }}
      />

      {/* Estimate modal */}
      <Modal
        visible={picker === 'estimate'}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (kbVisible.current) { Keyboard.dismiss(); return; }
          setPicker(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalSheet, { paddingBottom: 24 + insets.bottom }]}>
            <Text style={styles.modalTitle}>Set estimate</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 2500"
              placeholderTextColor="#555"
              value={estimateAmt}
              onChangeText={setEstimateAmt}
              keyboardType="decimal-pad"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { Keyboard.dismiss(); setPicker(null); }} disabled={saving}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={saveEstimate} disabled={saving}>
                {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.modalSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Details (scope) modal */}
      <Modal
        visible={picker === 'details'}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (kbVisible.current) { Keyboard.dismiss(); return; }
          setPicker(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalSheet, { paddingBottom: 24 + insets.bottom, maxHeight: '92%' }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Scope of Work</Text>
              <Text style={{ color: '#666', fontSize: 12, marginBottom: 12 }}>
                Save pings any crew currently assigned.
              </Text>
              <Text style={styles.modalFieldLabel}>Description</Text>
              <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                placeholder="Scope of work, special instructions…"
                placeholderTextColor="#555"
                value={detailsDescription}
                onChangeText={setDetailsDescription}
                multiline
              />
              <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 12, fontStyle: 'italic' }}>
                Manage the job's checklist directly on the Checklist card — add, edit, check off, or remove items there.
              </Text>

              <View style={[styles.modalActions, { marginTop: 18 }]}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => { Keyboard.dismiss(); setPicker(null); }} disabled={saving}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSave} onPress={saveDetails} disabled={saving}>
                  {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.modalSaveText}>Save &amp; Notify</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Client contact modal */}
      <Modal visible={clientModalOpen} transparent animationType="slide" onRequestClose={() => setClientModalOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalSheet, { paddingBottom: 24 + insets.bottom }]}>
            <Text style={styles.modalTitle}>{client?.id ? 'Edit client contact' : 'Add client contact'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Client name"
              placeholderTextColor="#555"
              value={clientNameDraft}
              onChangeText={setClientNameDraft}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone for text / call"
              placeholderTextColor="#555"
              value={clientPhoneDraft}
              onChangeText={setClientPhoneDraft}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
            />
            <TextInput
              style={styles.input}
              placeholder="Email for work orders / invoices"
              placeholderTextColor="#555"
              value={clientEmailDraft}
              onChangeText={setClientEmailDraft}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => { Keyboard.dismiss(); setClientModalOpen(false); }}
                disabled={clientSaving}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, clientSaving && { opacity: 0.5 }]}
                onPress={saveClientContact}
                disabled={clientSaving}
              >
                {clientSaving ? <ActivityIndicator color="#000" /> : <Text style={styles.modalSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add note modal */}
      <Modal visible={noteModalOpen} transparent animationType="fade" onRequestClose={() => setNoteModalOpen(false)}>
        <View style={styles.centerModalOverlay}>
          <View style={styles.noteModalCard}>
            <Text style={styles.modalTitle}>Add a note</Text>
            <TextInput
              style={[styles.input, styles.noteInput]}
              placeholder="What's happening on this job?"
              placeholderTextColor="#555"
              value={noteText}
              onChangeText={setNoteText}
              multiline
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => { setNoteText(''); setNoteModalOpen(false); }}
                disabled={noteSaving}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, (!noteText.trim() || noteSaving) && { opacity: 0.45 }]}
                onPress={submitNoteFromModal}
                disabled={noteSaving || !noteText.trim()}
              >
                {noteSaving ? <ActivityIndicator color={theme.accentContrast} /> : <Text style={styles.modalSaveText}>Save Note</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Full-screen photo viewer */}
      <Modal visible={!!photoViewerUrl} transparent animationType="fade" onRequestClose={() => setPhotoViewerUrl(null)}>
        <View style={styles.photoViewer}>
          <TouchableOpacity style={styles.photoViewerClose} onPress={() => setPhotoViewerUrl(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {photoViewerUrl && (
            <Image source={{ uri: photoViewerUrl }} style={styles.photoViewerImage} resizeMode="contain" />
          )}
        </View>
      </Modal>

      {/* Assign crew modal */}
      <Modal
        visible={picker === 'assign'}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (kbVisible.current) { Keyboard.dismiss(); return; }
          setPicker(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: 24 + insets.bottom, maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>Assign Crew</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {allCrew.map(emp => {
                const checked = selectedCrewIds.has(emp.id);
                return (
                  <TouchableOpacity
                    key={emp.id}
                    style={styles.crewCheckRow}
                    onPress={() => {
                      setSelectedCrewIds(prev => {
                        const next = new Set(prev);
                        checked ? next.delete(emp.id) : next.add(emp.id);
                        return next;
                      });
                    }}
                  >
                    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                      {checked && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>{emp.name}</Text>
                      <Text style={{ color: '#666', fontSize: 12 }}>{emp.role}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={[styles.modalActions, { marginTop: 12 }]}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setPicker(null)} disabled={assigning}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={saveAssignments} disabled={assigning}>
                {assigning ? <ActivityIndicator color="#000" /> : <Text style={styles.modalSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {cameraBusy && (
        <View style={styles.busyOverlay}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={styles.busyText}>Uploading photo...</Text>
        </View>
      )}
    </View>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },

    headerCard: {
      backgroundColor: t.surface,
      borderBottomWidth: 1, borderBottomColor: t.border,
      padding: 16, paddingBottom: 8,
    },
    approvalBanner: {
      backgroundColor: t.surface,
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      marginHorizontal: 16,
      marginTop: 12,
    },
    title: { color: t.textPrimary, fontSize: 20, fontWeight: '800' },
    subtitle: { color: t.textSecondary, fontSize: 13, marginTop: 2 },
    clientLine: { color: t.accent, fontSize: 13, marginTop: 4, fontWeight: '600' },
    clientMissing: { color: t.textMuted, fontSize: 13, marginTop: 4, fontWeight: '600' },
    clientHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    clientEditChip: {
      borderWidth: 1,
      borderColor: t.accent,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 4,
      marginTop: 4,
    },
    clientEditChipText: { color: t.accent, fontSize: 11, fontWeight: '900' },
    clientContactLine: { color: t.textMuted, fontSize: 12, marginTop: 3 },
    visitActionsWrap: { position: 'relative', marginTop: 14 },
    visitActionsScroll: {},
    visitActionsFade: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      flexDirection: 'row',
      alignItems: 'center',
    },
    visitActionsFadeSlice: { width: 7, alignSelf: 'stretch' },
    visitActionsFadeChevron: { paddingHorizontal: 4 },
    visitActions: { flexDirection: 'row', gap: 6 },
    visitActionChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      minHeight: 32,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.accent + '44',
      backgroundColor: t.accentSoft,
      paddingHorizontal: 10,
    },
    visitActionDisabled: {
      borderColor: t.border,
      backgroundColor: t.surfaceInset,
    },
    visitActionText: { color: t.accent, fontSize: 12, fontWeight: '900' },
    visitActionTextDisabled: { color: t.textMuted },
    nextStep: {
      marginTop: 14,
      borderWidth: 1, borderRadius: 14,
      padding: 14,
    },
    nextStepCompact: {
      borderWidth: 1, borderRadius: 12,
      paddingTop: 10, paddingBottom: 12, paddingHorizontal: 12,
      marginBottom: 12,
    },
    compactHead: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      marginBottom: 10,
    },
    compactEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
    compactCurrent: {
      flex: 1, color: t.textPrimary, fontSize: 13, fontWeight: '700',
    },
    compactStripContent: { gap: 0, paddingRight: 4 },
    compactStep: { minWidth: 96 },
    compactStepTouch: { paddingVertical: 4 },
    compactStepRow: { flexDirection: 'row', alignItems: 'center' },
    compactDot: {
      width: 16, height: 16, borderRadius: 8,
      borderWidth: 1.5,
      alignItems: 'center', justifyContent: 'center',
    },
    compactConnector: { flex: 1, height: 2, marginHorizontal: 2 },
    compactLabel: {
      fontSize: 11, fontWeight: '700',
      marginTop: 4, marginRight: 4,
    },
    compactCta: {
      marginTop: 12, borderRadius: 10,
      paddingVertical: 11, paddingHorizontal: 16,
      alignItems: 'center', justifyContent: 'center',
    },

    // Checklist card
    checklistMeta: { color: t.textSecondary, fontSize: 12, fontWeight: '700' },
    checklistRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border,
    },
    checklistBox: {
      width: 22, height: 22, borderRadius: 6,
      borderWidth: 1.5,
      alignItems: 'center', justifyContent: 'center',
    },
    checklistText: { fontSize: 14, lineHeight: 20 },
    checklistEditInput: {
      flex: 1, fontSize: 14, lineHeight: 20,
      paddingVertical: 0, paddingHorizontal: 0,
    },
    checklistIconBtn: {
      width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
    },
    checklistEmpty: {
      color: t.textMuted, fontSize: 13, fontStyle: 'italic',
      paddingVertical: 8,
    },
    checklistAddRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginTop: 10,
    },
    checklistAddInput: {
      flex: 1,
      backgroundColor: t.surfaceInset,
      borderRadius: 8,
      paddingHorizontal: 12, paddingVertical: 9,
      color: t.textPrimary, fontSize: 13,
    },
    checklistAddBtn: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center',
    },
    nextStepHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    nextStepLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
    nextStepTitle: { color: t.textPrimary, fontSize: 16, fontWeight: '800', marginTop: 2 },
    nextStepBody: { color: t.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 4 },
    nextStepBtn: {
      marginTop: 12, borderRadius: 10,
      paddingVertical: 12, paddingHorizontal: 16,
      alignItems: 'center', justifyContent: 'center',
    },
    nextStepBtnText: { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.2 },

    tabSegment: {
      flexDirection: 'row',
      marginTop: 12,
      padding: 3,
      borderRadius: 8,
      backgroundColor: t.surfaceInset,
      borderWidth: 1,
      borderColor: t.border,
    },
    tabSegmentItem: {
      flex: 1,
      minHeight: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 6,
    },
    tabSegmentItemActive: {
      backgroundColor: t.surfaceElevated,
      borderWidth: 1,
      borderColor: t.border,
    },
    tabSegmentText: { color: t.textSecondary, fontSize: 12.5, fontWeight: '800' },
    tabSegmentTextActive: { color: t.textPrimary },

    tabs: { flexDirection: 'row', gap: 6 },
    tab: {
      paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20,
      borderWidth: 1, borderColor: t.border, backgroundColor: t.surface,
    },
    tabActive: { backgroundColor: t.accentMuted, borderColor: t.accent },
    tabText: { color: t.textSecondary, fontSize: 13, fontWeight: '700' },
    tabTextActive: { color: t.accent },

    sectionLabel: { color: t.textPrimary, fontSize: 13, fontWeight: '800', marginBottom: 4, marginTop: 6 },
    sectionHint: { color: t.textMuted, fontSize: 11, marginBottom: 10, lineHeight: 15 },
    card: {
      backgroundColor: t.surface, borderRadius: 12, padding: 14,
      borderWidth: 1, borderColor: t.border, marginTop: 10,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    cardTitle: { color: t.textPrimary, fontSize: 14, fontWeight: '700' },
    cardEdit: { borderWidth: 1, borderColor: t.accent, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 12 },
    cardEditText: { color: t.accent, fontSize: 12, fontWeight: '700' },
    cardRow: { flexDirection: 'row', alignItems: 'center' },

    timeline: { marginBottom: 14, marginTop: 4 },
    timelineRow: { flexDirection: 'row', minHeight: 36 },
    timelineLeft: { width: 22, alignItems: 'center' },
    timelineDot: {
      width: 18, height: 18, borderRadius: 9,
      borderWidth: 2,
      alignItems: 'center', justifyContent: 'center',
      marginTop: 1,
    },
    timelineDotActive: {
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4,
      elevation: 2,
    },
    timelineDotInner: { width: 8, height: 8, borderRadius: 4 },
    timelineConnector: { width: 2, flex: 1, marginTop: 2, marginBottom: 2, marginLeft: 8 },
    timelineText: { flex: 1, paddingLeft: 10, paddingTop: 1, paddingBottom: 8 },
    timelineLabel: { fontSize: 13, fontWeight: '700' },
    timelineMeta: { fontSize: 10.5, fontWeight: '800', marginTop: 1, letterSpacing: 0.3, textTransform: 'uppercase' },

    pipeline: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
    pipeChip: {
      flexGrow: 1, flexBasis: '30%',
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      borderRadius: 20, paddingVertical: 9, paddingHorizontal: 10,
      borderWidth: 1, borderColor: t.border, backgroundColor: t.surface,
    },
    pipeChipText: { color: t.textSecondary, fontSize: 12, fontWeight: '700' },
    pipeChipPast: { backgroundColor: t.surface, borderColor: t.border, opacity: 0.7 },
    pipeChipTextPast: { color: t.textMuted, textDecorationLine: 'line-through' },
    pipeChipFuture: { backgroundColor: t.surface, borderStyle: 'dashed' },

    rowTwo: { flexDirection: 'row', gap: 8 },
    fieldCard: {
      flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: t.surface, borderRadius: 12, padding: 14,
      borderWidth: 1, borderColor: t.border,
    },
    fieldLabel: { color: t.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    fieldValue: { color: t.textPrimary, fontSize: 14, fontWeight: '700', marginTop: 2 },

    scopeText: { color: t.textSecondary, fontSize: 13, lineHeight: 19 },

    invoicePill: { borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 },
    invoicePillText: { fontSize: 11, fontWeight: '800' },
    invoiceAmount: { color: t.textPrimary, fontSize: 22, fontWeight: '800' },

    actionBtn: {
      backgroundColor: t.accent, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14,
      flex: 1, alignItems: 'center',
    },
    actionBtnText: { color: t.accentContrast, fontWeight: '700', fontSize: 13 },
    actionBtnGhost: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      borderWidth: 1, borderColor: t.accent, backgroundColor: t.accentSoft, borderRadius: 10,
      paddingVertical: 12, paddingHorizontal: 14,
    },
    actionBtnGhostText: { color: t.accent, fontSize: 13, fontWeight: '700' },

    crewName: { color: t.textPrimary, fontSize: 15, fontWeight: '700' },
    crewPhone: { color: t.accent, fontSize: 12, marginTop: 2 },
    crewStatus: { borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },

    noteBody: { color: t.textSecondary, fontSize: 14, lineHeight: 20 },
    noteMeta: { color: t.textMuted, fontSize: 11, marginTop: 6 },

    photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    photoCell: { width: '48%' },
    photo: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: t.surfaceInset },
    photoMeta: { color: t.textMuted, fontSize: 10, marginTop: 4 },
    photoViewer: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
    photoViewerImage: { width: '100%', height: '90%' },
    photoViewerClose: {
      position: 'absolute', top: 50, right: 20, zIndex: 10,
      backgroundColor: '#00000099', borderRadius: 20, padding: 8,
    },

    modalOverlay: { flex: 1, backgroundColor: t.overlay, justifyContent: 'flex-end' },
    centerModalOverlay: { flex: 1, backgroundColor: t.overlay, justifyContent: 'center', padding: 20 },
    modalSheet: { backgroundColor: t.surfaceElevated, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
    noteModalCard: {
      backgroundColor: t.surfaceElevated,
      borderRadius: 16,
      padding: 18,
      borderWidth: 1,
      borderColor: t.border,
    },
    modalTitle: { color: t.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: 16 },
    modalFieldLabel: { color: t.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 10, marginBottom: 6 },
    input: {
      backgroundColor: t.surfaceInset, borderWidth: 1, borderColor: t.border,
      borderRadius: 10, padding: 14, color: t.textPrimary, fontSize: 15, marginBottom: 12,
    },
    noteInput: { minHeight: 110, textAlignVertical: 'top' },
    modalActions: { flexDirection: 'row', gap: 10 },
    modalCancel: { flex: 1, borderWidth: 1, borderColor: t.border, borderRadius: 10, padding: 14, alignItems: 'center' },
    modalCancelText: { color: t.textSecondary, fontWeight: '700' },
    modalSave: { flex: 1, backgroundColor: t.accent, borderRadius: 10, padding: 14, alignItems: 'center' },
    modalSaveText: { color: t.accentContrast, fontWeight: '800' },
    crewCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.border },
    checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: t.borderStrong, alignItems: 'center', justifyContent: 'center' },
    checkboxChecked: { backgroundColor: t.accent, borderColor: t.accent },
    checkmark: { color: t.accentContrast, fontWeight: '800' },
    busyOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: t.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
    },
    busyText: { color: t.textPrimary, fontSize: 14, fontWeight: '600' },
  });
}
