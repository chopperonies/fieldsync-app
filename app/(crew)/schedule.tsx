import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Dimensions,
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
  payment_status?: string | null;
  invoice_amount?: number | null;
  client_id?: string | null;
  client_name?: string | null;
  crew: CrewMember[];
};

const DAY_LETTERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Grid dimensions
const HOUR_START = 7;             // 7 AM
const HOUR_END = 19;              // 7 PM (exclusive)
const HOUR_HEIGHT = 72;           // px per hour
const COL_WIDTH = 180;            // px per crew column
const GUTTER_WIDTH = 56;          // time gutter width

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

// Deterministic pastel color by seed (job id, crew name, etc.)
function hashIndex(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

// Status-driven color for a job card. Order of precedence:
//   paid  → bright green (money in)
//   status → normalized via statusMeta (Quoted=indigo, Booked=blue,
//            On the way=purple, In progress=cyan, On hold=amber,
//            Complete=green, Invoiced=purple, Canceled=danger)
function colorForJob(theme: Theme, job: ScheduleJob): { bg: string; border: string; text: string } {
  const paid = String(job.payment_status || '').toLowerCase() === 'paid';
  if (paid) {
    return { bg: theme.success + '1a', border: theme.success, text: theme.success };
  }
  const tone = theme[statusMeta(job.status).tone];
  return { bg: tone + '1a', border: tone, text: tone };
}

function crewColor(theme: Theme, name: string): string {
  const palette = [theme.stageBlue, theme.stageCyan, theme.stageGreen, theme.stageIndigo, theme.stagePurple, theme.stageAmber];
  return palette[hashIndex(name, palette.length)];
}

function dayTint(theme: Theme, dayIndex: number): string {
  // Distinct tint per weekday.
  const palette = [theme.stagePurple, theme.stageBlue, theme.stageCyan, theme.stageGreen, theme.stageAmber, theme.stageIndigo, theme.danger];
  return palette[dayIndex % palette.length];
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

type PlacedCard = {
  job: ScheduleJob;
  crewName: string;
  colIndex: number;
  startHour: number;
  endHour: number;
};

// Auto-lay jobs for a single day across crew columns. For now we don't
// have per-job start/end times — we distribute stacked jobs for the
// same crew member evenly starting at 8 AM, 2-hour default slot.
function layoutJobs(jobs: ScheduleJob[]): {
  cards: PlacedCard[];
  allCrew: string[];  // stable ordered list (first seen first)
} {
  const perCrew = new Map<string, ScheduleJob[]>();
  const seenOrder: string[] = [];
  for (const j of jobs) {
    const people = j.crew && j.crew.length > 0 ? j.crew.map(c => c.name) : ['Unassigned'];
    for (const name of people) {
      if (!perCrew.has(name)) { perCrew.set(name, []); seenOrder.push(name); }
      perCrew.get(name)!.push(j);
    }
  }
  const cards: PlacedCard[] = [];
  for (const name of seenOrder) {
    const colIndex = seenOrder.indexOf(name);
    const list = perCrew.get(name) || [];
    let cursor = 8; // 8 AM
    for (const j of list) {
      const duration = 2; // hours (placeholder until schema has real durations)
      const startHour = cursor;
      const endHour = Math.min(HOUR_END, startHour + duration);
      cards.push({
        job: j,
        crewName: name,
        colIndex,
        startHour,
        endHour,
      });
      cursor = endHour; // next job stacks directly below
      if (cursor >= HOUR_END) cursor = HOUR_START + 1;
    }
  }
  return { cards, allCrew: seenOrder };
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

  const jobsForSelected = jobs.filter(j => j.scheduled_date === selected);
  const jobsCountPerDay: Record<string, number> = {};
  for (const j of jobs) {
    const k = j.scheduled_date || '';
    if (!k) continue;
    jobsCountPerDay[k] = (jobsCountPerDay[k] || 0) + 1;
  }
  const { cards, allCrew } = useMemo(() => layoutJobs(jobsForSelected), [jobsForSelected]);
  const gridWidth = Math.max(allCrew.length, 1) * COL_WIDTH;
  const gridHeight = (HOUR_END - HOUR_START) * HOUR_HEIGHT;

  return (
    <View style={styles.container}>
      {/* Week nav */}
      <View style={styles.weekNav}>
        <TouchableOpacity
          onPress={() => { const d = new Date(anchor); d.setDate(d.getDate() - 7); setAnchor(d); }}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.weekLabel}>
          {rangeStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {rangeEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </Text>
        <TouchableOpacity
          onPress={() => { const d = new Date(anchor); d.setDate(d.getDate() + 7); setAnchor(d); }}
          hitSlop={12}
        >
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Week strip with colored day tints */}
      <View style={styles.weekStrip}>
        {week.map((d, i) => {
          const key = isoDay(d);
          const selectedDay = key === selected;
          const today = isoDay(new Date()) === key;
          const tint = dayTint(theme, i);
          const count = jobsCountPerDay[key] || 0;
          return (
            <TouchableOpacity
              key={i}
              style={[
                styles.dayCell,
                selectedDay && { backgroundColor: tint + '22', borderColor: tint + '66' },
              ]}
              onPress={() => setSelected(key)}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.dayLetter,
                { color: selectedDay ? tint : theme.textMuted },
              ]}>
                {DAY_LETTERS[i]}
              </Text>
              <Text style={[
                styles.dayNumber,
                { color: selectedDay ? tint : (today ? theme.textPrimary : theme.textSecondary) },
                (selectedDay || today) && { fontWeight: '800' },
              ]}>
                {d.getDate()}
              </Text>
              <View style={styles.dayDotRow}>
                {count > 0 ? (
                  <View style={[styles.dayDot, { backgroundColor: tint }]} />
                ) : <View style={{ height: 4 }} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.selectedHeader}>
        <Text style={styles.selectedLabel}>{friendlyDayLabel(selected)}</Text>
        <Text style={styles.selectedCount}>
          {jobsForSelected.length === 0
            ? 'No jobs'
            : `${jobsForSelected.length} job${jobsForSelected.length === 1 ? '' : 's'} · ${allCrew.length} crew`}
        </Text>
      </View>

      {loading && jobsForSelected.length === 0 && jobs.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} /></View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.accent} />}
        >
          <View style={{ flexDirection: 'row' }}>
            {/* Fixed time gutter */}
            <View style={[styles.gutter, { width: GUTTER_WIDTH, height: gridHeight + 44 }]}>
              <View style={{ height: 44 }} />{/* spacer to line up with crew header row */}
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

            {/* Horizontal-scrolling crew columns */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              bounces
              style={{ flex: 1 }}
            >
              <View style={{ width: gridWidth }}>
                {/* Crew header row */}
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

                {/* Grid cells + cards layer */}
                <View style={{ width: gridWidth, height: gridHeight, position: 'relative' }}>
                  {/* Background hour lines + column dividers */}
                  {Array.from({ length: HOUR_END - HOUR_START }).map((_, i) => (
                    <View
                      key={`hl-${i}`}
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
                      style={{
                        position: 'absolute',
                        top: 0, bottom: 0, left: i * COL_WIDTH,
                        width: StyleSheet.hairlineWidth,
                        backgroundColor: theme.border,
                      }}
                    />
                  ))}

                  {/* Empty-day hint centered in the grid */}
                  {jobsForSelected.length === 0 ? (
                    <View style={styles.gridHint} pointerEvents="none">
                      <Ionicons name="calendar-outline" size={24} color={theme.textMuted} />
                      <Text style={styles.gridHintTitle}>Nothing scheduled</Text>
                      <Text style={styles.gridHintSub}>
                        {jobs.length > 0
                          ? 'Tap a dotted day above to jump to jobs'
                          : 'Set scheduled dates on jobs to see them here'}
                      </Text>
                    </View>
                  ) : null}

                  {/* Job cards */}
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
                        onPress={() => router.push({ pathname: '/(crew)/job/[id]', params: { id: c.job.id } } as any)}
                        style={[
                          styles.card,
                          {
                            top, height, left, width: w,
                            backgroundColor: p.bg,
                            borderLeftColor: p.border,
                          },
                        ]}
                      >
                        <Text style={[styles.cardTitle, { color: theme.textPrimary }]} numberOfLines={2}>
                          {c.job.name}
                        </Text>
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
      )}
    </View>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 30 },

    weekNav: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6,
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

    empty: { paddingTop: 60, alignItems: 'center', gap: 8 },
    emptyTitle: { color: t.textPrimary, fontSize: 16, fontWeight: '700' },
    emptySub: { color: t.textMuted, fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },

    gridHint: {
      position: 'absolute',
      top: 40, left: 16, right: 16,
      alignItems: 'center', gap: 6,
    },
    gridHintTitle: { color: t.textPrimary, fontSize: 14, fontWeight: '700' },
    gridHintSub: { color: t.textMuted, fontSize: 12, textAlign: 'center' },
  });
}
