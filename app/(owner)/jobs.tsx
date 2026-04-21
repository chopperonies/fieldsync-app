import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, RefreshControl, Alert,
  Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Job } from '../../lib/supabase';
import { getUser } from '../../lib/storage';
import { setCache, getStaleCache } from '../../lib/cache';
import { mobileGet, mobilePost } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import CalendarPicker, { toDateString, fromDateString, prettyDate } from '../../components/CalendarPicker';

// Schedule tab. Day mode (default) filters jobs to scheduled_date = selectedDay.
// "Show all jobs" flips into legacy Active/Invoiced/All chips. Tapping a card
// navigates to /(owner)/job/[id] — all editing happens there.

const PIPELINE = [
  { key: 'quoted',      label: 'Quoted',      color: '#6366f1' },
  { key: 'scheduled',   label: 'Scheduled',   color: '#3b82f6' },
  { key: 'in_progress', label: 'In Progress', color: '#0ea5e9' },
  { key: 'complete',    label: 'Complete',    color: '#4ade80' },
  { key: 'invoiced',    label: 'Invoiced',    color: '#a78bfa' },
  { key: 'on_hold',     label: 'On Hold',     color: '#f59e0b' },
];
function normalizeStatus(s: string) { return s === 'active' ? 'in_progress' : s; }
function pipelineFor(key: string) { return PIPELINE.find(p => p.key === normalizeStatus(key)) ?? PIPELINE[2]; }

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function WeekStrip({
  theme, selectedDay, onSelect, onPickCalendar, counts,
}: {
  theme: Theme;
  selectedDay: string;
  onSelect: (day: string) => void;
  onPickCalendar?: () => void;
  counts?: Record<string, number>;
}) {
  const selDate = fromDateString(selectedDay) || new Date();
  const sunday = new Date(selDate);
  sunday.setDate(selDate.getDate() - selDate.getDay());
  sunday.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday); d.setDate(sunday.getDate() + i); return d;
  });
  const todayStr = toDateString(new Date());
  const endOfWeek = new Date(sunday); endOfWeek.setDate(sunday.getDate() + 6);
  const label = `${days[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${endOfWeek.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  function shift(delta: number) {
    const next = new Date(sunday); next.setDate(sunday.getDate() + delta);
    onSelect(toDateString(next));
  }

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, backgroundColor: theme.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <TouchableOpacity onPress={() => shift(-7)} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={18} color={theme.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onPickCalendar} style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ color: theme.textPrimary, fontSize: 13, fontWeight: '700' }}>{label}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => shift(7)} style={{ padding: 6 }}>
          <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {days.map((d, i) => {
          const s = toDateString(d);
          const isToday = s === todayStr;
          const isSelected = s === selectedDay;
          const count = counts?.[s] || 0;
          return (
            <TouchableOpacity key={i} style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 }} onPress={() => onSelect(s)}>
              <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '700' }}>{DAY_LETTERS[i]}</Text>
              <View style={[
                { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
                isToday && !isSelected && { borderWidth: 1, borderColor: theme.accent },
                isSelected && { backgroundColor: theme.accent },
              ]}>
                <Text style={[
                  { color: theme.textSecondary, fontSize: 14, fontWeight: '700' },
                  isToday && !isSelected && { color: theme.accent },
                  isSelected && { color: theme.accentContrast, fontWeight: '800' },
                ]}>{d.getDate()}</Text>
              </View>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: count > 0 ? theme.accent : 'transparent', marginTop: 4 }} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// Retained for backwards-compat; WeekStrip now uses inline theme styles.
const weekStyles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
  bubble: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent', marginTop: 4 },
  dotActive: { backgroundColor: '#0ea5e9' },
});

const ACTIVE_STATUSES = ['active', 'in_progress', 'scheduled', 'on_hold', 'quoted', 'complete'];
const INVOICED_STATUSES = ['invoiced'];

export default function OwnerJobs() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const insets = useSafeAreaInsets();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  // Add job
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newEstimate, setNewEstimate] = useState('');
  const [newScheduledDate, setNewScheduledDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Day / filter
  const [dayMode, setDayMode] = useState<boolean>(true);
  const [selectedDay, setSelectedDay] = useState<string>(toDateString(new Date()));
  const [filter, setFilter] = useState<'active' | 'invoiced' | 'all'>('active');

  const [pickerOpen, setPickerOpen] = useState<null | 'new' | 'weekjump'>(null);

  const loadData = useCallback(async () => {
    const user = await getUser();
    try {
      const result = await mobileGet<Job[]>('/api/mobile/owner/jobs');
      setJobs(result || []);
      setIsOffline(false);
      await setCache('owner_jobs_' + user?.tenant_id, result);
    } catch {
      const cached = await getStaleCache<Job[]>('owner_jobs_' + user?.tenant_id);
      if (cached) { setJobs(cached); setIsOffline(true); }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const params = useLocalSearchParams<{ open?: string; filter?: string; day?: string }>();
  useEffect(() => {
    if (params.open === 'new' || params.open === 'new_quote') setShowAdd(true);
  }, [params.open]);
  useEffect(() => {
    if (params.filter === 'active') { setDayMode(false); setFilter('active'); }
    else if (params.filter === 'invoiced') { setDayMode(false); setFilter('invoiced'); }
    else if (params.filter === 'all') { setDayMode(false); setFilter('all'); }
  }, [params.filter]);
  useEffect(() => {
    if (params.day && /^\d{4}-\d{2}-\d{2}$/.test(params.day)) {
      setDayMode(true);
      setSelectedDay(params.day);
    }
  }, [params.day]);

  const filteredJobs = jobs.filter(j => {
    if (dayMode) {
      const sd = (j as any).scheduled_date as string | null;
      return sd === selectedDay;
    }
    const s = normalizeStatus(j.status || '');
    if (filter === 'active') return ACTIVE_STATUSES.includes(s);
    if (filter === 'invoiced') return INVOICED_STATUSES.includes(s) || (j as any).payment_status === 'paid';
    return true;
  });
  const unscheduledActive = dayMode && selectedDay === toDateString(new Date())
    ? jobs.filter(j => !(j as any).scheduled_date && ACTIVE_STATUSES.includes(normalizeStatus(j.status || '')))
    : [];
  // Count jobs per scheduled_date for the week-strip dots.
  const scheduleCounts: Record<string, number> = jobs.reduce((acc, j) => {
    const sd = (j as any).scheduled_date as string | null;
    if (sd) acc[sd] = (acc[sd] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  async function addJob() {
    if (!newName.trim() || !newAddress.trim()) return Alert.alert('Fill in both fields');
    setSaving(true);
    try {
      const data = await mobilePost<Job>('/api/mobile/owner/jobs', {
        name: newName.trim(), address: newAddress.trim(),
        description: newDesc.trim() || null,
        estimate_amount: newEstimate ? parseFloat(newEstimate) : null,
        scheduled_date: newScheduledDate,
      });
      if (data) setJobs(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName(''); setNewAddress(''); setNewDesc(''); setNewEstimate('');
      setNewScheduledDate(null);
      setShowAdd(false);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not create job.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.accent} /></View>;
  }

  return (
    <View style={styles.container}>
      {isOffline && (
        <View style={styles.offlineBar}>
          <Text style={styles.offlineText}>📵 No connection — showing cached jobs</Text>
        </View>
      )}

      {dayMode ? (
        <View>
          <WeekStrip
            theme={theme}
            selectedDay={selectedDay}
            onSelect={setSelectedDay}
            onPickCalendar={() => setPickerOpen('weekjump')}
            counts={scheduleCounts}
          />
          <View style={styles.dayModeControls}>
            {selectedDay !== toDateString(new Date()) && (
              <TouchableOpacity onPress={() => setSelectedDay(toDateString(new Date()))}>
                <Text style={styles.dayModeLink}>Today</Text>
              </TouchableOpacity>
            )}
            {(() => {
              const todayStr = toDateString(new Date());
              const tomorrowStr = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return toDateString(d); })();
              const pingMode = selectedDay === todayStr ? 'today' : selectedDay === tomorrowStr ? 'tomorrow' : null;
              if (!pingMode || filteredJobs.length === 0) return null;
              return (
                <TouchableOpacity
                  onPress={async () => {
                    try {
                      const resp = await mobilePost<{ sent: number }>('/api/mobile/owner/crew-reminder-test', { mode: pingMode });
                      Alert.alert(
                        'Reminder sent',
                        resp?.sent
                          ? `Pushed to ${resp.sent} crew member${resp.sent === 1 ? '' : 's'}.`
                          : 'No crew to ping — nobody is assigned to jobs on this day (or their push notifications are off).',
                      );
                    } catch (e: any) {
                      Alert.alert('Failed', e?.message || 'Could not send reminders.');
                    }
                  }}
                  style={{ marginLeft: 14, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  <Ionicons name="notifications-outline" size={14} color={theme.accent} />
                  <Text style={styles.dayModeLink}>Ping crew</Text>
                </TouchableOpacity>
              );
            })()}
            <TouchableOpacity onPress={() => setDayMode(false)}>
              <Text style={[styles.dayModeLink, { marginLeft: 'auto' }]}>Show all jobs ›</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.filterRow}>
          <TouchableOpacity onPress={() => setDayMode(true)} style={{ marginRight: 8 }}>
            <Text style={styles.dayModeLink}>‹ Schedule</Text>
          </TouchableOpacity>
          {[
            { key: 'active', label: `Active (${jobs.filter(j => ACTIVE_STATUSES.includes(normalizeStatus(j.status || ''))).length})` },
            { key: 'invoiced', label: `Invoiced (${jobs.filter(j => INVOICED_STATUSES.includes(normalizeStatus(j.status || '')) || (j as any).payment_status === 'paid').length})` },
            { key: 'all', label: `All (${jobs.length})` },
          ].map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
              onPress={() => setFilter(f.key as any)}
            >
              <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <FlatList
        data={filteredJobs}
        keyExtractor={j => j.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 160 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={theme.accent} />}
        ListEmptyComponent={
          dayMode && !loading
            ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>Nothing scheduled for {prettyDate(selectedDay)}.</Text>
                <TouchableOpacity onPress={() => setShowAdd(true)}>
                  <Text style={styles.emptyAction}>+ Schedule a job</Text>
                </TouchableOpacity>
              </View>
            )
            : null
        }
        ListFooterComponent={
          dayMode && unscheduledActive.length > 0
            ? (
              <View style={{ marginTop: 20 }}>
                <Text style={styles.footerLabel}>Unscheduled active</Text>
                {unscheduledActive.map(j => (
                  <TouchableOpacity
                    key={j.id}
                    style={[styles.card, { marginBottom: 10 }]}
                    onPress={() => router.push({ pathname: '/(owner)/job/[id]', params: { id: j.id } } as any)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.cardRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.jobName}>{j.name}</Text>
                        <Text style={styles.jobAddress}>{j.address}</Text>
                      </View>
                      <View style={styles.dayBadge}>
                        <Text style={styles.dayBadgeText}>SCHEDULE</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )
            : null
        }
        renderItem={({ item }) => {
          const stage = pipelineFor(item.status);
          const sd = (item as any).scheduled_date as string | null;
          const amt = Number((item as any).invoice_amount) || Number((item as any).estimate_amount) || 0;
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push({ pathname: '/(owner)/job/[id]', params: { id: item.id } } as any)}
              activeOpacity={0.8}
            >
              <View style={styles.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.jobName}>{item.name}</Text>
                  {item.address ? <Text style={styles.jobAddress}>{item.address}</Text> : null}
                  <View style={styles.cardMetaRow}>
                    {sd ? (
                      <View style={styles.metaChip}>
                        <Ionicons name="calendar-outline" size={12} color={theme.accent} />
                        <Text style={styles.metaChipText}>{prettyDate(sd)}</Text>
                      </View>
                    ) : null}
                    {amt > 0 ? (
                      <View style={styles.metaChip}>
                        <Ionicons name="cash-outline" size={12} color={theme.success} />
                        <Text style={[styles.metaChipText, { color: '#4ade80' }]}>${amt.toLocaleString()}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <View style={[styles.stageBadge, { backgroundColor: stage.color + '22' }]}>
                    <Text style={[styles.stageText, { color: stage.color }]}>{stage.label}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Add Job Modal */}
      <Modal visible={showAdd} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modal, { paddingBottom: 24 + insets.bottom }]}>
            <Text style={styles.modalTitle}>New Job Site</Text>
            <TextInput style={styles.input} placeholder="Job name" placeholderTextColor={theme.textMuted} value={newName} onChangeText={setNewName} />
            <TextInput style={styles.input} placeholder="Address" placeholderTextColor={theme.textMuted} value={newAddress} onChangeText={setNewAddress} />
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Scope of work / description"
              placeholderTextColor={theme.textMuted}
              value={newDesc}
              onChangeText={setNewDesc}
              multiline
            />
            <TextInput
              style={styles.input}
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
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAdd(false)}>
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
          else if (pickerOpen === 'weekjump' && v) setSelectedDay(v);
        }}
      />
    </View>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: t.bg },

    offlineBar: { backgroundColor: t.dangerMuted, paddingVertical: 8, paddingHorizontal: 16 },
    offlineText: { color: t.danger, fontSize: 12, fontWeight: '600', textAlign: 'center' },

    dayModeControls: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
    dayModeLink: { color: t.accent, fontSize: 13, fontWeight: '700' },

    filterRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, flexWrap: 'wrap', alignItems: 'center' },
    filterChip: { borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface },
    filterChipActive: { backgroundColor: t.accentMuted, borderColor: t.accent },
    filterChipText: { color: t.textSecondary, fontSize: 12, fontWeight: '700' },
    filterChipTextActive: { color: t.accent },

    card: { backgroundColor: t.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: t.border },
    cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
    jobName: { color: t.textPrimary, fontSize: 15, fontWeight: '600' },
    jobAddress: { color: t.textSecondary, fontSize: 13, marginTop: 2 },
    stageBadge: { borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
    stageText: { fontSize: 11, fontWeight: '700' },
    cardMetaRow: { flexDirection: 'row', gap: 10, marginTop: 8, flexWrap: 'wrap' },
    metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaChipText: { color: t.textSecondary, fontSize: 12, fontWeight: '600' },

    footerLabel: { color: t.textSecondary, fontSize: 13, fontWeight: '800', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
    dayBadge: { backgroundColor: t.accentMuted, borderWidth: 1, borderColor: t.accent + '55', borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 },
    dayBadgeText: { color: t.accent, fontSize: 10, fontWeight: '800' },

    emptyCard: { backgroundColor: t.surface, borderRadius: 12, borderWidth: 1, borderColor: t.border, padding: 20, alignItems: 'center', marginTop: 8 },
    emptyText: { color: t.textSecondary, fontSize: 14, marginBottom: 10 },
    emptyAction: { color: t.accent, fontSize: 13, fontWeight: '700' },

    modalOverlay: { flex: 1, backgroundColor: t.overlay, justifyContent: 'flex-end' },
    modal: { backgroundColor: t.surfaceElevated, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
    modalTitle: { color: t.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: 16 },
    input: {
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
