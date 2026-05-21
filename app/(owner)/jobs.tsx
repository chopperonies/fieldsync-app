import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, FlatList, TextInput,
  ActivityIndicator, RefreshControl, Alert, Modal, KeyboardAvoidingView, Platform, Keyboard, Linking, Switch, Pressable,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Job } from '../../lib/supabase';
import { mobileGet, mobilePost } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import { statusMeta } from '../../lib/jobStatus';
import { useRole, canManageCrew } from '../../lib/useRole';
import { useKeyboardVisible } from '../../lib/useKeyboardVisible';
import CalendarPicker, { toDateString, fromDateString, prettyDate } from '../../components/CalendarPicker';
import LineItemsPicker, { LineItem, lineItemsSummary, lineItemsTotal } from '../../components/LineItemsPicker';
import TimePickerSheet from '../../components/TimePickerSheet';

type CrewMember = { employee_id: string; name: string };
type EmployeeLite = { id: string; name: string; role?: string | null; status?: string | null };
type ScheduleJob = {
  id: string;
  name: string;
  address: string | null;
  status: string;
  scheduled_date: string | null;
  scheduled_time?: string | null;
  payment_status?: string | null;
  invoice_amount?: number | null;
  expected_duration_hours?: number | null;
  client_id?: string | null;
  client_name?: string | null;
  crew: CrewMember[];
};

type ViewMode = 'list' | 'grid' | 'map';
type RepeatOption = 'none' | 'weekly' | 'biweekly' | 'monthly' | 'as_needed';

const DAY_LETTERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Calendar grid dimensions
const HOUR_START = 6;
const HOUR_END = 21;
const HOUR_HEIGHT = 72;
const COL_WIDTH = 154;
const GUTTER_WIDTH = 56;
const REPEAT_OPTIONS: Array<{ key: RepeatOption; label: string }> = [
  { key: 'none', label: 'Does not repeat' },
  { key: 'weekly', label: 'Every week' },
  { key: 'biweekly', label: 'Every 2 weeks' },
  { key: 'monthly', label: 'Every month' },
  { key: 'as_needed', label: 'As needed' },
];

function weekStripDays(anchor: Date): Date[] {
  const sunday = new Date(anchor);
  sunday.setDate(anchor.getDate() - anchor.getDay());
  sunday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday); d.setDate(sunday.getDate() + i); return d;
  });
}

function friendlyDayLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatVisitTime(value?: string | null): string {
  if (!value) return 'Anytime';
  const [hhRaw, mmRaw = '00'] = String(value).split(':');
  const hh = Number(hhRaw);
  if (!Number.isFinite(hh)) return 'Anytime';
  const suffix = hh >= 12 ? 'PM' : 'AM';
  const hour = hh % 12 || 12;
  return `${hour}:${mmRaw.padStart(2, '0').slice(0, 2)} ${suffix}`;
}

function timeToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const [hhRaw, mmRaw = '00'] = String(value).split(':');
  const hh = Number(hhRaw);
  const mm = Number(mmRaw);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function minutesToTime(total: number): string {
  const normalized = Math.max(0, Math.min(23 * 60 + 59, total));
  const hh = Math.floor(normalized / 60);
  const mm = normalized % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
}

function defaultEndTime(start?: string | null): string | null {
  const mins = timeToMinutes(start);
  if (mins == null) return null;
  return minutesToTime(mins + 120);
}

function durationHours(start?: string | null, end?: string | null): number | null {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s == null || e == null || e <= s) return null;
  return Math.round(((e - s) / 60) * 100) / 100;
}

function compactTimeRange(start?: string | null, end?: string | null): string {
  if (!start) return 'Anytime';
  return end ? `${formatVisitTime(start)} - ${formatVisitTime(end)}` : formatVisitTime(start);
}

function colorForJob(theme: Theme, job: ScheduleJob): { bg: string; border: string; text: string } {
  const paid = String(job.payment_status || '').toLowerCase() === 'paid';
  if (paid) return { bg: theme.success + '1a', border: theme.success, text: theme.success };
  const tone = theme[statusMeta(job.status).tone];
  return { bg: tone + '1a', border: tone, text: tone };
}

function dayTint(theme: Theme, dayIndex: number): string {
  const palette = [theme.stagePurple, theme.stageBlue, theme.stageCyan, theme.stageGreen, theme.stageAmber, theme.stageIndigo, theme.danger];
  return palette[dayIndex % palette.length];
}

