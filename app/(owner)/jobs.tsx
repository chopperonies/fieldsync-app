import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, FlatList, TextInput,
  ActivityIndicator, RefreshControl, Alert, Modal, KeyboardAvoidingView, Platform, Keyboard,
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

type CrewMember = { employee_id: string; name: string };
type ScheduleJob = {
  id: string;
  name: string;
  address: string | null;
  status: string;
  scheduled_date: string | null;
  payment_status?: string | null;
  invoice_amount?: number | null;
  client_id?: string | null;
  client_name?: string | null;
  crew: CrewMember[];
};

type ViewMode = 'list' | 'calendar';

const DAY_LETTERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Calendar grid dimensions
const HOUR_START = 7;
const HOUR_END = 19;
const HOUR_HEIGHT = 72;
const COL_WIDTH = 180;
const GUTTER_WIDTH = 56;

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
  if (s === 'quote' || s === 'quoted') return { label: 'QUOTE', color: theme.stageIndigo };
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
  const [view, setView] = useState<ViewMode>('list');
  const [jobs, setJobs] = useState<ScheduleJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<null | 'new' | 'weekjump'>(null);

  // Add-job modal (triggered by ?open=new / ?open=new_quote via OwnerFab)
  const [showAdd, setShowAdd] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [workflows, setWorkflows] = useState<Array<{ id: string; name: string; description?: string | null; industry?: string | null }>>([]);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newEstimate, setNewEstimate] = useState('');
  const [newScheduledDate, setNewScheduledDate] = useState<string | null>(null);
  const [newWorkflowId, setNewWorkflowId] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<string>('scheduled');
  const [newTypeLabel, setNewTypeLabel] = useState<string>('New job');
  const [saving, setSaving] = useState(false);

  const week = useMemo(() => weekStripDays(anchor), [anchor]);
  const rangeStart = week[0];
  const rangeEnd = week[6];

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
    mobileGet<Array<{ id: string; name: string; description?: string | null; industry?: string | null }>>('/api/mobile/owner/workflows')
      .then(ws => setWorkflows(ws || []))
      .catch(() => setWorkflows([]));
  }, []);

  const params = useLocalSearchParams<{ open?: string; day?: string }>();
  useEffect(() => {
    if (params.open === 'new_quote') {
      // Deep link from OwnerFab's Quote action — preload a quote.
      setNewStatus('quoted');
      setNewTypeLabel('New quote');
      setShowAdd(true);
    } else if (params.open === 'new') {
      // Deep link from OwnerFab's Job action — show the type picker.
      setShowTypePicker(true);
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
    setSaving(true);
    try {
      const data = await mobilePost<Job>('/api/mobile/owner/jobs', {
        name: newName.trim(), address: newAddress.trim(),
        description: newDesc.trim() || null,
        estimate_amount: newEstimate ? parseFloat(newEstimate) : null,
        scheduled_date: newScheduledDate,
        workflow_id: newWorkflowId,
        status: newStatus,
      });
      if (data && (data as any).scheduled_date) {
        setSelectedDay((data as any).scheduled_date);
        const parsed = fromDateString((data as any).scheduled_date);
        if (parsed) setAnchor(parsed);
      }
      setNewName(''); setNewAddress(''); setNewDesc(''); setNewEstimate('');
      setNewScheduledDate(null); setNewWorkflowId(null); setNewStatus('scheduled');
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
  // Every tap resets the name + other fields so a previous "Repair" default
  // doesn't bleed into a new Install/Quote.
  function startCreate(typeLabel: string, status: string, workflowId: string | null, defaultName: string) {
    setNewTypeLabel(typeLabel);
    setNewStatus(status);
    setNewWorkflowId(workflowId);
    setNewName(defaultName);
    setNewAddress('');
    setNewDesc('');
    setNewEstimate('');
    setNewScheduledDate(selectedDay);
    setShowTypePicker(false);
    setShowAdd(true);
  }

  function closeAddModal() {
    Keyboard.dismiss();
    setShowAdd(false);
    // Reset so next open starts clean.
    setNewName(''); setNewAddress(''); setNewDesc(''); setNewEstimate('');
    setNewScheduledDate(null); setNewWorkflowId(null); setNewStatus('scheduled');
    setNewTypeLabel('New job');
  }

  function openTypePicker() {
    setNewScheduledDate(selectedDay);
    setShowTypePicker(true);
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
  const jobsForSelected = jobsByDay[selectedDay] || [];

  if (loading && jobs.length === 0) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.accent} /></View>;
  }

  return (
    <View style={styles.container}>
      {/* View toggle */}
      <View style={styles.viewToggle}>
        <TouchableOpacity
          style={[styles.viewPill, view === 'list' && { backgroundColor: theme.accentMuted, borderColor: theme.accent + '55' }]}
          onPress={() => setView('list')}
          activeOpacity={0.7}
        >
          <Ionicons name="list" size={14} color={view === 'list' ? theme.accent : theme.textSecondary} />
          <Text style={[styles.viewPillText, view === 'list' && { color: theme.accent }]}>List</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewPill, view === 'calendar' && { backgroundColor: theme.accentMuted, borderColor: theme.accent + '55' }]}
          onPress={() => setView('calendar')}
          activeOpacity={0.7}
        >
          <Ionicons name="grid" size={14} color={view === 'calendar' ? theme.accent : theme.textSecondary} />
          <Text style={[styles.viewPillText, view === 'calendar' && { color: theme.accent }]}>Calendar</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {canPingCrew && (selectedDay === toDateString(new Date()) || selectedDay === toDateString((() => { const d = new Date(); d.setDate(d.getDate() + 1); return d; })())) ? (
          <TouchableOpacity onPress={pingCrew} style={styles.pingBtn} activeOpacity={0.7}>
            <Ionicons name="notifications-outline" size={14} color={theme.accent} />
            <Text style={styles.pingBtnText}>Ping crew</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Week strip */}
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
          const tint = dayTint(theme, i);
          const count = jobsByDay[key]?.length || 0;
          return (
            <TouchableOpacity
              key={i}
              style={[styles.dayCell, selected && { backgroundColor: tint + '22', borderColor: tint + '66' }]}
              onPress={() => setSelectedDay(key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.dayLetter, { color: selected ? tint : theme.textMuted }]}>
                {DAY_LETTERS[i]}
              </Text>
              <Text style={[
                styles.dayNumber,
                { color: selected ? tint : (today ? theme.textPrimary : theme.textSecondary) },
                (selected || today) && { fontWeight: '800' },
              ]}>{d.getDate()}</Text>
              <View style={styles.dayDotRow}>
                {count > 0 ? <View style={[styles.dayDot, { backgroundColor: tint }]} /> : <View style={{ height: 4 }} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.selectedHeader}>
        <Text style={styles.selectedLabel}>{friendlyDayLabel(selectedDay)}</Text>
        <TouchableOpacity
          onPress={openTypePicker}
          style={styles.newJobBtn}
          activeOpacity={0.7}
          hitSlop={6}
        >
          <Ionicons name="add-circle" size={18} color={theme.accent} />
          <Text style={styles.newJobBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      {view === 'list' ? (
        <ListView
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
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }}
          allJobsWeek={jobs.length > 0}
          onCreateAtSlot={openTypePicker}
        />
      )}

      {/* Type picker — Job / Quote / Install / Repair + Service PRO workflows */}
      <Modal visible={showTypePicker} transparent animationType="slide" onRequestClose={() => setShowTypePicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { paddingBottom: 24 + insets.bottom, maxHeight: '85%' }]}>
            <View style={styles.typeHeader}>
              <Text style={styles.modalTitle}>What are you adding?</Text>
              <TouchableOpacity onPress={() => setShowTypePicker(false)} hitSlop={8}>
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
                  onPress={() => startCreate('New job', 'scheduled', null, '')}
                />
                <TypeTile
                  theme={theme}
                  icon="pricetag-outline"
                  color={theme.stageIndigo}
                  label="Quote"
                  hint="Pricing proposal"
                  onPress={() => startCreate('New quote', 'quoted', null, '')}
                />
                <TypeTile
                  theme={theme}
                  icon="build-outline"
                  color={theme.stageCyan}
                  label="Install"
                  hint="New install job"
                  onPress={() => startCreate('New install', 'scheduled', null, 'Install — ')}
                />
                <TypeTile
                  theme={theme}
                  icon="construct-outline"
                  color={theme.stageAmber}
                  label="Repair"
                  hint="Service call / fix"
                  onPress={() => startCreate('New repair', 'scheduled', null, 'Repair — ')}
                />
              </View>

              {workflows.length > 0 ? (
                <>
                  <Text style={styles.templatesLabel}>From your Service PRO templates</Text>
                  {workflows.map(wf => (
                    <TouchableOpacity
                      key={wf.id}
                      style={[styles.templateRow, { borderColor: theme.border }]}
                      onPress={() => startCreate(wf.name, 'scheduled', wf.id, `${wf.name} — `)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.templateIcon, { backgroundColor: theme.accentMuted }]}>
                        <Ionicons name="git-branch-outline" size={18} color={theme.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.templateName}>{wf.name}</Text>
                        {wf.description ? <Text style={styles.templateDesc} numberOfLines={1}>{wf.description}</Text> : null}
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
          </View>
        </View>
      </Modal>

      {/* Add Job Modal */}
      <Modal
        visible={showAdd}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (kbVisible) { Keyboard.dismiss(); return; }
          closeAddModal();
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modal, { paddingBottom: 24 + insets.bottom, maxHeight: '90%' }]}>
            <Text style={styles.modalTitle}>{newTypeLabel}</Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 12 }}
              showsVerticalScrollIndicator={false}
            >
              <TextInput style={styles.modalInput} placeholder={newStatus === 'quoted' ? 'Quote name' : 'Job name'} placeholderTextColor={theme.textMuted} value={newName} onChangeText={setNewName} />
              <TextInput style={styles.modalInput} placeholder="Address" placeholderTextColor={theme.textMuted} value={newAddress} onChangeText={setNewAddress} />
              <TextInput
                style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
                placeholder="Scope of work / description"
                placeholderTextColor={theme.textMuted}
                value={newDesc}
                onChangeText={setNewDesc}
                multiline
              />
              <TextInput
                style={styles.modalInput}
                placeholder="Estimate amount (e.g. 2500)"
                placeholderTextColor={theme.textMuted}
                value={newEstimate}
                onChangeText={setNewEstimate}
                keyboardType="decimal-pad"
              />
              <TouchableOpacity style={styles.scheduleField} onPress={() => setPickerOpen('new')}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.scheduleLabel}>Schedule</Text>
                  <Text style={styles.scheduleValue}>{prettyDate(newScheduledDate)}</Text>
                </View>
                <Ionicons name="calendar-outline" size={20} color={theme.accent} />
              </TouchableOpacity>
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeAddModal}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={addJob} disabled={saving}>
                {saving ? <ActivityIndicator color={theme.accentContrast} /> : <Text style={styles.saveText}>Add Job</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
    </View>
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

// ─── LIST VIEW ─────────────────────────────────────────────────────

function ListView({
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
    <FlatList
      data={jobs}
      keyExtractor={j => j.id}
      contentContainerStyle={{ paddingBottom: 140 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={30} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>Nothing scheduled</Text>
          <TouchableOpacity onPress={onAddJob}>
            <Text style={styles.emptyCta}>+ Schedule a job</Text>
          </TouchableOpacity>
        </View>
      }
      ItemSeparatorComponent={() => <View style={styles.listSep} />}
      renderItem={({ item }) => {
        const p = colorForJob(theme, item);
        const stamp = statusStamp(theme, item);
        return (
          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.listRow}
            onPress={() => router.push({ pathname: '/(owner)/job/[id]', params: { id: item.id } } as any)}
          >
            <View style={[styles.listBar, { backgroundColor: p.border }]} />
            <View style={{ flex: 1, paddingLeft: 14, paddingVertical: 14, paddingRight: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.listJobName} numberOfLines={1}>{item.name}</Text>
                  {item.client_name ? <Text style={styles.listJobClient} numberOfLines={1}>{item.client_name}</Text> : null}
                  {item.address ? <Text style={styles.listJobAddress} numberOfLines={1}>{item.address}</Text> : null}
                </View>
                {stamp ? (
                  <View style={[styles.listStamp, { borderColor: stamp.color + '88' }]}>
                    <Text style={[styles.listStampText, { color: stamp.color }]}>{stamp.label}</Text>
                  </View>
                ) : null}
              </View>
              {item.crew && item.crew.length > 0 ? (
                <View style={styles.crewRow}>
                  {item.crew.slice(0, 4).map((c, i) => {
                    const tc = crewColor(theme, c.name);
                    return (
                      <View
                        key={`${c.employee_id}-${i}`}
                        style={[styles.crewChip, { backgroundColor: tc + '22', borderColor: tc + '55' }]}
                      >
                        <View style={[styles.crewInitial, { backgroundColor: tc }]}>
                          <Text style={styles.crewInitialText}>{c.name.charAt(0).toUpperCase()}</Text>
                        </View>
                        <Text style={[styles.crewChipName, { color: tc }]}>
                          {c.name.split(' ')[0]}
                        </Text>
                      </View>
                    );
                  })}
                  {item.crew.length > 4 ? (
                    <Text style={styles.crewMore}>+{item.crew.length - 4}</Text>
                  ) : null}
                </View>
              ) : (
                <Text style={styles.unassigned}>Unassigned</Text>
              )}
              <View style={styles.statusFoot}>
                <Ionicons name={statusMeta(item.status).icon} size={13} color={p.text} />
                <Text style={[styles.statusLabel, { color: p.text }]}>{statusMeta(item.status).label}</Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}

// ─── CALENDAR GRID VIEW ─────────────────────────────────────────────

function CalendarView({
  theme, jobs, refreshing, onRefresh, allJobsWeek, onCreateAtSlot,
}: {
  theme: Theme;
  jobs: ScheduleJob[];
  refreshing: boolean;
  onRefresh: () => void;
  allJobsWeek: boolean;
  onCreateAtSlot: () => void;
}) {
  const styles = makeStyles(theme);

  const { cards, allCrew } = useMemo(() => {
    const perCrew = new Map<string, ScheduleJob[]>();
    const seenOrder: string[] = [];
    for (const j of jobs) {
      const people = j.crew && j.crew.length > 0 ? j.crew.map(c => c.name) : ['Unassigned'];
      for (const name of people) {
        if (!perCrew.has(name)) { perCrew.set(name, []); seenOrder.push(name); }
        perCrew.get(name)!.push(j);
      }
    }
    type Placed = { job: ScheduleJob; colIndex: number; startHour: number; endHour: number };
    const out: Placed[] = [];
    for (const name of seenOrder) {
      const colIndex = seenOrder.indexOf(name);
      const list = perCrew.get(name) || [];
      let cursor = 8;
      for (const j of list) {
        const duration = 2;
        const startHour = cursor;
        const endHour = Math.min(HOUR_END, startHour + duration);
        out.push({ job: j, colIndex, startHour, endHour });
        cursor = endHour;
        if (cursor >= HOUR_END) cursor = HOUR_START + 1;
      }
    }
    return { cards: out, allCrew: seenOrder };
  }, [jobs]);

  const gridWidth = Math.max(allCrew.length, 1) * COL_WIDTH;
  const gridHeight = (HOUR_END - HOUR_START) * HOUR_HEIGHT;

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
              {allCrew.length > 0 ? allCrew.map((name, idx) => {
                const color = crewColor(theme, name);
                return (
                  <View
                    key={`${name}-${idx}`}
                    style={[styles.crewHeader, { width: COL_WIDTH, borderLeftColor: theme.border }]}
                  >
                    <View style={[styles.crewAvatar, { backgroundColor: color }]}>
                      <Text style={styles.crewAvatarLetter}>{name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={[styles.crewHeaderName, { color: theme.textPrimary }]} numberOfLines={1}>
                      {name}
                    </Text>
                  </View>
                );
              }) : (
                <View style={[styles.crewHeader, { width: COL_WIDTH, borderLeftColor: 'transparent' }]}>
                  <View style={[styles.crewAvatar, { backgroundColor: theme.surfaceInset }]}>
                    <Ionicons name="people-outline" size={14} color={theme.textMuted} />
                  </View>
                  <Text style={[styles.crewHeaderName, { color: theme.textMuted }]} numberOfLines={1}>
                    No crew yet
                  </Text>
                </View>
              )}
            </View>

            <View style={{ width: gridWidth, height: gridHeight, position: 'relative' }}>
              {/* Background tap layer — empty cells open the add-job modal. */}
              {(allCrew.length > 0 ? allCrew : ['']).map((_, colIdx) => (
                Array.from({ length: HOUR_END - HOUR_START }).map((_, rowIdx) => (
                  <TouchableOpacity
                    key={`cell-${colIdx}-${rowIdx}`}
                    activeOpacity={0.5}
                    onPress={onCreateAtSlot}
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
              {(allCrew.length > 0 ? allCrew : ['']).map((_, i) => (
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
                const top = (c.startHour - HOUR_START) * HOUR_HEIGHT;
                const height = (c.endHour - c.startHour) * HOUR_HEIGHT - 4;
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
                      <View style={styles.cardDots}>
                        {c.job.crew.slice(0, 3).map((cc, k) => (
                          <View
                            key={k}
                            style={[styles.cardDot, { backgroundColor: crewColor(theme, cc.name) }]}
                          />
                        ))}
                      </View>
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
      paddingHorizontal: 16, paddingVertical: 6,
    },
    weekLabel: { color: t.textPrimary, fontSize: 14, fontWeight: '800' },

    weekStrip: {
      flexDirection: 'row', gap: 4,
      paddingVertical: 8, paddingHorizontal: 12,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border,
    },
    dayCell: {
      flex: 1, alignItems: 'center', paddingVertical: 6,
      borderRadius: 10,
      borderWidth: 1, borderColor: 'transparent',
    },
    dayLetter: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
    dayNumber: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
    dayDotRow: { height: 6, marginTop: 4, alignItems: 'center', justifyContent: 'center' },
    dayDot: { width: 4, height: 4, borderRadius: 2 },

    selectedHeader: {
      flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8,
    },
    selectedLabel: { color: t.textPrimary, fontSize: 18, fontWeight: '800' },
    selectedCount: { color: t.textMuted, fontSize: 12, fontWeight: '700' },
    newJobBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    newJobBtnText: { color: t.accent, fontSize: 13, fontWeight: '800' },

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
    crewChipName: { fontSize: 11, fontWeight: '800' },
    crewMore: { color: t.textMuted, fontSize: 12, fontWeight: '700', marginLeft: 2 },
    unassigned: { color: t.textMuted, fontSize: 12, fontStyle: 'italic', marginTop: 10 },

    statusFoot: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
    statusLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },

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

    // Add-job modal
    modalOverlay: { flex: 1, backgroundColor: t.overlay, justifyContent: 'flex-end' },
    modal: { backgroundColor: t.surfaceElevated, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
    modalTitle: { color: t.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: 16 },
    typeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    typeHint: { color: t.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 14, marginTop: -8 },
    typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
    templatesLabel: { color: t.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },
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
    saveText: { color: t.accentContrast, fontWeight: '800' },
    scheduleField: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: t.surfaceInset, borderWidth: 1, borderColor: t.border,
      borderRadius: 10, padding: 14, marginBottom: 12,
    },
    scheduleLabel: { color: t.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    scheduleValue: { color: t.textPrimary, fontSize: 15, fontWeight: '600', marginTop: 2 },
  });
}
