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
  selectedDay, onSelect, onPickCalendar,
}: {
  selectedDay: string;
  onSelect: (day: string) => void;
  onPickCalendar?: () => void;
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
    <View style={weekStyles.wrap}>
      <View style={weekStyles.headerRow}>
        <TouchableOpacity onPress={() => shift(-7)} style={weekStyles.navBtn}>
          <Ionicons name="chevron-back" size={18} color="#ddd" />
        </TouchableOpacity>
        <TouchableOpacity onPress={onPickCalendar} style={{ flex: 1, alignItems: 'center' }}>
          <Text style={weekStyles.label}>{label}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => shift(7)} style={weekStyles.navBtn}>
          <Ionicons name="chevron-forward" size={18} color="#ddd" />
        </TouchableOpacity>
      </View>
      <View style={weekStyles.row}>
        {days.map((d, i) => {
          const s = toDateString(d);
          const isToday = s === todayStr;
          const isSelected = s === selectedDay;
          return (
            <TouchableOpacity key={i} style={weekStyles.cell} onPress={() => onSelect(s)}>
              <Text style={weekStyles.letter}>{DAY_LETTERS[i]}</Text>
              <View style={[
                weekStyles.bubble,
                isToday && !isSelected && { borderWidth: 1, borderColor: '#0ea5e9' },
                isSelected && { backgroundColor: '#0ea5e9' },
              ]}>
                <Text style={[
                  weekStyles.num,
                  isToday && !isSelected && { color: '#0ea5e9' },
                  isSelected && { color: '#000', fontWeight: '800' },
                ]}>{d.getDate()}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const weekStyles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, backgroundColor: '#0a0a0a' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  navBtn: { padding: 6 },
  label: { color: '#ddd', fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
  letter: { color: '#666', fontSize: 11, fontWeight: '700' },
  bubble: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  num: { color: '#ddd', fontSize: 14, fontWeight: '700' },
});

const ACTIVE_STATUSES = ['active', 'in_progress', 'scheduled', 'on_hold', 'quoted', 'complete'];
const INVOICED_STATUSES = ['invoiced'];

export default function OwnerJobs() {
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
    return <View style={styles.center}><ActivityIndicator size="large" color="#0ea5e9" /></View>;
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
            selectedDay={selectedDay}
            onSelect={setSelectedDay}
            onPickCalendar={() => setPickerOpen('weekjump')}
          />
          <View style={styles.dayModeControls}>
            {selectedDay !== toDateString(new Date()) && (
              <TouchableOpacity onPress={() => setSelectedDay(toDateString(new Date()))}>
                <Text style={styles.dayModeLink}>Today</Text>
              </TouchableOpacity>
            )}
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#0ea5e9" />}
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
                        <Ionicons name="calendar-outline" size={12} color="#0ea5e9" />
                        <Text style={styles.metaChipText}>{prettyDate(sd)}</Text>
                      </View>
                    ) : null}
                    {amt > 0 ? (
                      <View style={styles.metaChip}>
                        <Ionicons name="cash-outline" size={12} color="#4ade80" />
                        <Text style={[styles.metaChipText, { color: '#4ade80' }]}>${amt.toLocaleString()}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <View style={[styles.stageBadge, { backgroundColor: stage.color + '22' }]}>
                    <Text style={[styles.stageText, { color: stage.color }]}>{stage.label}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#555" />
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
            <TextInput style={styles.input} placeholder="Job name" placeholderTextColor="#555" value={newName} onChangeText={setNewName} />
            <TextInput style={styles.input} placeholder="Address" placeholderTextColor="#555" value={newAddress} onChangeText={setNewAddress} />
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Scope of work / description"
              placeholderTextColor="#555"
              value={newDesc}
              onChangeText={setNewDesc}
              multiline
            />
            <TextInput
              style={styles.input}
              placeholder="Estimate amount (e.g. 2500)"
              placeholderTextColor="#555"
              value={newEstimate}
              onChangeText={setNewEstimate}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity style={styles.scheduleField} onPress={() => setPickerOpen('new')}>
              <View style={{ flex: 1 }}>
                <Text style={styles.scheduleLabel}>Schedule</Text>
                <Text style={styles.scheduleValue}>{prettyDate(newScheduledDate)}</Text>
              </View>
              <Ionicons name="calendar-outline" size={20} color="#0ea5e9" />
            </TouchableOpacity>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAdd(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={addJob} disabled={saving}>
                {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveText}>Add Job</Text>}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },

  offlineBar: { backgroundColor: '#7f1d1d', paddingVertical: 8, paddingHorizontal: 16 },
  offlineText: { color: '#fca5a5', fontSize: 12, fontWeight: '600', textAlign: 'center' },

  dayModeControls: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  dayModeLink: { color: '#0ea5e9', fontSize: 13, fontWeight: '700' },

  filterRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, flexWrap: 'wrap', alignItems: 'center' },
  filterChip: { borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: '#2a2a2a', backgroundColor: '#111' },
  filterChipActive: { backgroundColor: '#0ea5e922', borderColor: '#0ea5e9' },
  filterChipText: { color: '#777', fontSize: 12, fontWeight: '700' },
  filterChipTextActive: { color: '#0ea5e9' },

  card: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#2a2a2a' },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  jobName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  jobAddress: { color: '#666', fontSize: 13, marginTop: 2 },
  stageBadge: { borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  stageText: { fontSize: 11, fontWeight: '700' },
  cardMetaRow: { flexDirection: 'row', gap: 10, marginTop: 8, flexWrap: 'wrap' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaChipText: { color: '#888', fontSize: 12, fontWeight: '600' },

  footerLabel: { color: '#888', fontSize: 13, fontWeight: '800', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  dayBadge: { backgroundColor: '#0ea5e922', borderWidth: 1, borderColor: '#0ea5e955', borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 },
  dayBadgeText: { color: '#0ea5e9', fontSize: 10, fontWeight: '800' },

  emptyCard: { backgroundColor: '#111', borderRadius: 12, borderWidth: 1, borderColor: '#1e1e1e', padding: 20, alignItems: 'center', marginTop: 8 },
  emptyText: { color: '#888', fontSize: 14, marginBottom: 10 },
  emptyAction: { color: '#0ea5e9', fontSize: 13, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#1a1a1a', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  input: {
    backgroundColor: '#0a0a0a', borderWidth: 1, borderColor: '#2a2a2a',
    borderRadius: 10, padding: 14, color: '#fff', fontSize: 15, marginBottom: 12,
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 10, padding: 14, alignItems: 'center' },
  cancelText: { color: '#aaa', fontWeight: '700' },
  saveBtn: { flex: 1, backgroundColor: '#0ea5e9', borderRadius: 10, padding: 14, alignItems: 'center' },
  saveText: { color: '#000', fontWeight: '800' },

  scheduleField: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#0a0a0a', borderWidth: 1, borderColor: '#2a2a2a',
    borderRadius: 10, padding: 14, marginBottom: 12,
  },
  scheduleLabel: { color: '#888', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  scheduleValue: { color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 2 },
});
