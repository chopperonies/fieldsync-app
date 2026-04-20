import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl, TouchableOpacity
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mobileGet } from '../../lib/mobileApi';
import { router } from 'expo-router';
import { getUser } from '../../lib/storage';

type HomeJob = {
  id: string;
  name: string;
  address?: string | null;
  status: string;
  updated_at?: string | null;
  client_name?: string | null;
  crew: string[];
  pendingSupplies: number;
  stage_name?: string | null;
  stage_color?: string | null;
};

type Activity = {
  id: string;
  type: string | null;
  message: string | null;
  photo_url: string | null;
  created_at: string;
  job_id: string;
  job_name: string | null;
  employee_name: string | null;
};

interface Stats {
  activeJobs: number;
  crewOnSite: number;
  pendingSupplies: number;
  bottlenecksToday: number;
  todayJobs?: HomeJob[];
  stuckJobs?: HomeJob[];
  recentActivity?: Activity[];
  scheduleByDay?: Record<string, number>;
  jobBreakdown: { id: string; name: string; crew: number; pendingSupplies: number }[];
}

interface Financials {
  revenueMtd: number;
  outstanding: number;
  collected: number;
  paidThisWeek: number;
}

function shortMoney(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `$${(value / 1000).toFixed(0)}k`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function weekStripDays(today: Date): Date[] {
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay());
  sunday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
}

