import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  FlatList, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { mobileGet } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import { statusMeta } from '../../lib/jobStatus';

type CrewMember = { employee_id: string; name: string };
type ScheduleJob = {
  id: string;
  name: string;
  address: string | null;
  status: string;
  scheduled_date: string | null;
  client_id?: string | null;
  client_name?: string | null;
  crew: CrewMember[];
};

const DAY_LETTERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function weekStrip(anchor: Date): Date[] {
  const sunday = new Date(anchor);
  sunday.setDate(anchor.getDate() - anchor.getDay());
  sunday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
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

function statusStamp(status: string): { label: string; color: string } | null {
  const s = String(status || '').toLowerCase();
  if (s === 'invoiced') return { label: 'INVOICED', color: '#2563eb' };
  if (s === 'paid') return { label: 'PAID', color: '#16a34a' };
  if (s === 'completed' || s === 'complete') return { label: 'DONE', color: '#0891b2' };
  if (s === 'quote' || s === 'quoted') return { label: 'QUOTE', color: '#d97706' };
  return null;
}

// Deterministic color per crew-member name — initials on the chip,
// stable tint across renders.
function hashColor(seed: string, theme: Theme): string {
  const colors = [theme.stageBlue, theme.stageCyan, theme.stageGreen, theme.stageIndigo, theme.stagePurple, theme.stageAmber];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return colors[Math.abs(h) % colors.length];
}

export default function CrewSchedule() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const router = useRouter();

  const [anchor, setAnchor] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [selected, setSelected] = useState<string>(() => isoDay(new Date()));
  const [jobs, setJobs] = useState<ScheduleJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const week = useMemo(() => weekStrip(anchor), [anchor]);
  const rangeStart = week[0];
  const rangeEnd = week[6];

  const load = useCallback(async () => {
    try {
      const data = await mobileGet<ScheduleJob[]>(
        `/api/mobile/crew/schedule?start=${isoDay(rangeStart)}&end=${isoDay(rangeEnd)}`
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

  const jobsByDay: Record<string, ScheduleJob[]> = {};
  for (const j of jobs) {
    const k = j.scheduled_date || '';
    if (!k) continue;
    (jobsByDay[k] = jobsByDay[k] || []).push(j);
  }
  const selectedJobs = jobsByDay[selected] || [];

  return (
    <View style={styles.container}>
      {/* Week strip with navigation */}
      <View style={styles.weekNav}>
        <TouchableOpacity
          onPress={() => {
            const d = new Date(anchor); d.setDate(d.getDate() - 7); setAnchor(d);
          }}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.weekLabel}>
          {rangeStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {rangeEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </Text>
        <TouchableOpacity
          onPress={() => {
            const d = new Date(anchor); d.setDate(d.getDate() + 7); setAnchor(d);
          }}
          hitSlop={12}
        >
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>
      <View style={styles.weekStrip}>
        {week.map((d, i) => {
          const key = isoDay(d);
          const selectedDay = key === selected;
          const today = isoDay(new Date()) === key;
          const hasJobs = !!jobsByDay[key]?.length;
          return (
            <TouchableOpacity
              key={i}
              style={styles.dayCell}
              onPress={() => setSelected(key)}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.dayLetter,
                selectedDay && { color: theme.accent, fontWeight: '800' },
              ]}>{DAY_LETTERS[i]}</Text>
              <View style={[
                styles.dayBubble,
                selectedDay && { backgroundColor: theme.accent },
              ]}>
                <Text style={[
                  styles.dayNumber,
                  selectedDay && { color: theme.accentContrast, fontWeight: '800' },
                  today && !selectedDay && { color: theme.accent, fontWeight: '800' },
                ]}>
                  {d.getDate()}
                </Text>
              </View>
              <View style={[
                styles.dayDot,
                hasJobs && { backgroundColor: selectedDay ? theme.accent : theme.textMuted },
              ]} />
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.selectedHeader}>
        <Text style={styles.selectedLabel}>{friendlyDayLabel(selected)}</Text>
        <Text style={styles.selectedCount}>
          {selectedJobs.length === 0 ? 'No jobs' : `${selectedJobs.length} job${selectedJobs.length === 1 ? '' : 's'}`}
        </Text>
      </View>

      <FlatList
        data={selectedJobs}
        keyExtractor={j => j.id}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.accent} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={32} color={theme.textMuted} />
              <Text style={styles.emptyTitle}>Nothing scheduled</Text>
              <Text style={styles.emptySub}>
                Pick a different day or swipe down to refresh.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const meta = statusMeta(item.status);
          const tone = theme[meta.tone];
          const stamp = statusStamp(item.status);
          return (
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.jobRow}
              onPress={() => router.push({ pathname: '/(crew)/job/[id]', params: { id: item.id } } as any)}
            >
              <View style={[styles.leftBar, { backgroundColor: tone }]} />
              <View style={{ flex: 1, paddingLeft: 14, paddingVertical: 14, paddingRight: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.jobName} numberOfLines={1}>{item.name}</Text>
                    {item.client_name ? <Text style={styles.jobClient} numberOfLines={1}>{item.client_name}</Text> : null}
                    {item.address ? <Text style={styles.jobAddress} numberOfLines={1}>{item.address}</Text> : null}
                  </View>
                  {stamp ? (
                    <View style={[styles.stamp, { borderColor: stamp.color + '66' }]}>
                      <Text style={[styles.stampText, { color: stamp.color }]}>{stamp.label}</Text>
                    </View>
                  ) : null}
                </View>
                {item.crew && item.crew.length > 0 ? (
                  <View style={styles.crewRow}>
                    {item.crew.slice(0, 4).map((c, i) => (
                      <View
                        key={`${c.employee_id}-${i}`}
                        style={[styles.crewChip, { backgroundColor: hashColor(c.name, theme) + '22', borderColor: hashColor(c.name, theme) + '55' }]}
                      >
                        <View style={[styles.crewInitial, { backgroundColor: hashColor(c.name, theme) }]}>
                          <Text style={styles.crewInitialText}>{c.name.charAt(0).toUpperCase()}</Text>
                        </View>
                        <Text style={[styles.crewChipName, { color: hashColor(c.name, theme) }]}>
                          {c.name.split(' ')[0]}
                        </Text>
                      </View>
                    ))}
                    {item.crew.length > 4 ? (
                      <Text style={styles.crewMore}>+{item.crew.length - 4}</Text>
                    ) : null}
                  </View>
                ) : (
                  <Text style={styles.unassigned}>Unassigned</Text>
                )}
                <View style={styles.statusFoot}>
                  <Ionicons name={meta.icon} size={13} color={tone} />
                  <Text style={[styles.statusLabel, { color: tone }]}>{meta.label}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },

    weekNav: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6,
    },
    weekLabel: { color: t.textPrimary, fontSize: 14, fontWeight: '800' },

    weekStrip: {
      flexDirection: 'row', justifyContent: 'space-between',
      paddingVertical: 8, paddingHorizontal: 12,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border,
    },
    dayCell: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
    dayLetter: { color: t.textMuted, fontSize: 11, fontWeight: '700' },
    dayBubble: {
      width: 34, height: 34, borderRadius: 17,
      alignItems: 'center', justifyContent: 'center',
    },
    dayNumber: { color: t.textSecondary, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
    dayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent', marginTop: 2 },

    selectedHeader: {
      flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8,
    },
    selectedLabel: { color: t.textPrimary, fontSize: 18, fontWeight: '800' },
    selectedCount: { color: t.textMuted, fontSize: 13, fontWeight: '700' },

    jobRow: {
      flexDirection: 'row',
      backgroundColor: t.surface,
    },
    leftBar: { width: 4 },
    jobName: { color: t.textPrimary, fontSize: 15, fontWeight: '700' },
    jobClient: { color: t.textSecondary, fontSize: 13, marginTop: 2 },
    jobAddress: { color: t.textMuted, fontSize: 12, marginTop: 2 },

    stamp: {
      borderWidth: 1, borderRadius: 6,
      paddingVertical: 3, paddingHorizontal: 6,
      transform: [{ rotate: '-6deg' }],
      marginLeft: 8, marginTop: 2,
    },
    stampText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },

    crewRow: {
      flexDirection: 'row', flexWrap: 'wrap',
      gap: 6, marginTop: 10,
      alignItems: 'center',
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

    statusFoot: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      marginTop: 8,
    },
    statusLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },

    separator: {
      height: StyleSheet.hairlineWidth, backgroundColor: t.border,
      marginLeft: 20,
    },

    empty: { padding: 60, alignItems: 'center', gap: 8 },
    emptyTitle: { color: t.textPrimary, fontSize: 16, fontWeight: '700' },
    emptySub: { color: t.textMuted, fontSize: 13, textAlign: 'center' },
  });
}