function crewColor(theme: Theme, name: string): string {
  const palette = [theme.stageBlue, theme.stageCyan, theme.stageGreen, theme.stageIndigo, theme.stagePurple, theme.stageAmber];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

function statusStamp(theme: Theme, job: ScheduleJob): { label: string; color: string } | null {
  const paid = String(job.payment_status || '').toLowerCase() === 'paid';
  if (paid) return { label: 'PAID', color: theme.success };
  const s = String(job.status || '').toLowerCase();
  if (s === 'invoiced') return { label: 'INVOICED', color: theme.stagePurple };
  if (s === 'complete' || s === 'completed') return { label: 'DONE', color: theme.stageGreen };
  if (s === 'quote' || s === 'quoted') return { label: 'ESTIMATE', color: theme.stageIndigo };
  if (s === 'canceled' || s === 'cancelled') return { label: 'CANCELED', color: theme.danger };
  return null;
}

export default function OwnerJobs() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const insets = useSafeAreaInsets();
  const role = useRole();
  const canPingCrew = canManageCrew(role) || role === 'manager';
  const kbVisible = useKeyboardVisible();

  const [anchor, setAnchor] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [selectedDay, setSelectedDay] = useState<string>(toDateString(new Date()));
  const [view, setView] = useState<ViewMode>('grid');
  const [jobs, setJobs] = useState<ScheduleJob[]>([]);
  const [crewMembers, setCrewMembers] = useState<EmployeeLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<null | 'new' | 'weekjump'>(null);

  // Add-job modal (triggered by ?open=new / ?open=new_estimate via OwnerFab)
  const [showAdd, setShowAdd] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [choiceOpen, setChoiceOpen] = useState<null | 'job' | 'estimate'>(null);
  const [workflows, setWorkflows] = useState<Array<{ id: string; name: string; description?: string | null; industry?: string | null; stages?: string[] }>>([]);
  const [newName, setNewName] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newAddressLine2, setNewAddressLine2] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newEstimate, setNewEstimate] = useState('');
  const [newLineItems, setNewLineItems] = useState<LineItem[]>([]);
  const [newScheduledDate, setNewScheduledDate] = useState<string | null>(null);
  const [newScheduledTime, setNewScheduledTime] = useState<string | null>(null);
  const [newScheduledEndTime, setNewScheduledEndTime] = useState<string | null>(null);
  const [newScheduleLater, setNewScheduleLater] = useState(false);
  const [newRepeat, setNewRepeat] = useState<RepeatOption>('none');
  const [newInvoiceReminder, setNewInvoiceReminder] = useState(true);
  const [selectedCrewIds, setSelectedCrewIds] = useState<Set<string>>(new Set());
  const [pendingCreateTime, setPendingCreateTime] = useState<string | null>(null);
  const [pendingCreateCrewId, setPendingCreateCrewId] = useState<string | null>(null);
  const [newWorkflowId, setNewWorkflowId] = useState<string | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('scheduled');
  const [newTypeLabel, setNewTypeLabel] = useState<string>('New job');
  const [saving, setSaving] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState<null | 'start' | 'end'>(null);

  const week = useMemo(() => weekStripDays(anchor), [anchor]);
  const rangeStart = week[0];
  const rangeEnd = useMemo(() => {
    if (view === 'grid') {
      const end = new Date(week[0]);
      end.setDate(week[0].getDate() + 27); // 4 weeks
      return end;
    }
    return week[6];
  }, [week, view]);

  const load = useCallback(async () => {
    try {
      const data = await mobileGet<ScheduleJob[]>(
        `/api/mobile/crew/schedule?start=${toDateString(rangeStart)}&end=${toDateString(rangeEnd)}`
      );
      setJobs(data || []);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [rangeStart, rangeEnd]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    mobileGet<Array<{ id: string; name: string; description?: string | null; industry?: string | null; stages?: string[] }>>('/api/mobile/owner/workflows')
      .then(ws => setWorkflows(ws || []))
      .catch(() => setWorkflows([]));
    mobileGet<EmployeeLite[]>('/api/mobile/owner/crew')
      .then(rows => {
        const active = (rows || []).filter(e => String(e.status || 'active').toLowerCase() !== 'suspended');
        setCrewMembers(active);
      })
      .catch(() => setCrewMembers([]));
  }, []);

  const params = useLocalSearchParams<{ open?: string; day?: string }>();
  // When a "Create X" pill from Search routes here, track it so cancel
  // sends the user back to Search instead of stranding them on Schedule.
  const [openedViaDeepLink, setOpenedViaDeepLink] = useState(false);
  useEffect(() => {
    if (params.open === 'new_estimate' || params.open === 'new_quote') {
      // FAB / Search deep link → drop the user straight on the real-estimate
      // form. The "send yourself a test estimate" branch stays reachable
      // inside the create form's options menu.
      setOpenedViaDeepLink(true);
      startCreate('New estimate', 'quoted', null, '');
      setTimeout(() => router.setParams({ open: undefined } as any), 100);
    } else if (params.open === 'new_request') {
      // Backwards-compatible old deep link. New request creation lives at
      // /(owner)/requests?open=new.
      setNewStatus('quoted');
      setNewTypeLabel('New request');
      setShowAdd(true);
      setOpenedViaDeepLink(true);
      setTimeout(() => router.setParams({ open: undefined } as any), 100);
    } else if (params.open === 'new' || params.open === 'new_job') {
      // FAB Job tile → go straight to the blank job form. The Build-for-me
      // variant is still reachable via the contextual TypePicker on Schedule.
      setOpenedViaDeepLink(true);
      startCreate('New job', 'scheduled', null, '');
      setTimeout(() => router.setParams({ open: undefined } as any), 100);
    } else if (params.open === 'new_install') {
      setOpenedViaDeepLink(true);
      startCreate('New install', 'scheduled', null, '');
      setTimeout(() => router.setParams({ open: undefined } as any), 100);
    } else if (params.open === 'new_repair') {
      setOpenedViaDeepLink(true);
      startCreate('New repair', 'scheduled', null, '');
      setTimeout(() => router.setParams({ open: undefined } as any), 100);
    }
  }, [params.open]);
  useEffect(() => {
    if (params.day && /^\d{4}-\d{2}-\d{2}$/.test(params.day)) {
      setSelectedDay(params.day);
      const parsed = fromDateString(params.day);
      if (parsed) setAnchor(parsed);
    }
  }, [params.day]);

  async function addJob() {
    if (!newName.trim() || !newAddress.trim()) return Alert.alert('Fill in name and address');
    const catalogTotal = lineItemsTotal(newLineItems);
    const finalEstimate = catalogTotal > 0 ? catalogTotal : (newEstimate ? parseFloat(newEstimate) : null);
    const computedDuration = durationHours(newScheduledTime, newScheduledEndTime);
    const finalDescription = [
      newDesc.trim() || null,
      newLineItems.length ? `Line items:\n${lineItemsSummary(newLineItems)}` : null,
      computedDuration ? `Scheduled window: ${compactTimeRange(newScheduledTime, newScheduledEndTime)}` : null,
      newRepeat !== 'none' ? `Repeat preference: ${REPEAT_OPTIONS.find(o => o.key === newRepeat)?.label}` : null,
      newInvoiceReminder ? 'Reminder: invoice when the job is closed.' : null,
    ].filter(Boolean).join('\n\n') || null;
    setSaving(true);
    try {
      const combinedAddress = [newAddress.trim(), newAddressLine2.trim()].filter(Boolean).join('\n');
      const data = await mobilePost<Job>('/api/mobile/owner/jobs', {
        name: newName.trim(), address: combinedAddress,
        description: finalDescription,
        estimate_amount: finalEstimate,
        scheduled_date: newScheduleLater ? null : newScheduledDate,
        scheduled_time: newScheduleLater ? null : newScheduledTime,
        expected_duration_hours: computedDuration,
        client_name: newClientName.trim() || null,
        client_phone: newClientPhone.trim() || null,
        workflow_id: newWorkflowId,
        status: newStatus,
      });
      const ids = Array.from(selectedCrewIds);
      if (ids.length && (data as any)?.id) {
        await mobilePost(`/api/mobile/owner/jobs/${(data as any).id}/assignments`, { employee_ids: ids });
      }
      if (data && (data as any).scheduled_date) {
        setSelectedDay((data as any).scheduled_date);
        const parsed = fromDateString((data as any).scheduled_date);
        if (parsed) setAnchor(parsed);
      }
      setNewName(''); setNewClientName(''); setNewClientPhone(''); setNewAddress(''); setNewAddressLine2(''); setNewDesc(''); setNewEstimate('');
      setNewLineItems([]);
      setNewScheduledDate(null); setNewScheduledTime(null); setNewScheduledEndTime(null); setNewWorkflowId(null); setNewStatus('scheduled');
      setNewScheduleLater(false); setNewRepeat('none'); setNewInvoiceReminder(true); setSelectedCrewIds(new Set());
      setNewTypeLabel('New job');
      setShowAdd(false);
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not create job.');
    } finally {
      setSaving(false);
    }
  }

  // Called by the type picker. Presets the form state, then opens the
  // add-job modal with the chosen type already configured.
  // Every tap resets the name + other fields so a previous default
  // doesn't bleed into a new Install/Estimate.
  function startCreate(typeLabel: string, status: string, workflowId: string | null, defaultName: string, defaultDesc = '') {
    setNewTypeLabel(typeLabel);
    setNewStatus(status);
    setNewWorkflowId(workflowId);
    setNewName(defaultName);
    setNewClientName('');
    setNewClientPhone('');
    setNewAddress('');
    setNewAddressLine2('');
    setNewDesc(defaultDesc);
    setNewEstimate('');
    setNewLineItems([]);
    setNewScheduledDate(selectedDay);
    setNewScheduledTime(pendingCreateTime);
    setNewScheduledEndTime(defaultEndTime(pendingCreateTime));
    setNewScheduleLater(false);
    setNewRepeat('none');
    setNewInvoiceReminder(true);
    setSelectedCrewIds(pendingCreateCrewId ? new Set([pendingCreateCrewId]) : new Set());
    setShowTypePicker(false);
    setChoiceOpen(null);
    setShowAdd(true);
    setPendingCreateTime(null);
    setPendingCreateCrewId(null);
  }

  function closeAddModal() {
    Keyboard.dismiss();
    setShowAdd(false);
    // Reset so next open starts clean.
    setNewName(''); setNewClientName(''); setNewClientPhone(''); setNewAddress(''); setNewDesc(''); setNewEstimate('');
    setNewLineItems([]);
    setNewScheduledDate(null); setNewScheduledTime(null); setNewScheduledEndTime(null); setNewWorkflowId(null); setNewStatus('scheduled');
    setNewScheduleLater(false); setNewRepeat('none'); setNewInvoiceReminder(true); setSelectedCrewIds(new Set());
    setNewTypeLabel('New job');
    if (openedViaDeepLink && router.canGoBack()) {
      setOpenedViaDeepLink(false);
      setTimeout(() => router.back(), 50);
    }
  }

  function openTypePicker(slotTime?: string | null, crewId?: string | null) {
    setNewScheduledDate(selectedDay);
    setPendingCreateTime(typeof slotTime === 'string' ? slotTime : null);
    setPendingCreateCrewId(typeof crewId === 'string' ? crewId : null);
    setShowTypePicker(true);
  }

  function toggleCrewSelection(id: string) {
    setSelectedCrewIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function pingCrew() {
    const todayStr = toDateString(new Date());
    const tomorrowStr = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return toDateString(d); })();
    const mode: 'today' | 'tomorrow' | null =
      selectedDay === todayStr ? 'today' :
      selectedDay === tomorrowStr ? 'tomorrow' : null;
    if (!mode) return;
    try {
      const resp = await mobilePost<{ sent: number; jobsFound: number; assigned: number; noToken: number; noTokenNames: string[] }>(
        '/api/mobile/owner/crew-reminder-test', { mode },
      );
      if (resp?.sent && resp.sent > 0) {
        Alert.alert('Reminder sent', `Pushed to ${resp.sent} crew member${resp.sent === 1 ? '' : 's'}.`);
      } else if (!resp?.jobsFound) {
        Alert.alert('Nothing to ping', `No jobs scheduled for ${mode}.`);
      } else if (!resp?.assigned) {
        Alert.alert('No crew assigned', `${resp.jobsFound} job${resp.jobsFound === 1 ? '' : 's'} scheduled for ${mode}, but none have crew assigned.`);
      } else {
        Alert.alert('Crew not reachable', `None of the assigned crew have a push token yet.`);
      }
    } catch (e: any) {
      Alert.alert('Failed', e?.message || 'Could not send reminders.');
    }
  }

  const jobsByDay: Record<string, ScheduleJob[]> = {};
  for (const j of jobs) {
    const k = j.scheduled_date || '';
    if (!k) continue;
    (jobsByDay[k] = jobsByDay[k] || []).push(j);
  }
  const jobsForSelected = [...(jobsByDay[selectedDay] || [])].sort((a, b) =>
    String(a.scheduled_time || '99:99').localeCompare(String(b.scheduled_time || '99:99'))
  );
  const assignedCount = jobsForSelected.filter(j => j.crew?.length > 0).length;
  const unassignedCount = Math.max(0, jobsForSelected.length - assignedCount);
  const scheduledRevenue = jobsForSelected.reduce((sum, j) => sum + (Number(j.invoice_amount) || 0), 0);
  const canSubmitNewJob = Boolean(newName.trim() && newAddress.trim()) && !saving;
  const missingNewJobFields = [
    !newName.trim() ? (newStatus === 'quoted' ? 'estimate title' : 'job title') : null,
    !newAddress.trim() ? 'address' : null,
  ].filter(Boolean).join(' and ');

  function updateNewLineItems(nextItems: LineItem[]) {
    setNewLineItems(nextItems);
    if (!newName.trim() && nextItems.length > 0) {
      setNewName(nextItems[0].name);
    }
  }

  if (loading && jobs.length === 0) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.accent} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={[styles.scheduleTopBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => setPickerOpen('weekjump')} style={styles.monthBtn} activeOpacity={0.7}>
          <Text style={styles.monthTitle}>{anchor.toLocaleDateString(undefined, { month: 'long' })}</Text>
          <Ionicons name="chevron-down" size={17} color={theme.textSecondary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {canPingCrew && (selectedDay === toDateString(new Date()) || selectedDay === toDateString((() => { const d = new Date(); d.setDate(d.getDate() + 1); return d; })())) ? (
          <TouchableOpacity onPress={pingCrew} style={styles.iconToolBtn} activeOpacity={0.7}>
            <Ionicons name="notifications-outline" size={14} color={theme.accent} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={() => openTypePicker()} style={styles.iconToolBtn} activeOpacity={0.7}>
          <Ionicons name="calendar-outline" size={16} color={theme.accent} />
        </TouchableOpacity>
      </View>

      <View style={styles.viewSegment}>
        {([
          { key: 'grid', label: 'Grid' },
          { key: 'list', label: 'List' },
          { key: 'map', label: 'Route' },
        ] as Array<{ key: ViewMode; label: string }>).map(item => (
          <TouchableOpacity
            key={item.key}
            style={[styles.segmentItem, view === item.key && styles.segmentItemActive]}
            onPress={() => setView(item.key)}
            activeOpacity={0.75}
          >
            <Text style={[styles.segmentText, view === item.key && styles.segmentTextActive]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Week strip + day stats — only Map view uses them. List view shows a multi-day
          agenda; Grid view has its own date navigation. */}
      {view === 'map' && <>
      <View style={styles.weekNav}>
        <TouchableOpacity
          onPress={() => { const d = new Date(anchor); d.setDate(d.getDate() - 7); setAnchor(d); }}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setPickerOpen('weekjump')}>
          <Text style={styles.weekLabel}>
            {rangeStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {rangeEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { const d = new Date(anchor); d.setDate(d.getDate() + 7); setAnchor(d); }}
          hitSlop={12}
        >
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>
      <View style={styles.weekStrip}>
        {week.map((d, i) => {
          const key = toDateString(d);
          const selected = key === selectedDay;
          const today = toDateString(new Date()) === key;
          const count = jobsByDay[key]?.length || 0;
          const labelColor = selected ? theme.textPrimary : (today ? theme.accent : theme.textMuted);
          const numberColor = selected ? theme.textPrimary : (today ? theme.accent : theme.textSecondary);
          const dotColor = selected ? theme.accent : (today ? theme.accent : theme.textMuted);
          return (
            <TouchableOpacity
              key={i}
              style={[
                styles.dayCell,
                selected && { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
              ]}
              onPress={() => setSelectedDay(key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.dayLetter, { color: labelColor }]}>
                {DAY_LETTERS[i]}
              </Text>
              <Text style={[styles.dayNumber, { color: numberColor }]}>
                {d.getDate()}
              </Text>
              <View style={styles.dayDotRow}>
                {count > 0 ? <View style={[styles.dayDot, { backgroundColor: dotColor }]} /> : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.selectedHeader}>
        <Text style={styles.selectedLabel}>{friendlyDayLabel(selectedDay)}</Text>
        <TouchableOpacity
          onPress={() => openTypePicker()}
          style={styles.newJobBtn}
          activeOpacity={0.7}
          hitSlop={6}
        >
          <Ionicons name="add-circle" size={18} color={theme.accent} />
          <Text style={styles.newJobBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.daySummary}>
        <SummaryTile theme={theme} label="Visits" value={String(jobsForSelected.length)} />
        <SummaryTile
          theme={theme}
          label="Unassigned"
          value={String(unassignedCount)}
          valueColor={unassignedCount ? theme.warning : theme.success}
        />
        <SummaryTile theme={theme} label="Scheduled" value={`$${scheduledRevenue.toLocaleString()}`} />
      </View>
      </>}

      {view === 'list' ? (
        <ListView
          theme={theme}
          jobs={jobs}
          week={week}
          jobsByDay={jobsByDay}
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }}
          onAddJob={openTypePicker}
          onOpenJob={(jobId) => router.push({ pathname: '/(owner)/job/[id]', params: { id: jobId } } as any)}
          onPrevWeek={() => { const d = new Date(anchor); d.setDate(d.getDate() - 7); setAnchor(d); }}
          onNextWeek={() => { const d = new Date(anchor); d.setDate(d.getDate() + 7); setAnchor(d); }}
        />
      ) : view === 'grid' ? (
        <GridScheduleView
          theme={theme}
          anchor={anchor}
          jobsByDay={jobsByDay}
          selectedDay={selectedDay}
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }}
          onSelectDay={(day) => {
            setSelectedDay(day);
            const parsed = fromDateString(day);
            if (parsed) setAnchor(parsed);
          }}
          onOpenJob={(jobId) => router.push({ pathname: '/(owner)/job/[id]', params: { id: jobId } } as any)}
        />
      ) : view === 'map' ? (
        <MapScheduleView
          theme={theme}
          jobs={jobsForSelected}
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }}
          onAddJob={openTypePicker}
        />
      ) : (
        <CalendarView
          theme={theme}
          jobs={jobsForSelected}
          crewMembers={crewMembers}
          selectedDay={selectedDay}
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }}
          allJobsWeek={jobs.length > 0}
          onCreateAtSlot={openTypePicker}
        />
      )}

      {/* Type picker - Job / Estimate / Install / Repair + Service PRO workflows */}
      <Modal
        visible={showTypePicker}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowTypePicker(false);
          if (openedViaDeepLink && router.canGoBack()) {
            setOpenedViaDeepLink(false);
            setTimeout(() => router.back(), 50);
          }
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setShowTypePicker(false);
            if (openedViaDeepLink && router.canGoBack()) {
              setOpenedViaDeepLink(false);
              setTimeout(() => router.back(), 50);
            }
          }}
        >
          <Pressable onPress={() => {}} style={[styles.modal, { paddingBottom: Math.max(36, insets.bottom + 24), maxHeight: '85%' }]}>
            <View style={styles.typeHeader}>
              <Text style={styles.modalTitle}>What are you adding?</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowTypePicker(false);
                  if (openedViaDeepLink && router.canGoBack()) {
                    setOpenedViaDeepLink(false);
                    setTimeout(() => router.back(), 50);
                  }
                }}
                hitSlop={8}
              >
                <Ionicons name="close" size={22} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.typeHint}>Tap a type to prep the form — you can tweak everything before saving.</Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.typeGrid}>
                <TypeTile
                  theme={theme}
                  icon="hammer-outline"
                  color={theme.stageGreen}
                  label="Job"
                  hint="Scheduled work"
                  onPress={() => {
                    setShowTypePicker(false);
                    setChoiceOpen('job');
                  }}
                />
                <TypeTile
                  theme={theme}
                  icon="document-text-outline"
                  color={theme.stageCyan}
                  label="Estimate"
                  hint="Pricing proposal"
                  onPress={() => {
                    setShowTypePicker(false);
                    setChoiceOpen('estimate');
                  }}
                />
                <TypeTile
                  theme={theme}
                  icon="build-outline"
                  color={theme.stageCyan}
                  label="Install"
                  hint="New install job"
                  onPress={() => startCreate('New install', 'scheduled', null, '')}
                />
                <TypeTile
                  theme={theme}
                  icon="construct-outline"
                  color={theme.stageAmber}
                  label="Repair"
                  hint="Service call / fix"
                  onPress={() => startCreate('New repair', 'scheduled', null, '')}
                />
              </View>

              {workflows.length > 0 ? (
                <>
                  <Text style={styles.templatesLabel}>From your Service PRO templates</Text>
                  {workflows.map(wf => (
                    <TouchableOpacity
                      key={wf.id}
                      style={[styles.templateRow, { borderColor: theme.border }]}
                      onPress={() => startCreate(wf.name, 'scheduled', wf.id, wf.name)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.templateIcon, { backgroundColor: theme.accentMuted }]}>
                        <Ionicons name="git-branch-outline" size={18} color={theme.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.templateName}>{wf.name}</Text>
                        {wf.stages && wf.stages.length > 0 ? (
                          <Text style={styles.templateDesc} numberOfLines={2}>
                            {wf.stages.length} stages · {wf.stages.join(' → ')}
                          </Text>
                        ) : wf.description ? (
                          <Text style={styles.templateDesc} numberOfLines={1}>{wf.description}</Text>
                        ) : null}
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                    </TouchableOpacity>
                  ))}
                </>
              ) : (
                <View style={styles.templatesEmpty}>
                  <Text style={styles.templatesEmptyText}>
                    Service PRO templates you enable on the web dashboard will show up here.
                  </Text>
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <CreateChoiceModal
        visible={choiceOpen === 'job'}
        theme={theme}
        title="Start your job"
        leadIcon="hammer-outline"
        options={[
          {
            title: 'Build a job for me',
            subtitle: 'Start with a field-ready scope, checklist notes, schedule, and services you can adjust.',
            icon: 'sparkles-outline',
            color: theme.stageGreen,
            onPress: () => startCreate(
              'Build job',
              'scheduled',
              null,
              '',
              'Confirm client needs, site access, materials, photos, safety notes, and next steps before work starts.'
            ),
          },
          {
            title: 'Create my own job',
            subtitle: 'Start blank and enter the client work, schedule, and line items yourself.',
            icon: 'create-outline',
            color: theme.accent,
            onPress: () => startCreate('New job', 'scheduled', null, ''),
          },
        ]}
        onClose={() => {
          setChoiceOpen(null);
          if (openedViaDeepLink && router.canGoBack()) {
            setOpenedViaDeepLink(false);
            setTimeout(() => router.back(), 50);
          }
        }}
      />

      <CreateChoiceModal
        visible={choiceOpen === 'estimate'}
        theme={theme}
        title="Start your estimate"
        leadIcon="document-text-outline"
        options={[
          {
            title: 'Send yourself a test estimate',
            subtitle: 'Preview the estimate workflow before sending pricing to a real client.',
            icon: 'mail-outline',
            color: theme.stageCyan,
            onPress: () => startCreate('New estimate', 'quoted', null, 'Test estimate', 'Test estimate for reviewing client-facing pricing and scope.'),
          },
          {
            title: 'Send a real estimate to a client',
            subtitle: 'Create pricing for a potential job and send it to one of your clients.',
            icon: 'person-outline',
            color: theme.stageGreen,
            onPress: () => startCreate('New estimate', 'quoted', null, ''),
          },
        ]}
        onClose={() => {
          setChoiceOpen(null);
          if (openedViaDeepLink && router.canGoBack()) {
            setOpenedViaDeepLink(false);
            setTimeout(() => router.back(), 50);
          }
        }}
      />

      {/* Add Job Modal */}
      <Modal
        visible={showAdd}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (kbVisible.current) { Keyboard.dismiss(); return; }
          closeAddModal();
        }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <Pressable
            style={styles.modalOverlay}
            onPress={() => {
              if (kbVisible.current) { Keyboard.dismiss(); return; }
              closeAddModal();
            }}
          >
            <Pressable onPress={() => {}} style={[styles.modal, { paddingBottom: Math.max(36, insets.bottom + 24), maxHeight: '90%' }]}>
            <View style={styles.typeHeader}>
              <Text style={styles.modalTitle}>{newTypeLabel}</Text>
              <TouchableOpacity onPress={closeAddModal} hitSlop={8}>
                <Ionicons name="close" size={22} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={{ flexGrow: 0, flexShrink: 1 }}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 12 }}
              showsVerticalScrollIndicator={false}
            >
              {workflows.length > 0 ? (
                <TouchableOpacity
                  style={styles.templatePickerRow}
                  onPress={() => setTemplatePickerOpen(true)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.templateIcon, { backgroundColor: theme.accentMuted }]}>
                    <Ionicons name="git-branch-outline" size={16} color={theme.accent} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.templatePickerLabel}>Service PRO template</Text>
                    <Text style={styles.templatePickerValue} numberOfLines={1}>
                      {newWorkflowId
                        ? (workflows.find(w => w.id === newWorkflowId)?.name || 'Template')
                        : 'None — blank job'}
                    </Text>
                    {(() => {
                      const stages = newWorkflowId
                        ? workflows.find(w => w.id === newWorkflowId)?.stages || []
                        : [];
                      return stages.length > 0 ? (
                        <Text style={styles.templatePickerStages} numberOfLines={2}>
                          {stages.length} stages · {stages.join(' → ')}
                        </Text>
                      ) : null;
                    })()}
                  </View>
                  <Ionicons name="chevron-down" size={16} color={theme.textMuted} />
                </TouchableOpacity>
              ) : null}
              <TextInput style={styles.modalInput} placeholder={newStatus === 'quoted' ? 'Estimate title' : 'Job title'} placeholderTextColor={theme.textMuted} value={newName} onChangeText={setNewName} />
              <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>Client</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Client name"
                  placeholderTextColor={theme.textMuted}
                  value={newClientName}
                  onChangeText={setNewClientName}
                />
                <TextInput
                  style={styles.modalInput}
                  placeholder="Client phone for text / call"
                  placeholderTextColor={theme.textMuted}
                  value={newClientPhone}
                  onChangeText={setNewClientPhone}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                />
              </View>
              <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>Job address</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Street address (e.g. 123 Main St)"
                  placeholderTextColor={theme.textMuted}
                  value={newAddress}
                  onChangeText={setNewAddress}
                  textContentType="streetAddressLine1"
                  autoComplete="address-line1"
                  autoCapitalize="words"
                />
                <TextInput
                  style={styles.modalInput}
                  placeholder="City, State ZIP (e.g. Fort Wayne, IN 46802)"
                  placeholderTextColor={theme.textMuted}
                  value={newAddressLine2}
                  onChangeText={setNewAddressLine2}
                  textContentType="streetAddressLine2"
                  autoComplete="postal-address-locality"
                  autoCapitalize="words"
                />
              </View>
              <TextInput
                style={[styles.modalInput, { minHeight: 130, textAlignVertical: 'top', paddingTop: 12 }]}
                placeholder={"Notes for your crew — scope, access, materials, anything special.\n(Line items / pricing go in the Product / Service section below.)"}
                placeholderTextColor={theme.textMuted}
                value={newDesc}
                onChangeText={setNewDesc}
                multiline
              />
              <TextInput
                style={styles.modalInput}
                placeholder={newLineItems.length ? 'Estimate set from line items' : 'Estimate amount (e.g. 2500)'}
                placeholderTextColor={theme.textMuted}
                value={newLineItems.length ? String(lineItemsTotal(newLineItems).toFixed(2)) : newEstimate}
                onChangeText={setNewEstimate}
                keyboardType="decimal-pad"
                editable={newLineItems.length === 0}
              />
              <LineItemsPicker
                items={newLineItems}
                onChange={updateNewLineItems}
                label="Product / Service"
                emptyLabel="Add services from your catalog or enter a custom line item."
              />
              <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>Schedule</Text>
                <View style={styles.scheduleLaterRow}>
                  <View>
                    <Text style={styles.scheduleLaterTitle}>Schedule later</Text>
                    <Text style={styles.scheduleLaterSub}>Keep this unscheduled until you are ready.</Text>
                  </View>
                  <Switch
                    value={newScheduleLater}
                    onValueChange={setNewScheduleLater}
                    trackColor={{ false: theme.borderStrong, true: theme.accentMuted }}
                    thumbColor={newScheduleLater ? theme.accent : theme.surfaceElevated}
                  />
                </View>
                {!newScheduleLater ? (
                  <>
                    <View style={styles.scheduleRowFields}>
                      <TouchableOpacity style={[styles.scheduleCompact, { flex: 1.4 }]} onPress={() => setPickerOpen('new')}>
                        <Ionicons name="calendar-outline" size={16} color={theme.accent} />
                        <Text style={styles.scheduleCompactValue} numberOfLines={1}>{prettyDate(newScheduledDate)}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.scheduleCompact, { flex: 1 }]} onPress={() => setTimePickerOpen('start')}>
                        <Ionicons name="time-outline" size={16} color={theme.accent} />
                        <Text
                          style={[styles.scheduleCompactValue, !newScheduledTime && { color: theme.textMuted, fontWeight: '600' }]}
                          numberOfLines={1}
                        >
                          {newScheduledTime ? formatVisitTime(newScheduledTime) : 'Start'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.scheduleCompact, { flex: 1 }]} onPress={() => setTimePickerOpen('end')}>
                        <Ionicons name="time-outline" size={16} color={theme.accent} />
                        <Text
                          style={[styles.scheduleCompactValue, !newScheduledEndTime && { color: theme.textMuted, fontWeight: '600' }]}
                          numberOfLines={1}
                        >
                          {newScheduledEndTime ? formatVisitTime(newScheduledEndTime) : 'End'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.repeatBox}>
                      <Text style={styles.scheduleLabel}>Repeating</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.repeatOptions}>
                        {REPEAT_OPTIONS.map(option => {
                          const active = newRepeat === option.key;
                          return (
                            <TouchableOpacity
                              key={option.key}
                              style={[styles.repeatChip, active && { backgroundColor: theme.accentMuted, borderColor: theme.accent + '66' }]}
                              onPress={() => setNewRepeat(option.key)}
                              activeOpacity={0.72}
                            >
                              <Text style={[styles.repeatChipText, active && { color: theme.accent }]}>{option.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  </>
                ) : null}
              </View>

              <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>Team</Text>
                {crewMembers.length === 0 ? (
                  <Text style={styles.teamEmpty}>No active crew members yet.</Text>
                ) : (
                  <View style={styles.teamGrid}>
                    {crewMembers.map(member => {
                      const active = selectedCrewIds.has(member.id);
                      const color = crewColor(theme, member.name);
                      return (
                        <TouchableOpacity
                          key={member.id}
                          style={[styles.teamChip, active && { backgroundColor: color + '18', borderColor: color + '66' }]}
                          onPress={() => toggleCrewSelection(member.id)}
                          activeOpacity={0.75}
                        >
                          <View style={[styles.teamInitial, { backgroundColor: color }]}>
                            <Text style={styles.teamInitialText}>{member.name.charAt(0).toUpperCase()}</Text>
                          </View>
                          <Text style={[styles.teamName, active && { color }]} numberOfLines={1}>{member.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              <View style={styles.invoiceReminderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formSectionTitle}>Invoicing</Text>
                  <Text style={styles.scheduleLaterSub}>Remind me to invoice when I close the job.</Text>
                </View>
                <Switch
                  value={newInvoiceReminder}
                  onValueChange={setNewInvoiceReminder}
                  trackColor={{ false: theme.borderStrong, true: theme.accentMuted }}
                  thumbColor={newInvoiceReminder ? theme.accent : theme.surfaceElevated}
                />
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeAddModal}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, !canSubmitNewJob && styles.saveBtnDisabled]}
                onPress={addJob}
                disabled={!canSubmitNewJob}
              >
                {saving ? <ActivityIndicator color={theme.accentContrast} /> : <Text style={styles.saveText}>{newTypeLabel.replace('New ', 'Add ')}</Text>}
              </TouchableOpacity>
            </View>
            {!canSubmitNewJob && missingNewJobFields ? (
              <Text style={styles.saveHint}>Add {missingNewJobFields} to save.</Text>
            ) : null}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={templatePickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setTemplatePickerOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setTemplatePickerOpen(false)}>
          <Pressable onPress={() => {}} style={[styles.modal, { paddingBottom: Math.max(36, insets.bottom + 24), maxHeight: '75%' }]}>
            <View style={styles.typeHeader}>
              <Text style={styles.modalTitle}>Service PRO template</Text>
              <TouchableOpacity onPress={() => setTemplatePickerOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={[styles.templateRow, { borderColor: theme.border }]}
                onPress={() => {
                  // If the title was auto-filled by a previous template
                  // (matches any workflow name), clear it so the user
                  // sees the placeholder again. Custom titles are kept.
                  const trimmedName = newName.trim().toLowerCase();
                  const wasAutoFilled =
                    workflows.some(w => w.name.trim().toLowerCase() === trimmedName)
                    || /^new (job|install|repair|estimate)$/.test(trimmedName);
                  if (wasAutoFilled) setNewName('');
                  setNewWorkflowId(null);
                  setTemplatePickerOpen(false);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.templateIcon, { backgroundColor: theme.surfaceInset }]}>
                  <Ionicons name="remove-circle-outline" size={18} color={theme.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.templateName}>None — blank job</Text>
                </View>
                {newWorkflowId === null ? <Ionicons name="checkmark" size={18} color={theme.accent} /> : null}
              </TouchableOpacity>
              {workflows.map(wf => (
                <TouchableOpacity
                  key={wf.id}
                  style={[styles.templateRow, { borderColor: theme.border }]}
                  onPress={() => {
                    setNewWorkflowId(wf.id);
                    // Pre-fill only the title when the user hasn't typed
                    // anything specific yet. Description is left alone so
                    // the placeholder tip stays visible — auto-prefilling
                    // "<Template> — " only hid the tip without teaching
                    // what to write.
                    const trimmedName = newName.trim().toLowerCase();
                    const isUntouchedName =
                      !trimmedName
                      || /^new (job|install|repair|estimate)$/.test(trimmedName)
                      || workflows.some(w => w.name.trim().toLowerCase() === trimmedName);
                    if (isUntouchedName) setNewName(wf.name);
                    setTemplatePickerOpen(false);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.templateIcon, { backgroundColor: theme.accentMuted }]}>
                    <Ionicons name="git-branch-outline" size={18} color={theme.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.templateName}>{wf.name}</Text>
                    {wf.stages && wf.stages.length > 0 ? (
                      <Text style={styles.templateDesc} numberOfLines={1}>
                        {wf.stages.length} stages · {wf.stages.join(' → ')}
                      </Text>
                    ) : wf.description ? (
                      <Text style={styles.templateDesc} numberOfLines={1}>{wf.description}</Text>
                    ) : null}
                  </View>
                  {newWorkflowId === wf.id ? <Ionicons name="checkmark" size={18} color={theme.accent} /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <CalendarPicker
        visible={pickerOpen !== null}
        value={pickerOpen === 'new' ? newScheduledDate : selectedDay}
        title={pickerOpen === 'weekjump' ? 'Jump to date' : 'Schedule date'}
        onClose={() => setPickerOpen(null)}
        onSelect={(v) => {
          if (pickerOpen === 'new') setNewScheduledDate(v);
          else if (pickerOpen === 'weekjump' && v) {
            setSelectedDay(v);
            const parsed = fromDateString(v);
            if (parsed) setAnchor(parsed);
          }
        }}
      />
      <TimePickerSheet
        visible={timePickerOpen !== null}
        value={timePickerOpen === 'end' ? newScheduledEndTime : newScheduledTime}
        title={timePickerOpen === 'end' ? 'End time' : 'Start time'}
        onClose={() => setTimePickerOpen(null)}
        onSelect={(v) => {
          if (timePickerOpen === 'end') {
            setNewScheduledEndTime(v);
          } else {
            setNewScheduledTime(v);
            setNewScheduledEndTime(prev => prev || defaultEndTime(v));
          }
        }}
      />
    </View>
  );
}

// ─── CREATE CHOICE SHEET ───────────────────────────────────────────

function CreateChoiceModal({
  visible, theme, title, leadIcon, options, onClose,
}: {
  visible: boolean;
  theme: Theme;
  title: string;
  leadIcon: any;
  options: Array<{ title: string; subtitle: string; icon: any; color: string; onPress: () => void }>;
  onClose: () => void;
}) {
  const styles = makeStyles(theme);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.choiceModal}>
          <View style={styles.choiceHeader}>
            <View style={[styles.choiceLeadIcon, { backgroundColor: theme.accentMuted }]}>
              <Ionicons name={leadIcon} size={20} color={theme.accent} />
            </View>
            <Text style={styles.choiceTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} style={styles.choiceClose}>
              <Ionicons name="close" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={styles.choiceOptionList}>
            {options.map((option) => (
              <TouchableOpacity key={option.title} style={styles.choiceOption} onPress={option.onPress} activeOpacity={0.75}>
                <View style={[styles.choiceOptionIcon, { backgroundColor: option.color + '18' }]}>
                  <Ionicons name={option.icon} size={19} color={option.color} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.choiceOptionTitle}>{option.title}</Text>
                  <Text style={styles.choiceOptionSub}>{option.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={theme.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── TYPE PICKER TILE ──────────────────────────────────────────────

function TypeTile({
  theme, icon, color, label, hint, onPress,
}: {
  theme: Theme;
  icon: any;
  color: string;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        width: '48%',
        padding: 14,
        backgroundColor: color + '1a',
        borderWidth: 1, borderColor: color + '55',
        borderRadius: 14,
        gap: 8,
      }}
    >
      <View style={{
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: color,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Ionicons name={icon} size={18} color="#fff" />
      </View>
      <Text style={{ color: theme.textPrimary, fontSize: 15, fontWeight: '800' }}>{label}</Text>
      <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '600' }}>{hint}</Text>
    </TouchableOpacity>
  );
}

// ─── SHARED: SUMMARY TILE ───────────────────────────────────────────
// Stat tile matching the home-screen vocabulary: uppercase eyebrow,
// large bold number underneath. Used in the day-summary row above the
// view content.

function SummaryTile({
  theme, label, value, valueColor,
}: { theme: Theme; label: string; value: string; valueColor?: string }) {
  return (
    <View style={{
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 10,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    }}>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        style={{
          color: theme.textMuted,
          fontSize: 9.5,
          fontWeight: '800',
          letterSpacing: 0.3,
          textTransform: 'uppercase',
        }}
      >{label}</Text>
      <Text style={{
        color: valueColor || theme.textPrimary,
        fontSize: 18,
        fontWeight: '800',
        marginTop: 2,
        fontVariant: ['tabular-nums'],
      }}>{value}</Text>
    </View>
  );
}

// ─── GRID VIEW ──────────────────────────────────────────────────────
// 4-week calendar overview. Each cell shows day number + an event-count
// dot. Tap a cell to drill into the day in List view.

function GridScheduleView({
  theme, anchor, jobsByDay, selectedDay, refreshing, onRefresh, onSelectDay, onOpenJob,
}: {
  theme: Theme;
  anchor: Date;
  jobsByDay: Record<string, ScheduleJob[]>;
  selectedDay: string;
  refreshing: boolean;
  onRefresh: () => void;
  onSelectDay: (day: string) => void;
  onOpenJob: (jobId: string) => void;
}) {
  const start = useMemo(() => {
    const sunday = new Date(anchor);
    sunday.setDate(anchor.getDate() - anchor.getDay());
    sunday.setHours(0, 0, 0, 0);
    return sunday;
  }, [anchor]);

  const weeks = useMemo(() => {
    return Array.from({ length: 4 }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const date = new Date(start);
        date.setDate(start.getDate() + w * 7 + d);
        return date;
      })
    );
  }, [start]);

  const todayKey = toDateString(new Date());
  const rangeLabel = `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${weeks[3][6].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ paddingBottom: 140 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={{ color: theme.textPrimary, fontSize: 16, fontWeight: '800' }}>Next 4 weeks</Text>
        <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700' }}>{rangeLabel}</Text>
      </View>

      <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 4 }}>
        {DAY_LETTERS.map(d => (
          <Text key={d} style={{
            flex: 1, textAlign: 'center',
            color: theme.textMuted, fontSize: 10, fontWeight: '800',
            letterSpacing: 0.5, textTransform: 'uppercase',
          }}>{d}</Text>
        ))}
      </View>

      <View style={{ paddingHorizontal: 12, gap: 6 }}>
        {weeks.map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row', gap: 6 }}>
            {row.map(date => {
              const key = toDateString(date);
              const events = jobsByDay[key] || [];
              const count = events.length;
              const isToday = key === todayKey;
              const isSelected = key === selectedDay;
              const tint = count > 0 ? theme.accent : theme.textMuted;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => onSelectDay(key)}
                  activeOpacity={0.7}
                  style={{
                    flex: 1,
                    aspectRatio: 0.85,
                    paddingVertical: 6,
                    paddingHorizontal: 4,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: isSelected ? theme.accent : (isToday ? theme.accent + '55' : theme.border),
                    backgroundColor: isSelected ? theme.accentMuted : (count > 0 ? theme.surface : theme.bg),
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text style={{
                    color: isSelected ? theme.accent : (isToday ? theme.accent : theme.textPrimary),
                    fontSize: 14,
                    fontWeight: isToday || isSelected ? '900' : '700',
                    fontVariant: ['tabular-nums'],
                  }}>{date.getDate()}</Text>
                  {count > 0 ? (
                    <View style={{
                      minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9,
                      backgroundColor: tint,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ color: theme.accentContrast, fontSize: 10, fontWeight: '800' }}>{count}</Text>
                    </View>
                  ) : (
                    <View style={{ height: 18 }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginTop: 18 }} />

      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={{ color: theme.textPrimary, fontSize: 15, fontWeight: '800' }}>
          {friendlyDayLabel(selectedDay)}
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '700' }}>
          {(jobsByDay[selectedDay] || []).length} visit{(jobsByDay[selectedDay] || []).length === 1 ? '' : 's'}
        </Text>
      </View>

      {(jobsByDay[selectedDay] || []).length === 0 ? (
        <Text style={{
          color: theme.textMuted, fontSize: 13, fontWeight: '600',
          textAlign: 'center', paddingVertical: 24, paddingHorizontal: 32,
        }}>
          Nothing scheduled.
        </Text>
      ) : (
        <View style={{ paddingHorizontal: 16, gap: 6, paddingBottom: 24 }}>
          {(jobsByDay[selectedDay] || [])
            .slice()
            .sort((a, b) => String(a.scheduled_time || '99:99').localeCompare(String(b.scheduled_time || '99:99')))
            .map(j => {
              const stamp = statusStamp(theme, j);
              const tone = colorForJob(theme, j);
              return (
                <TouchableOpacity
                  key={j.id}
                  onPress={() => onOpenJob(j.id)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row', gap: 10,
                    paddingVertical: 10, paddingHorizontal: 12,
                    borderRadius: 10,
                    backgroundColor: theme.surface,
                    borderWidth: 1, borderColor: theme.border,
                  }}
                >
                  <View style={{ width: 3, borderRadius: 2, backgroundColor: tone.border, alignSelf: 'stretch' }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '800' }}>
                        {formatVisitTime(j.scheduled_time)}
                      </Text>
                      {stamp ? (
                        <Text style={{
                          color: stamp.color, fontSize: 9, fontWeight: '900',
                          letterSpacing: 0.5,
                        }}>{stamp.label}</Text>
                      ) : null}
                    </View>
                    <Text style={{ color: theme.textPrimary, fontSize: 14, fontWeight: '700', marginTop: 2 }} numberOfLines={1}>
                      {j.name}
                    </Text>
                    {j.client_name ? (
                      <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                        {j.client_name}{j.crew?.length ? ` · ${j.crew.slice(0, 2).map(c => c.name).join(', ')}${j.crew.length > 2 ? ` +${j.crew.length - 2}` : ''}` : ''}
                      </Text>
                    ) : j.crew?.length ? (
                      <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                        {j.crew.slice(0, 2).map(c => c.name).join(', ')}{j.crew.length > 2 ? ` +${j.crew.length - 2}` : ''}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
        </View>
      )}
    </ScrollView>
  );
}

// ─── LIST VIEW ─────────────────────────────────────────────────────

function ListView({
  theme, jobs, week, jobsByDay, refreshing, onRefresh, onAddJob, onOpenJob, onPrevWeek, onNextWeek,
}: {
  theme: Theme;
  jobs: ScheduleJob[];
  week: Date[];
  jobsByDay: Record<string, ScheduleJob[]>;
  refreshing: boolean;
  onRefresh: () => void;
  onAddJob: () => void;
  onOpenJob: (jobId: string) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
}) {
  const todayKey = toDateString(new Date());
  const rangeLabel = `${week[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${week[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  const daysWithEvents = week.filter(d => (jobsByDay[toDateString(d)] || []).length > 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ paddingBottom: 140, paddingTop: 4 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
    >
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12,
      }}>
        <TouchableOpacity onPress={onPrevWeek} hitSlop={12}>
          <Ionicons name="chevron-back" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={{
            color: theme.textMuted, fontSize: 9, fontWeight: '800',
            letterSpacing: 0.6, textTransform: 'uppercase',
          }}>This week</Text>
          <Text style={{ color: theme.textPrimary, fontSize: 14, fontWeight: '800', marginTop: 1 }}>
            {rangeLabel}
          </Text>
        </View>
        <TouchableOpacity onPress={onNextWeek} hitSlop={12}>
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      {jobs.length === 0 ? (
        <View style={{ alignItems: 'center', padding: 32 }}>
          <Ionicons name="calendar-outline" size={32} color={theme.textMuted} />
          <Text style={{ color: theme.textPrimary, fontWeight: '800', fontSize: 15, marginTop: 12 }}>
            Nothing scheduled this week
          </Text>
          <TouchableOpacity onPress={onAddJob}>
            <Text style={{ color: theme.accent, fontWeight: '800', marginTop: 12 }}>+ Schedule a job</Text>
          </TouchableOpacity>
        </View>
      ) : (
        daysWithEvents.map(d => {
          const key = toDateString(d);
          const dayIndex = d.getDay();
          const events = (jobsByDay[key] || []).slice().sort((a, b) =>
            String(a.scheduled_time || '99:99').localeCompare(String(b.scheduled_time || '99:99'))
          );
          const isToday = key === todayKey;
          return (
            <View key={key} style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 6, gap: 12 }}>
              <View style={{ width: 38, alignItems: 'center', paddingTop: 6 }}>
                <Text style={{
                  color: isToday ? theme.accent : theme.textMuted,
                  fontSize: 10, fontWeight: '800',
                  letterSpacing: 0.6, textTransform: 'uppercase',
                }}>
                  {DAY_LETTERS[dayIndex]}
                </Text>
                <Text style={{
                  color: isToday ? theme.accent : theme.textPrimary,
                  fontSize: 22, fontWeight: '900', marginTop: 1,
                  fontVariant: ['tabular-nums'],
                }}>
                  {d.getDate()}
                </Text>
              </View>

              <View style={{ flex: 1, gap: 6 }}>
                {events.map(j => {
                  const tone = colorForJob(theme, j);
                  const stamp = statusStamp(theme, j);
                  const dur = j.expected_duration_hours;
                  // Lead with the job name — it's what the owner thinks
                  // about. Client name (if different and not just an email
                  // address echoing back) reads as the subtitle.
                  const primary = j.name || j.client_name || 'Untitled job';
                  const clientLabel = j.client_name && j.client_name !== j.name ? j.client_name : '';
                  const secondary = clientLabel || (j.address || '');
                  return (
                    <TouchableOpacity
                      key={j.id}
                      onPress={() => onOpenJob(j.id)}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: 'row', gap: 10,
                        paddingVertical: 10, paddingHorizontal: 12,
                        borderRadius: 10,
                        backgroundColor: theme.surface,
                        borderWidth: 1, borderColor: theme.border,
                      }}
                    >
                      <View style={{ width: 3, borderRadius: 2, backgroundColor: tone.border, alignSelf: 'stretch' }} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <Text style={{ color: theme.textPrimary, fontSize: 14, fontWeight: '800', flex: 1 }} numberOfLines={1}>
                            {primary}
                          </Text>
                          <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '800' }}>
                            {formatVisitTime(j.scheduled_time)}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
                          <Text style={{ color: theme.textMuted, fontSize: 12, flex: 1 }} numberOfLines={1}>
                            {secondary}
                          </Text>
                          {dur ? (
                            <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '700' }}>
                              {dur}h
                            </Text>
                          ) : stamp ? (
                            <Text style={{ color: stamp.color, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 }}>
                              {stamp.label}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })
      )}

      {jobs.length > 0 && daysWithEvents.length === 0 ? (
        <Text style={{
          color: theme.textMuted, fontSize: 13, fontWeight: '600',
          textAlign: 'center', paddingVertical: 24, paddingHorizontal: 32,
        }}>Nothing scheduled this week.</Text>
      ) : null}
    </ScrollView>
  );
}

// ─── CALENDAR GRID VIEW ─────────────────────────────────────────────

function MapScheduleView({
  theme, jobs, refreshing, onRefresh, onAddJob,
}: {
  theme: Theme;
  jobs: ScheduleJob[];
  refreshing: boolean;
  onRefresh: () => void;
  onAddJob: () => void;
}) {
  const styles = makeStyles(theme);
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
    >
      <View style={styles.mapPanel}>
        <Ionicons name="navigate-outline" size={30} color={theme.accent} />
        <Text style={styles.mapTitle}>Route</Text>
        <Text style={styles.mapCopy}>
          Tap a stop to open it in Google Maps for directions.
        </Text>
      </View>
      {jobs.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No stops on this day</Text>
          <TouchableOpacity onPress={onAddJob}>
            <Text style={styles.emptyCta}>+ Schedule a job</Text>
          </TouchableOpacity>
        </View>
      ) : jobs.map(job => (
        <TouchableOpacity
          key={job.id}
          style={styles.mapStop}
          activeOpacity={0.75}
          onPress={() => job.address && Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`)}
          disabled={!job.address}
        >
          <View style={[styles.mapStopIcon, { backgroundColor: colorForJob(theme, job).bg }]}>
            <Ionicons name="location-outline" size={18} color={colorForJob(theme, job).text} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.mapStopTitle} numberOfLines={1}>{job.name}</Text>
            <Text style={styles.mapStopMeta} numberOfLines={1}>{compactTimeRange(job.scheduled_time)} · {job.address || 'No address'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function CalendarView({
  theme, jobs, crewMembers, selectedDay, refreshing, onRefresh, allJobsWeek, onCreateAtSlot,
}: {
  theme: Theme;
  jobs: ScheduleJob[];
  crewMembers: EmployeeLite[];
  selectedDay: string;
  refreshing: boolean;
  onRefresh: () => void;
  allJobsWeek: boolean;
  onCreateAtSlot: (slotTime?: string | null, crewId?: string | null) => void;
}) {
  const styles = makeStyles(theme);

  const { cards, columns } = useMemo(() => {
    type Column = { key: string; name: string; employeeId: string | null };
    const columnsByKey = new Map<string, Column>();
    const ordered: Column[] = [];
    const addColumn = (column: Column) => {
      if (columnsByKey.has(column.key)) return;
      columnsByKey.set(column.key, column);
      ordered.push(column);
    };
    for (const member of crewMembers) {
      addColumn({ key: member.id, name: member.name, employeeId: member.id });
    }
    for (const j of jobs) {
      if (j.crew && j.crew.length > 0) {
        for (const person of j.crew) addColumn({ key: person.employee_id || person.name, name: person.name, employeeId: person.employee_id || null });
      } else {
        addColumn({ key: 'unassigned', name: 'Unassigned', employeeId: null });
      }
    }
    if (ordered.length === 0) addColumn({ key: 'unassigned', name: 'Unassigned', employeeId: null });

    const perColumn = new Map<string, ScheduleJob[]>();
    for (const column of ordered) perColumn.set(column.key, []);
    for (const j of jobs) {
      if (j.crew && j.crew.length > 0) {
        for (const person of j.crew) {
          const key = person.employee_id || person.name;
          (perColumn.get(key) || perColumn.get('unassigned') || []).push(j);
        }
      } else {
        (perColumn.get('unassigned') || []).push(j);
      }
    }

    type Placed = { job: ScheduleJob; colIndex: number; startMinutes: number; endMinutes: number };
    const out: Placed[] = [];
    ordered.forEach((column, colIndex) => {
      const list = [...(perColumn.get(column.key) || [])].sort((a, b) =>
        String(a.scheduled_time || '99:99').localeCompare(String(b.scheduled_time || '99:99'))
      );
      let cursor = HOUR_START * 60;
      for (const j of list) {
        const durationMins = Math.max(45, Math.round((Number(j.expected_duration_hours) || 2) * 60));
        const scheduled = timeToMinutes(j.scheduled_time);
        const startMinutes = scheduled == null
          ? cursor
          : Math.max(HOUR_START * 60, Math.min((HOUR_END * 60) - 30, scheduled));
        const endMinutes = Math.min(HOUR_END * 60, startMinutes + durationMins);
        out.push({ job: j, colIndex, startMinutes, endMinutes });
        cursor = endMinutes;
        if (cursor >= HOUR_END * 60) cursor = (HOUR_START + 1) * 60;
      }
    });
    return { cards: out, columns: ordered };
  }, [crewMembers, jobs]);

  const gridWidth = Math.max(columns.length, 1) * COL_WIDTH;
  const gridHeight = (HOUR_END - HOUR_START) * HOUR_HEIGHT;
  const todayKey = toDateString(new Date());
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNow = selectedDay === todayKey && nowMinutes >= HOUR_START * 60 && nowMinutes <= HOUR_END * 60;
  const nowTop = ((nowMinutes - HOUR_START * 60) / 60) * HOUR_HEIGHT;

  return (
    <ScrollView
      style={{ flex: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
    >
      <View style={{ flexDirection: 'row' }}>
        {/* Fixed time gutter */}
        <View style={[styles.gutter, { width: GUTTER_WIDTH, height: gridHeight + 44 }]}>
          <View style={{ height: 44 }} />
          {Array.from({ length: HOUR_END - HOUR_START }).map((_, i) => {
            const h = HOUR_START + i;
            const display = h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`;
            return (
              <View key={i} style={[styles.hourTick, { height: HOUR_HEIGHT }]}>
                <Text style={styles.hourLabel}>{display}</Text>
              </View>
            );
          })}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces style={{ flex: 1 }}>
          <View style={{ width: gridWidth }}>
            <View style={[styles.crewHeaderRow, { width: gridWidth, height: 44 }]}>
              {columns.map((column, idx) => {
                const color = crewColor(theme, column.name);
                const colCount = cards.filter(c => c.colIndex === idx).length;
                return (
                  <View
                    key={`${column.key}-${idx}`}
                    style={[styles.crewHeader, { width: COL_WIDTH, borderLeftColor: theme.border }]}
                  >
                    <View style={[styles.crewAvatar, { backgroundColor: color }]}>
                      <Text style={styles.crewAvatarLetter}>{column.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={[styles.crewHeaderName, { color: theme.textPrimary }]} numberOfLines={1}>
                      {column.name}
                    </Text>
                    <View style={styles.crewCountBadge}>
                      <Text style={styles.crewCountText}>{colCount}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <View style={{ width: gridWidth, height: gridHeight, position: 'relative' }}>
              {/* Background tap layer — empty cells open the add-job modal. */}
              {columns.map((column, colIdx) => (
                Array.from({ length: HOUR_END - HOUR_START }).map((_, rowIdx) => (
                  <TouchableOpacity
                    key={`cell-${colIdx}-${rowIdx}`}
                    activeOpacity={0.5}
                    onPress={() => onCreateAtSlot(minutesToTime((HOUR_START + rowIdx) * 60), column.employeeId)}
                    style={{
                      position: 'absolute',
                      top: rowIdx * HOUR_HEIGHT,
                      left: colIdx * COL_WIDTH,
                      width: COL_WIDTH,
                      height: HOUR_HEIGHT,
                    }}
                  />
                ))
              ))}
              {Array.from({ length: HOUR_END - HOUR_START }).map((_, i) => (
                <View
                  key={`hl-${i}`}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: i * HOUR_HEIGHT, left: 0, right: 0,
                    height: StyleSheet.hairlineWidth,
                    backgroundColor: theme.border,
                  }}
                />
              ))}
              {columns.map((_, i) => (
                <View
                  key={`vl-${i}`}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 0, bottom: 0, left: i * COL_WIDTH,
                    width: StyleSheet.hairlineWidth,
                    backgroundColor: theme.border,
                  }}
                />
              ))}

              {showNow ? (
                <View pointerEvents="none" style={[styles.nowLine, { top: nowTop }]}>
                  <View style={styles.nowDot} />
                  <View style={styles.nowRule} />
                </View>
              ) : null}

              {jobs.length === 0 ? (
                <View style={styles.gridHint} pointerEvents="none">
                  <Ionicons name="calendar-outline" size={22} color={theme.textMuted} />
                  <Text style={styles.gridHintTitle}>Nothing scheduled</Text>
                  <Text style={styles.gridHintSub}>
                    {allJobsWeek ? 'Tap a dotted day above' : 'Set scheduled dates on jobs to see them here'}
                  </Text>
                </View>
              ) : null}

              {cards.map((c, i) => {
                const p = colorForJob(theme, c.job);
                const top = ((c.startMinutes - HOUR_START * 60) / 60) * HOUR_HEIGHT;
                const height = Math.max(42, ((c.endMinutes - c.startMinutes) / 60) * HOUR_HEIGHT - 4);
                const left = c.colIndex * COL_WIDTH + 4;
                const w = COL_WIDTH - 8;
                const stamp = statusStamp(theme, c.job);
                return (
                  <TouchableOpacity
                    key={`${c.job.id}-${c.colIndex}-${i}`}
                    activeOpacity={0.8}
                    onPress={() => router.push({ pathname: '/(owner)/job/[id]', params: { id: c.job.id } } as any)}
                    style={[
                      styles.card,
                      { top, height, left, width: w, backgroundColor: p.bg, borderLeftColor: p.border },
                    ]}
                  >
                    <Text style={[styles.cardTitle, { color: theme.textPrimary }]} numberOfLines={2}>{c.job.name}</Text>
                    {c.job.client_name ? (
                      <Text style={styles.cardClient} numberOfLines={1}>{c.job.client_name}</Text>
                    ) : null}
                    {c.job.address ? (
                      <Text style={styles.cardAddress} numberOfLines={1}>{c.job.address}</Text>
                    ) : null}
                    {stamp ? (
                      <View style={[styles.cardStamp, { borderColor: stamp.color + '88' }]}>
                        <Text style={[styles.cardStampText, { color: stamp.color }]}>{stamp.label}</Text>
                      </View>
                    ) : null}
                    {c.job.crew && c.job.crew.length > 1 ? (
                      <Text style={styles.cardCrewNames} numberOfLines={1}>
                        {c.job.crew.map(person => person.name).join(', ')}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </View>
    </ScrollView>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: t.bg },

    scheduleTopBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 8,
    },
    monthBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 34 },
    monthTitle: { color: t.textPrimary, fontSize: 20, fontWeight: '900' },
    iconToolBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.accentMuted,
    },
    viewSegment: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginBottom: 6,
      padding: 3,
      borderRadius: 8,
      backgroundColor: t.surfaceInset,
      borderWidth: 1,
      borderColor: t.border,
    },
    segmentItem: { flex: 1, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
    segmentItemActive: { backgroundColor: t.surfaceElevated, borderWidth: 1, borderColor: t.border },
    segmentText: { color: t.textSecondary, fontSize: 13, fontWeight: '800' },
    segmentTextActive: { color: t.textPrimary },

    viewToggle: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6,
    },
    viewPill: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      height: 30, paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: t.surfaceInset,
      borderWidth: 1, borderColor: 'transparent',
    },
    viewPillText: { color: t.textSecondary, fontSize: 13, fontWeight: '700' },
    pingBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 10, height: 30, borderRadius: 999,
      backgroundColor: t.accentMuted,
    },
    pingBtnText: { color: t.accent, fontSize: 12, fontWeight: '800' },

    weekNav: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 4,
    },
    weekLabel: { color: t.textPrimary, fontSize: 13, fontWeight: '800' },

    weekStrip: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginVertical: 6,
      padding: 3,
      borderRadius: 8,
      backgroundColor: t.surfaceInset,
      borderWidth: 1,
      borderColor: t.border,
    },
    dayCell: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 4,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: 'transparent',
      minHeight: 36,
    },
    dayLetter: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    dayNumber: {
      fontSize: 13,
      fontWeight: '800',
      marginTop: 1,
      fontVariant: ['tabular-nums'],
    },
    dayDotRow: { height: 3, marginTop: 1, alignItems: 'center', justifyContent: 'center' },
    dayDot: { width: 3, height: 3, borderRadius: 1.5 },

    selectedHeader: {
      flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4,
    },
    selectedLabel: { color: t.textPrimary, fontSize: 16, fontWeight: '800' },
    selectedCount: { color: t.textMuted, fontSize: 11, fontWeight: '700' },
    newJobBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    newJobBtnText: { color: t.accent, fontSize: 13, fontWeight: '800' },
    daySummary: {
      flexDirection: 'row',
      gap: 6,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    summaryCell: {
      flex: 1,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 10,
    },
    summaryValue: { color: t.textPrimary, fontSize: 16, fontWeight: '900' },
    summaryLabel: { color: t.textMuted, fontSize: 11, fontWeight: '800', marginTop: 2 },

    // List view
    listRow: { flexDirection: 'row', backgroundColor: t.surface },
    listBar: { width: 4 },
    listSep: { height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginLeft: 20 },
    listJobName: { color: t.textPrimary, fontSize: 15, fontWeight: '700' },
    listJobClient: { color: t.textSecondary, fontSize: 13, marginTop: 2 },
    listJobAddress: { color: t.textMuted, fontSize: 12, marginTop: 2 },
    listStamp: {
      borderWidth: 1, borderRadius: 6,
      paddingVertical: 3, paddingHorizontal: 6,
      transform: [{ rotate: '-6deg' }],
      marginLeft: 8, marginTop: 2,
    },
    listStampText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
    visitMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    visitTimePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    visitTimeText: { fontSize: 12, fontWeight: '900' },
    visitTypeText: { color: t.textMuted, fontSize: 11, fontWeight: '800' },

    crewRow: {
      flexDirection: 'row', flexWrap: 'wrap',
      gap: 6, marginTop: 10, alignItems: 'center',
    },
    crewChip: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      height: 26, paddingRight: 8,
      borderRadius: 999, borderWidth: 1,
    },
    crewInitial: {
      width: 22, height: 22, borderRadius: 11,
      alignItems: 'center', justifyContent: 'center',
    },
    crewInitialText: { color: '#fff', fontSize: 11, fontWeight: '800' },
    crewChipName: { fontSize: 11, fontWeight: '800', maxWidth: 120 },
    crewMore: { color: t.textMuted, fontSize: 12, fontWeight: '700', marginLeft: 2 },
    unassigned: { color: t.textMuted, fontSize: 12, fontStyle: 'italic', marginTop: 10 },

    statusFoot: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
    statusLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
    detailBlock: {
      gap: 6,
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.border,
    },
    detailLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    detailText: { color: t.textSecondary, fontSize: 12, fontWeight: '800' },
    visitActionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    visitActionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 36,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.accent + '44',
      backgroundColor: t.accentSoft,
    },
    visitActionText: { color: t.accent, fontSize: 12, fontWeight: '900' },

    empty: { padding: 60, alignItems: 'center', gap: 8 },
    emptyTitle: { color: t.textPrimary, fontSize: 16, fontWeight: '700' },
    emptyCta: { color: t.accent, fontSize: 14, fontWeight: '800', marginTop: 4 },

    // Calendar grid
    gutter: {
      backgroundColor: t.bg,
      borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: t.border,
    },
    hourTick: {
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border,
      alignItems: 'flex-end', paddingRight: 8, paddingTop: 4,
    },
    hourLabel: { color: t.textMuted, fontSize: 10, fontWeight: '700', fontVariant: ['tabular-nums'] },

    crewHeaderRow: {
      flexDirection: 'row',
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border,
      backgroundColor: t.bg,
    },
    crewHeader: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 10,
      borderLeftWidth: StyleSheet.hairlineWidth,
    },
    crewAvatar: {
      width: 28, height: 28, borderRadius: 14,
      alignItems: 'center', justifyContent: 'center',
    },
    crewAvatarLetter: { color: '#fff', fontSize: 13, fontWeight: '800' },
    crewHeaderName: { fontSize: 13, fontWeight: '700', flex: 1 },

    card: {
      position: 'absolute',
      borderLeftWidth: 3,
      borderRadius: 8,
      paddingVertical: 8, paddingHorizontal: 10,
    },
    cardTitle: { fontSize: 13, fontWeight: '800' },
    cardClient: { color: t.textSecondary, fontSize: 11, marginTop: 2 },
    cardAddress: { color: t.textMuted, fontSize: 10, marginTop: 1 },
    cardCrewNames: { color: t.accent, fontSize: 10, fontWeight: '800', marginTop: 3 },
    cardStamp: {
      position: 'absolute', top: 6, right: 6,
      borderWidth: 1, borderRadius: 5,
      paddingVertical: 1, paddingHorizontal: 4,
      transform: [{ rotate: '-6deg' }],
    },
    cardStampText: { fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
    cardDots: {
      position: 'absolute', bottom: 6, right: 8,
      flexDirection: 'row', gap: 3,
    },
    cardDot: { width: 6, height: 6, borderRadius: 3 },

    gridHint: {
      position: 'absolute',
      top: 40, left: 16, right: 16,
      alignItems: 'center', gap: 6,
    },
    gridHintTitle: { color: t.textPrimary, fontSize: 14, fontWeight: '700' },
    gridHintSub: { color: t.textMuted, fontSize: 12, textAlign: 'center' },
    nowLine: {
      position: 'absolute',
      left: -5,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      zIndex: 8,
    },
    nowDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: t.accent },
    nowRule: { flex: 1, height: 2, backgroundColor: t.accent },
    crewCountBadge: {
      minWidth: 24,
      height: 24,
      borderRadius: 6,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.surfaceInset,
    },
    crewCountText: { color: t.textSecondary, fontSize: 12, fontWeight: '900' },

    mapPanel: {
      alignItems: 'center',
      gap: 8,
      padding: 18,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
      marginBottom: 12,
    },
    mapTitle: { color: t.textPrimary, fontSize: 17, fontWeight: '900' },
    mapCopy: { color: t.textSecondary, fontSize: 13, lineHeight: 18, textAlign: 'center' },
    mapStop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
      marginBottom: 8,
    },
    mapStopIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    mapStopTitle: { color: t.textPrimary, fontSize: 14, fontWeight: '900' },
    mapStopMeta: { color: t.textSecondary, fontSize: 12, marginTop: 2 },

    // Add-job modal
    modalOverlay: { flex: 1, backgroundColor: t.overlay, justifyContent: 'flex-end' },
    modal: { backgroundColor: t.surfaceElevated, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
    modalTitle: { color: t.textPrimary, fontSize: 22, fontWeight: '800', marginBottom: 16 },
    choiceModal: {
      backgroundColor: t.surfaceElevated,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 18,
      borderTopWidth: 1,
      borderColor: t.border,
    },
    choiceHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
    choiceLeadIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    choiceTitle: { flex: 1, color: t.textPrimary, fontSize: 20, fontWeight: '800' },
    choiceClose: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    choiceOptionList: { gap: 10 },
    choiceOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 13,
      borderRadius: 8,
      backgroundColor: t.surfaceInset,
      borderWidth: 1,
      borderColor: t.border,
    },
    choiceOptionIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    choiceOptionTitle: { color: t.textPrimary, fontSize: 15, fontWeight: '900' },
    choiceOptionSub: { color: t.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
    typeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    typeHint: { color: t.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 14, marginTop: -8 },
    typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
    templatesLabel: { color: t.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },
    templatePickerRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: t.surfaceInset,
      borderRadius: 10, padding: 10, marginBottom: 10,
      borderWidth: 1, borderColor: t.border,
    },
    templatePickerLabel: { color: t.textMuted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    templatePickerValue: { color: t.textPrimary, fontSize: 14, fontWeight: '700', marginTop: 2 },
    templatePickerStages: { color: t.textSecondary, fontSize: 11, marginTop: 3, fontWeight: '600' },
    templateRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 12, paddingHorizontal: 12,
      borderWidth: 1, borderRadius: 12, marginBottom: 8,
    },
    templateIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    templateName: { color: t.textPrimary, fontSize: 14, fontWeight: '700' },
    templateDesc: { color: t.textSecondary, fontSize: 12, marginTop: 2 },
    templatesEmpty: { padding: 14, alignItems: 'center' },
    templatesEmptyText: { color: t.textMuted, fontSize: 12, textAlign: 'center' },
    modalInput: {
      backgroundColor: t.surfaceInset, borderWidth: 1, borderColor: t.border,
      borderRadius: 10, padding: 14, color: t.textPrimary, fontSize: 15, marginBottom: 12,
    },
    modalActions: { flexDirection: 'row', gap: 10 },
    cancelBtn: { flex: 1, borderWidth: 1, borderColor: t.border, borderRadius: 10, padding: 14, alignItems: 'center' },
    cancelText: { color: t.textSecondary, fontWeight: '700' },
    saveBtn: { flex: 1, backgroundColor: t.accent, borderRadius: 10, padding: 14, alignItems: 'center' },
    saveBtnDisabled: { opacity: 0.45 },
    saveText: { color: t.accentContrast, fontWeight: '800' },
    saveHint: { color: t.textMuted, fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 8 },
    scheduleField: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: t.surfaceInset, borderWidth: 1, borderColor: t.border,
      borderRadius: 10, padding: 14, marginBottom: 12,
    },
    scheduleRowFields: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    scheduleHalfField: { flex: 1, marginBottom: 0 },
    scheduleLabel: { color: t.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    scheduleValue: { color: t.textPrimary, fontSize: 15, fontWeight: '600', marginTop: 2 },
    scheduleCompact: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: t.surfaceInset, borderWidth: 1, borderColor: t.border,
      borderRadius: 10, paddingHorizontal: 10, paddingVertical: 11,
    },
    scheduleCompactValue: { color: t.textPrimary, fontSize: 13, fontWeight: '700', flexShrink: 1 },
    formSection: {
      borderTopWidth: 1,
      borderTopColor: t.border,
      paddingTop: 14,
      marginTop: 4,
      marginBottom: 12,
    },
    formSectionTitle: { color: t.textPrimary, fontSize: 16, fontWeight: '900', marginBottom: 8 },
    scheduleLaterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 12,
    },
    scheduleLaterTitle: { color: t.textPrimary, fontSize: 14, fontWeight: '800' },
    scheduleLaterSub: { color: t.textSecondary, fontSize: 12, lineHeight: 17 },
    repeatBox: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 10,
      backgroundColor: t.surfaceInset,
      padding: 12,
      marginBottom: 10,
    },
    repeatOptions: { gap: 8, paddingTop: 3 },
    repeatChip: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 999,
      paddingVertical: 7,
      paddingHorizontal: 10,
      backgroundColor: t.surfaceElevated,
    },
    repeatChipText: { color: t.textSecondary, fontSize: 12, fontWeight: '800' },
    teamGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    teamChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      maxWidth: '48%',
      minHeight: 34,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surfaceInset,
      paddingLeft: 4,
      paddingRight: 10,
    },
    teamInitial: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    teamInitialText: { color: '#fff', fontSize: 12, fontWeight: '900' },
    teamName: { flexShrink: 1, color: t.textSecondary, fontSize: 12, fontWeight: '900' },
    teamEmpty: { color: t.textMuted, fontSize: 13, fontStyle: 'italic' },
    invoiceReminderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      borderTopWidth: 1,
      borderTopColor: t.border,
      paddingTop: 14,
      marginBottom: 14,
    },
  });
}
