import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Linking, Modal, TextInput, Share,
  KeyboardAvoidingView, Platform, Image, RefreshControl, Keyboard,
} from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileGet, mobilePatch, mobilePost } from '../../../lib/mobileApi';
import { Job, Employee } from '../../../lib/supabase';
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

type Assignment = {
  id: string;
  employee_id: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  employees: { id: string; name: string; phone?: string | null } | null;
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = makeStyles(theme);
  const kbVisible = useKeyboardVisible();

  const role = useRole();
  const isApprover = role === 'owner' || role === 'manager' || role === 'supervisor';
  const isCrew = role === 'crew';

  const [tab, setTab] = useState<Tab>('overview');
  const [job, setJob] = useState<Job | null>(null);
  const [client, setClient] = useState<any>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [scopeAcks, setScopeAcks] = useState<{ employee_id: string; acked_at: string; acked_scope_updated_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [picker, setPicker] = useState<null | 'schedule' | 'estimate' | 'details' | 'invoice' | 'assign'>(null);
  const [photoViewerUrl, setPhotoViewerUrl] = useState<string | null>(null);

  // Shared edit state
  const [scheduledDate, setScheduledDate] = useState<string | null>(null);
  const [estimateAmt, setEstimateAmt] = useState('');
  const [detailsDescription, setDetailsDescription] = useState('');
  const [detailsChecklist, setDetailsChecklist] = useState<string[]>([]);
  const [invoiceAmt, setInvoiceAmt] = useState('');
  const [saving, setSaving] = useState(false);

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
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not load job');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

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

  async function approveClose() {
    if (!job) return;
    try {
      await mobilePost(`/api/mobile/jobs/${job.id}/approve`, {});
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not approve');
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
      const cleaned = detailsChecklist.map(s => s.trim()).filter(Boolean);
      const updated = await mobilePatch<Job>(`/api/mobile/owner/jobs/${job.id}`, {
        description: detailsDescription.trim() || null,
        checklist_items: cleaned,
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

  function openDirections() {
    if (!job?.address) return Alert.alert('No address', 'This job has no address on file.');
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`);
  }

  function textClient() {
    if (!clientPhone) return Alert.alert('No client phone', 'Add a client phone when creating the job, or link this job to a client with a phone number.');
    textNumber(clientPhone);
  }

  function callClient() {
    if (!clientPhone) return Alert.alert('No client phone', 'Add a client phone when creating the job, or link this job to a client with a phone number.');
    callNumber(clientPhone);
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
    // Revert confirm: only when moving backward on the linear path.
    if (targetIdx !== -1 && currentIndex !== -1 && targetIdx < currentIndex) {
      const label = STATUS_META.find(s => s.key === target)!.label;
      Alert.alert(
        `Revert to ${label}?`,
        'This moves the job backward. Crew phones and the dashboard update instantly.',
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
            ctaLabel: 'Send Invoice', onCta: () => setPicker('invoice'),
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

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'crew',     label: 'Crew', count: assignments.length },
    { key: 'notes',    label: 'Notes', count: noteUpdates.length },
    { key: 'photos',   label: 'Photos', count: photoUpdates.length },
  ];

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: job.name, headerBackTitle: 'Back' }} />

      {/* Header card */}
      <View style={styles.headerCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{job.name}</Text>
          {job.address ? <Text style={styles.subtitle}>{job.address}</Text> : null}
          {client?.name ? <Text style={styles.clientLine}>{client.name}</Text> : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.visitActionsScroll}>
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
            <TouchableOpacity style={styles.visitActionChip} onPress={shareWorkOrder}>
              <Ionicons name="share-outline" size={15} color={theme.accent} />
              <Text style={styles.visitActionText}>Share</Text>
            </TouchableOpacity>
            {clientEmail ? (
              <TouchableOpacity style={styles.visitActionChip} onPress={emailWorkOrder}>
                <Ionicons name="mail-outline" size={15} color={theme.accent} />
                <Text style={styles.visitActionText}>Email</Text>
              </TouchableOpacity>
            ) : null}
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

        {/* Next step card (replaces the old hero status pill) */}
        {nextStep && (() => {
          const tint = theme[nextStep.tone];
          return (
            <View style={[styles.nextStep, { backgroundColor: tint + '14', borderColor: tint + '55' }]}>
              <View style={styles.nextStepHead}>
                <Ionicons name={nextStep.icon} size={16} color={tint} />
                <Text style={[styles.nextStepLabel, { color: tint }]}>NEXT STEP</Text>
              </View>
              <Text style={styles.nextStepTitle}>{nextStep.title}</Text>
              <Text style={styles.nextStepBody}>{nextStep.body}</Text>
              {nextStep.ctaLabel && nextStep.onCta && (
                <TouchableOpacity
                  style={[styles.nextStepBtn, { backgroundColor: tint }]}
                  onPress={nextStep.onCta}
                  activeOpacity={0.85}
                >
                  <Text style={styles.nextStepBtnText}>{nextStep.ctaLabel}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })()}

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }}>
          <View style={styles.tabs}>
            {TABS.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[styles.tab, tab === t.key && styles.tabActive]}
                onPress={() => setTab(t.key)}
              >
                <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
                  {t.label}{typeof t.count === 'number' ? ` (${t.count})` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#0ea5e9" />}
      >
        {tab === 'overview' && (
          <>
            {/* Pipeline */}
            <Text style={styles.sectionLabel}>Lifecycle</Text>
            <Text style={styles.sectionHint}>Past steps show a check. Going backward asks for confirmation.</Text>
            <View style={styles.pipeline}>
              {PIPELINE_KEYS.map(k => {
                const p = STATUS_META.find(s => s.key === k)!;
                const color = theme[p.tone];
                const targetIdx = LIFECYCLE_ORDER.indexOf(k);
                const active = statusKey === p.key;
                const isPast = targetIdx !== -1 && currentIndex !== -1 && targetIdx < currentIndex;
                const isFuture = targetIdx !== -1 && currentIndex !== -1 && targetIdx > currentIndex;
                return (
                  <TouchableOpacity
                    key={p.key}
                    style={[
                      styles.pipeChip,
                      active && { backgroundColor: color + '1f', borderColor: color },
                      isPast && styles.pipeChipPast,
                      isFuture && styles.pipeChipFuture,
                    ]}
                    onPress={() => handlePipePress(p.key)}
                  >
                    <Ionicons
                      name={isPast ? 'checkmark-circle' : p.icon}
                      size={14}
                      color={isPast ? theme.success : active ? color : theme.textMuted}
                    />
                    <Text
                      style={[
                        styles.pipeChipText,
                        active && { color },
                        isPast && styles.pipeChipTextPast,
                        isFuture && { color: theme.textMuted },
                      ]}
                      numberOfLines={1}
                    >
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

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
              ) : null}
              {Array.isArray((job as any).checklist_items) && (job as any).checklist_items.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  {(job as any).checklist_items.map((line: string, i: number) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 6, paddingVertical: 2 }}>
                      <Text style={{ color: '#0ea5e9', fontWeight: '700' }}>•</Text>
                      <Text style={{ color: '#ddd', fontSize: 13, flex: 1 }}>{line}</Text>
                    </View>
                  ))}
                </View>
              )}
              {!(job as any).description && !((job as any).checklist_items?.length) && (
                <Text style={{ color: '#666', fontSize: 12, fontStyle: 'italic' }}>
                  No scope yet — tap Add to set instructions. Crew on site will be pinged when you save.
                </Text>
              )}
            </View>

            {/* Plans / schematics / work-order attachments */}
            <JobAttachments
              jobId={job.id}
              hasWorkflow={!!((job as any).workflow_id || (job as any).service_pro_workflow_id)}
            />

            {/* Pending closure — approver actions */}
            {normalizeStatusKey(job.status) === 'complete' && String(job.status).toLowerCase() === 'completed' && isApprover && (
              <View style={[styles.card, { borderColor: theme.success + '55', backgroundColor: theme.success + '0c' }]}>
                <Text style={[styles.cardTitle, { color: theme.success, marginBottom: 4 }]}>Awaiting your approval</Text>
                <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 10 }}>
                  Crew has requested closure. Approve to move this job to Closed, or reject to bounce back.
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.nextStepBtn, { backgroundColor: theme.success, flex: 1 }]}
                    onPress={approveClose}
                  >
                    <Text style={styles.nextStepBtnText}>Approve & close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.nextStepBtn, { backgroundColor: theme.danger + '22', flex: 1 }]}
                    onPress={rejectClose}
                  >
                    <Text style={[styles.nextStepBtnText, { color: theme.danger }]}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

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
                      {client?.email && (
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
                          <Ionicons name="mail-outline" size={18} color="#0ea5e9" />
                          <Text style={styles.actionBtnGhostText}>Resend invoice email</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </View>
              ) : (
                <TouchableOpacity style={styles.actionBtn} onPress={() => setPicker('invoice')}>
                  <Text style={styles.actionBtnText}>Send Invoice</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Work-order actions */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <TouchableOpacity style={[styles.actionBtnGhost, { flex: 1 }]} onPress={shareWorkOrder}>
                <Ionicons name="share-outline" size={18} color="#0ea5e9" />
                <Text style={styles.actionBtnGhostText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtnGhost, { flex: 1 }]} onPress={emailWorkOrder}>
                <Ionicons name="mail-outline" size={18} color="#0ea5e9" />
                <Text style={styles.actionBtnGhostText}>Email Client</Text>
              </TouchableOpacity>
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
            {noteUpdates.length === 0 ? (
              <View style={styles.card}>
                <Text style={{ color: '#666' }}>No notes yet. Crew can add notes from their mobile app.</Text>
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
              <Text style={styles.modalFieldLabel}>Checklist</Text>
              {detailsChecklist.map((line, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder={`Item ${i + 1}`}
                    placeholderTextColor="#555"
                    value={line}
                    onChangeText={(text) => setDetailsChecklist(arr => arr.map((v, idx) => idx === i ? text : v))}
                  />
                  <TouchableOpacity
                    style={{ padding: 8 }}
                    onPress={() => setDetailsChecklist(arr => arr.filter((_, idx) => idx !== i))}
                  >
                    <Text style={{ color: '#ef4444', fontSize: 18 }}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={{ borderWidth: 1, borderColor: '#0ea5e9', borderRadius: 8, padding: 10, alignItems: 'center' }}
                onPress={() => setDetailsChecklist(arr => [...arr, ''])}
              >
                <Text style={{ color: '#0ea5e9', fontWeight: '700', fontSize: 13 }}>+ Add checklist item</Text>
              </TouchableOpacity>

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

      {/* Send invoice modal */}
      <Modal
        visible={picker === 'invoice'}
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
            <Text style={styles.modalTitle}>Send invoice</Text>
            <Text style={{ color: '#666', fontSize: 12, marginBottom: 12 }}>
              {client?.email ? `Will email ${client.email} automatically.` : 'No client email on file — invoice saves but nothing will be sent.'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Amount (e.g. 2500)"
              placeholderTextColor="#555"
              value={invoiceAmt}
              onChangeText={setInvoiceAmt}
              keyboardType="decimal-pad"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { Keyboard.dismiss(); setPicker(null); }} disabled={saving}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={sendInvoice} disabled={saving}>
                {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.modalSaveText}>Send</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
    title: { color: t.textPrimary, fontSize: 20, fontWeight: '800' },
    subtitle: { color: t.textSecondary, fontSize: 13, marginTop: 2 },
    clientLine: { color: t.accent, fontSize: 13, marginTop: 4, fontWeight: '600' },
    visitActionsScroll: { marginTop: 14 },
    visitActions: { flexDirection: 'row', gap: 8 },
    visitActionChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 36,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.accent + '44',
      backgroundColor: t.accentSoft,
      paddingHorizontal: 12,
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
    modalSheet: { backgroundColor: t.surfaceElevated, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
    modalTitle: { color: t.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: 16 },
    modalFieldLabel: { color: t.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 10, marginBottom: 6 },
    input: {
      backgroundColor: t.surfaceInset, borderWidth: 1, borderColor: t.border,
      borderRadius: 10, padding: 14, color: t.textPrimary, fontSize: 15, marginBottom: 12,
    },
    modalActions: { flexDirection: 'row', gap: 10 },
    modalCancel: { flex: 1, borderWidth: 1, borderColor: t.border, borderRadius: 10, padding: 14, alignItems: 'center' },
    modalCancelText: { color: t.textSecondary, fontWeight: '700' },
    modalSave: { flex: 1, backgroundColor: t.accent, borderRadius: 10, padding: 14, alignItems: 'center' },
    modalSaveText: { color: t.accentContrast, fontWeight: '800' },
    crewCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.border },
    checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: t.borderStrong, alignItems: 'center', justifyContent: 'center' },
    checkboxChecked: { backgroundColor: t.accent, borderColor: t.accent },
    checkmark: { color: t.accentContrast, fontWeight: '800' },
  });
}