export default function OwnerOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [financials, setFinancials] = useState<Financials | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [s, f] = await Promise.all([
        mobileGet<Stats>('/api/mobile/owner/home'),
        mobileGet<Financials>('/api/mobile/owner/financials').catch(() => null),
      ]);
      setStats(s);
      if (f) setFinancials(f);
    } catch (e) {
      // Keep last-good on failure
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    getUser().then(u => {
      if (u?.name) setFirstName(String(u.name).split(' ')[0] || null);
    });
  }, [loadData]);

  const safe: Stats = stats || {
    activeJobs: 0, crewOnSite: 0, pendingSupplies: 0, bottlenecksToday: 0,
    jobBreakdown: [], todayJobs: [], stuckJobs: [], recentActivity: [], scheduleByDay: {},
  };
  const scheduleByDay = safe.scheduleByDay || {};
  const today = new Date();
  const dateLabel = today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const greeting = (() => {
    const h = today.getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  const days = weekStripDays(today);
  const todayIdx = today.getDay();

  // Smart hero card: stuck > 0 → attention; no active → new job CTA; else all-clear
  const hero = (() => {
    const stuck = safe.stuckJobs || [];
    if (stuck.length > 0) {
      return {
        kind: 'attention' as const,
        title: stuck.length === 1 ? 'Needs attention' : `${stuck.length} jobs need attention`,
        body: stuck[0].name + (stuck.length > 1 ? ` · +${stuck.length - 1} more` : ''),
        cta: 'Review',
        onPress: () => router.push('/(owner)/jobs?filter=active' as any),
      };
    }
    if (safe.activeJobs === 0) {
      return {
        kind: 'empty' as const,
        title: 'Let\'s get started',
        body: 'No active jobs right now. Create one to get on the board.',
        cta: '+ Schedule a job',
        onPress: () => router.push('/(owner)/jobs?open=new' as any),
      };
    }
    return {
      kind: 'running' as const,
      title: 'All systems go',
      body: `${safe.activeJobs} active · ${safe.crewOnSite} on site`,
      cta: 'View jobs',
      onPress: () => router.push('/(owner)/jobs?filter=active' as any),
    };
  })();

  // To-do: stuck jobs + pending supplies. Capped to keep it actionable.
  const todoItems: { id: string; label: string; sub: string; icon: any; color: string; onPress: () => void }[] = [];
  (safe.stuckJobs || []).slice(0, 3).forEach(j => todoItems.push({
    id: 'stuck-' + j.id,
    label: j.name,
    sub: `Stuck ${j.updated_at ? timeAgo(j.updated_at) : ''}${j.stage_name ? ` · ${j.stage_name}` : ''}`,
    icon: 'warning-outline',
    color: '#f59e0b',
    onPress: () => router.push({ pathname: '/(owner)/job/[id]', params: { id: j.id } } as any),
  }));
  if (safe.pendingSupplies > 0) todoItems.push({
    id: 'supplies',
    label: `${safe.pendingSupplies} pending supply ${safe.pendingSupplies === 1 ? 'request' : 'requests'}`,
    sub: 'Mark ordered or delivered from Supplies',
    icon: 'cube-outline',
    color: '#0ea5e9',
    onPress: () => router.push('/(owner)/supplies' as any),
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading || refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#0ea5e9" />}
    >
      <View style={styles.header}>
        <Text style={styles.date}>{dateLabel}</Text>
        <Text style={styles.greeting}>{greeting}{firstName ? `, ${firstName}` : ''}</Text>
      </View>

      {/* Smart hero card */}
      <TouchableOpacity
        style={[
          styles.hero,
          hero.kind === 'attention' && { backgroundColor: '#1a1006', borderColor: '#f59e0b55' },
          hero.kind === 'empty' && { backgroundColor: '#0a1a2e', borderColor: '#0ea5e955' },
          hero.kind === 'running' && { backgroundColor: '#062017', borderColor: '#16a34a55' },
        ]}
        onPress={hero.onPress}
        activeOpacity={0.85}
      >
        <View style={{ flex: 1 }}>
          <Text style={[
            styles.heroTitle,
            hero.kind === 'attention' && { color: '#fcd34d' },
            hero.kind === 'running' && { color: '#86efac' },
            hero.kind === 'empty' && { color: '#7dd3fc' },
          ]}>{hero.title}</Text>
          <Text style={styles.heroBody}>{hero.body}</Text>
        </View>
        <Text style={[
          styles.heroCta,
          hero.kind === 'attention' && { color: '#fcd34d' },
          hero.kind === 'running' && { color: '#86efac' },
          hero.kind === 'empty' && { color: '#7dd3fc' },
        ]}>{hero.cta} ›</Text>
      </TouchableOpacity>

      {/* Week strip — taps through to Schedule on the chosen day */}
      <View style={styles.weekStrip}>
        {days.map((d, i) => {
          const isToday = i === todayIdx;
          const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const count = scheduleByDay[iso] || 0;
          return (
            <TouchableOpacity
              key={i}
              style={styles.dayCell}
              onPress={() => router.push(`/(owner)/jobs?day=${iso}` as any)}
              activeOpacity={0.7}
            >
              <Text style={styles.dayLetter}>{DAY_LETTERS[i]}</Text>
              <View style={[styles.dayBubble, isToday && styles.dayBubbleToday]}>
                <Text style={[styles.dayNumber, isToday && styles.dayNumberToday]}>{d.getDate()}</Text>
              </View>
              <View style={[styles.dayDot, count > 0 && styles.dayDotActive]} />
            </TouchableOpacity>
          );
        })}
      </View>

      {/* To do */}
      {todoItems.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>To do</Text>
          {todoItems.map(t => (
            <TouchableOpacity key={`${t.id}`} style={styles.todoRow} onPress={t.onPress} activeOpacity={0.75}>
              <View style={[styles.todoIcon, { backgroundColor: t.color + '22', borderColor: t.color + '55' }]}>
                <Ionicons name={t.icon} size={18} color={t.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.todoLabel}>{t.label}</Text>
                <Text style={styles.todoSub}>{t.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#555" />
            </TouchableOpacity>
          ))}
        </>
      )}

      {/* Business health */}
      {financials && (
        <>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>Business health</Text>
            <TouchableOpacity onPress={() => router.push('/(owner)/invoices' as any)}>
              <Text style={styles.sectionLink}>View all ›</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.healthCard}>
            <HealthRow label="Revenue this month" sub="MTD" value={shortMoney(financials.revenueMtd)} />
            <HealthRow label="Outstanding" sub="Awaiting payment" value={shortMoney(financials.outstanding)} valueColor="#facc15" />
            <HealthRow label="Paid in the last 7 days" sub="Cash collected" value={shortMoney(financials.paidThisWeek)} valueColor="#4ade80" last />
          </View>
        </>
      )}

      {/* Today's active jobs */}
      <Text style={styles.sectionLabel}>Today</Text>
      {(safe.todayJobs?.length ?? 0) === 0 && !loading ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No active jobs right now.</Text>
        </View>
      ) : (
        safe.todayJobs!.map(j => (
          <TouchableOpacity
            key={j.id}
            style={styles.jobCard}
            onPress={() => router.push({ pathname: '/(owner)/job/[id]', params: { id: j.id } } as any)}
            activeOpacity={0.75}
          >
            <View style={styles.jobTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.jobName}>{j.name}</Text>
                {j.client_name ? <Text style={styles.clientLine}>{j.client_name}</Text> : null}
              </View>
              {j.stage_name && (
                <View style={[styles.stagePill, { borderColor: (j.stage_color || '#0ea5e9') + '55', backgroundColor: (j.stage_color || '#0ea5e9') + '22' }]}>
                  <Text style={[styles.stagePillText, { color: j.stage_color || '#0ea5e9' }]}>{j.stage_name}</Text>
                </View>
              )}
            </View>
            <View style={styles.jobMeta}>
              <View style={styles.metaChip}>
                <Ionicons name="people-outline" size={12} color="#888" />
                <Text style={styles.metaChipText}>
                  {j.crew.length > 0 ? j.crew.slice(0, 2).join(', ') + (j.crew.length > 2 ? ` +${j.crew.length - 2}` : '') : 'Unassigned'}
                </Text>
              </View>
              {j.pendingSupplies > 0 && (
                <View style={styles.metaChip}>
                  <Ionicons name="cube-outline" size={12} color="#0ea5e9" />
                  <Text style={[styles.metaChipText, { color: '#0ea5e9' }]}>{j.pendingSupplies} supplies</Text>
                </View>
              )}
              {j.updated_at && (
                <Text style={styles.metaTime}>{timeAgo(j.updated_at)} ago</Text>
              )}
            </View>
          </TouchableOpacity>
        ))
      )}

      {/* Recent activity across jobs */}
      {safe.recentActivity && safe.recentActivity.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Recent activity</Text>
          {safe.recentActivity.slice(0, 8).map(a => {
            const iconName =
              a.type === 'photo'      ? 'camera-outline' :
              a.type === 'note'       ? 'create-outline' :
              a.type === 'check_in'   ? 'location-outline' :
              a.type === 'check_out'  ? 'log-out-outline' :
              a.type === 'bottleneck' ? 'alert-circle-outline' :
                                        'ellipse-outline';
            const iconColor =
              a.type === 'bottleneck' ? '#ef4444' :
              a.type === 'photo'      ? '#a78bfa' :
              a.type === 'check_in'   ? '#4ade80' :
                                        '#0ea5e9';
            const label =
              a.type === 'photo'      ? 'Photo uploaded' :
              a.type === 'note'       ? (a.message || 'Note') :
              a.type === 'check_in'   ? 'Checked in' :
              a.type === 'check_out'  ? 'Checked out' :
              a.type === 'bottleneck' ? 'Flagged a bottleneck' :
                                        (a.message || 'Update');
            return (
              <TouchableOpacity
                key={a.id}
                style={styles.activityRow}
                onPress={() => router.push({ pathname: '/(owner)/job/[id]', params: { id: a.job_id } } as any)}
                activeOpacity={0.75}
              >
                <View style={[styles.activityIcon, { backgroundColor: iconColor + '22', borderColor: iconColor + '55' }]}>
                  <Ionicons name={iconName as any} size={16} color={iconColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityLine} numberOfLines={2}>{label}</Text>
                  <Text style={styles.activitySub}>
                    {a.job_name || 'Job'} · {a.employee_name || 'Crew'} · {timeAgo(a.created_at)} ago
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

function HealthRow({
  label, sub, value, valueColor, last,
}: { label: string; sub?: string; value: string; valueColor?: string; last?: boolean }) {
  return (
    <View style={[styles.healthRow, last && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.healthLabel}>{label}</Text>
        {sub && <Text style={styles.healthSub}>{sub}</Text>}
      </View>
      <Text style={[styles.healthValue, { color: valueColor || '#fff' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 16, gap: 14, paddingBottom: 140 },

  header: { marginBottom: 4 },
  date: { color: '#888', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  greeting: { color: '#fff', fontSize: 28, fontWeight: '800' },

  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e',
    borderRadius: 16, padding: 16,
  },
  heroTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  heroBody: { color: '#bbb', fontSize: 13, marginTop: 4, lineHeight: 18 },
  heroCta: { color: '#0ea5e9', fontSize: 13, fontWeight: '800' },

  weekStrip: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e',
    borderRadius: 16, paddingVertical: 10, paddingHorizontal: 8,
  },
  dayCell: { flex: 1, alignItems: 'center', gap: 4 },
  dayLetter: { color: '#666', fontSize: 11, fontWeight: '700' },
  dayBubble: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  dayBubbleToday: { backgroundColor: '#0ea5e9' },
  dayNumber: { color: '#bbb', fontSize: 14, fontWeight: '700' },
  dayNumberToday: { color: '#000', fontWeight: '800' },
  dayDot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: 'transparent', marginTop: 4,
  },
  dayDotActive: { backgroundColor: '#0ea5e9' },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  sectionLabel: { color: '#ddd', fontSize: 14, fontWeight: '800', marginTop: 6 },
  sectionLink: { color: '#0ea5e9', fontSize: 13, fontWeight: '700' },

  todoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e',
    borderRadius: 12, padding: 12,
  },
  todoIcon: {
    width: 34, height: 34, borderRadius: 10, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  todoLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
  todoSub: { color: '#888', fontSize: 12, marginTop: 2 },

  healthCard: {
    backgroundColor: '#111', borderRadius: 16, borderWidth: 1, borderColor: '#1e1e1e',
    paddingHorizontal: 14,
  },
  healthRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1e1e1e',
  },
  healthLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
  healthSub: { color: '#666', fontSize: 12, marginTop: 2 },
  healthValue: { fontSize: 20, fontWeight: '800' },

  jobCard: {
    backgroundColor: '#111', borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: '#1e1e1e',
  },
  jobTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  jobName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  clientLine: { color: '#888', fontSize: 12, marginTop: 2 },
  stagePill: {
    borderWidth: 1, borderRadius: 14, paddingVertical: 3, paddingHorizontal: 10,
  },
  stagePillText: { fontSize: 11, fontWeight: '700' },
  jobMeta: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10,
    flexWrap: 'wrap',
  },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaChipText: { color: '#888', fontSize: 12, fontWeight: '600' },
  metaTime: { color: '#555', fontSize: 11, marginLeft: 'auto' },

  emptyCard: {
    backgroundColor: '#111', borderRadius: 12, borderWidth: 1, borderColor: '#1e1e1e',
    padding: 18, alignItems: 'center',
  },
  emptyText: { color: '#666', fontSize: 14 },

  activityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e',
    borderRadius: 12, padding: 12,
  },
  activityIcon: {
    width: 32, height: 32, borderRadius: 10, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  activityLine: { color: '#fff', fontSize: 13, fontWeight: '600' },
  activitySub: { color: '#888', fontSize: 11, marginTop: 2 },
});
