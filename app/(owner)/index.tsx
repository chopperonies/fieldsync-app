import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl, TouchableOpacity
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mobileGet } from '../../lib/mobileApi';
import { router } from 'expo-router';
import { getUser } from '../../lib/storage';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';

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
  const theme = useTheme();
  const styles = makeStyles(theme);

  const [stats, setStats] = useState<Stats | null>(null);
  const [financials, setFinancials] = useState<Financials | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(null);

  // Business Health uses blur/reveal — numbers show as $••• by default.
  // Today + Recent Activity stay visible but truncated with "View all".
  const [revealed, setRevealed] = useState(false);

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

  // Hero variants keyed by state.
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

  // Hero color by kind
  const heroColors = (() => {
    if (hero.kind === 'attention') return { bg: theme.warningMuted, border: theme.warning, tint: theme.warning };
    if (hero.kind === 'empty')     return { bg: theme.accentSoft,    border: theme.accent,  tint: theme.accent };
    return                                { bg: theme.successMuted,  border: theme.success, tint: theme.success };
  })();

  // To-do items
  const todoItems: { id: string; label: string; sub: string; icon: any; color: string; onPress: () => void }[] = [];
  (safe.stuckJobs || []).slice(0, 3).forEach(j => todoItems.push({
    id: 'stuck-' + j.id,
    label: j.name,
    sub: `Stuck ${j.updated_at ? timeAgo(j.updated_at) : ''}${j.stage_name ? ` · ${j.stage_name}` : ''}`,
    icon: 'warning-outline',
    color: theme.warning,
    onPress: () => router.push({ pathname: '/(owner)/job/[id]', params: { id: j.id } } as any),
  }));
  if (safe.pendingSupplies > 0) todoItems.push({
    id: 'supplies',
    label: `${safe.pendingSupplies} pending supply ${safe.pendingSupplies === 1 ? 'request' : 'requests'}`,
    sub: 'Mark ordered or delivered from Supplies',
    icon: 'cube-outline',
    color: theme.accent,
    onPress: () => router.push('/(owner)/supplies' as any),
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading || refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={theme.accent} />}
    >
      <View style={styles.header}>
        <Text style={styles.date}>{dateLabel}</Text>
        <Text style={styles.greeting}>{greeting}{firstName ? `, ${firstName}` : ''}</Text>
      </View>

      <TouchableOpacity
        style={[styles.hero, { backgroundColor: heroColors.bg, borderColor: heroColors.border + '55' }]}
        onPress={hero.onPress}
        activeOpacity={0.85}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.heroTitle, { color: heroColors.tint }]}>{hero.title}</Text>
          <Text style={styles.heroBody}>{hero.body}</Text>
        </View>
        <Text style={[styles.heroCta, { color: heroColors.tint }]}>{hero.cta} ›</Text>
      </TouchableOpacity>

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
              <View style={[styles.dayBubble, isToday && { backgroundColor: theme.accent }]}>
                <Text style={[styles.dayNumber, isToday && { color: theme.accentContrast, fontWeight: '800' }]}>{d.getDate()}</Text>
              </View>
              <View style={[styles.dayDot, count > 0 && { backgroundColor: theme.accent }]} />
            </TouchableOpacity>
          );
        })}
      </View>

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
              <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
            </TouchableOpacity>
          ))}
        </>
      )}

      {financials && (
        <>
          <TouchableOpacity
            style={styles.collapsibleHeader}
            onPress={() => setRevealed(v => !v)}
            activeOpacity={0.7}
          >
            <Text style={styles.sectionLabel}>Business health</Text>
            <View style={[styles.revealPill, { backgroundColor: theme.accentMuted, borderColor: theme.accent + '55' }]}>
              <Ionicons name={revealed ? 'eye-off-outline' : 'eye-outline'} size={14} color={theme.accent} />
              <Text style={[styles.revealPillText, { color: theme.accent }]}>{revealed ? 'Hide' : 'Reveal'}</Text>
            </View>
          </TouchableOpacity>
          <View style={styles.healthCard}>
            <HealthRow theme={theme} label="Revenue this month" sub="MTD" value={revealed ? shortMoney(financials.revenueMtd) : '$•••'} muted={!revealed} />
            <HealthRow theme={theme} label="Outstanding" sub="Awaiting payment" value={revealed ? shortMoney(financials.outstanding) : '$•••'} valueColor={revealed ? theme.warning : undefined} muted={!revealed} />
            <HealthRow theme={theme} label="Paid in the last 7 days" sub="Cash collected" value={revealed ? shortMoney(financials.paidThisWeek) : '$•••'} valueColor={revealed ? theme.success : undefined} muted={!revealed} last />
          </View>
        </>
      )}

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>
          Today{(safe.todayJobs?.length ?? 0) > 0 ? ` · ${safe.todayJobs!.length}` : ''}
        </Text>
        {(safe.todayJobs?.length ?? 0) > 3 && (
          <TouchableOpacity onPress={() => router.push('/(owner)/jobs?filter=active' as any)}>
            <Text style={styles.sectionLink}>View all ›</Text>
          </TouchableOpacity>
        )}
      </View>
      {(safe.todayJobs?.length ?? 0) === 0 && !loading ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No active jobs right now.</Text>
        </View>
      ) : (
        safe.todayJobs!.slice(0, 3).map(j => (
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
                <View style={[styles.stagePill, { borderColor: (j.stage_color || theme.accent) + '55', backgroundColor: (j.stage_color || theme.accent) + '22' }]}>
                  <Text style={[styles.stagePillText, { color: j.stage_color || theme.accent }]}>{j.stage_name}</Text>
                </View>
              )}
            </View>
            <View style={styles.jobMeta}>
              <View style={styles.metaChip}>
                <Ionicons name="people-outline" size={12} color={theme.textSecondary} />
                <Text style={styles.metaChipText}>
                  {j.crew.length > 0 ? j.crew.slice(0, 2).join(', ') + (j.crew.length > 2 ? ` +${j.crew.length - 2}` : '') : 'Unassigned'}
                </Text>
              </View>
              {j.pendingSupplies > 0 && (
                <View style={styles.metaChip}>
                  <Ionicons name="cube-outline" size={12} color={theme.accent} />
                  <Text style={[styles.metaChipText, { color: theme.accent }]}>{j.pendingSupplies} supplies</Text>
                </View>
              )}
              {j.updated_at && (
                <Text style={styles.metaTime}>{timeAgo(j.updated_at)} ago</Text>
              )}
            </View>
          </TouchableOpacity>
        ))
      )}

      {safe.recentActivity && safe.recentActivity.length > 0 && (
        <>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>
              Recent activity · {safe.recentActivity.length}
            </Text>
          </View>
          {safe.recentActivity.slice(0, 5).map(a => {
            const iconName =
              a.type === 'photo'      ? 'camera-outline' :
              a.type === 'note'       ? 'create-outline' :
              a.type === 'check_in'   ? 'location-outline' :
              a.type === 'check_out'  ? 'log-out-outline' :
              a.type === 'bottleneck' ? 'alert-circle-outline' :
                                        'ellipse-outline';
            const iconColor =
              a.type === 'bottleneck' ? theme.danger :
              a.type === 'photo'      ? theme.stagePurple :
              a.type === 'check_in'   ? theme.success :
              a.type === 'check_out'  ? theme.textMuted :
              a.type === 'note'       ? theme.info :
                                        theme.accent;
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
  theme, label, sub, value, valueColor, last, muted,
}: { theme: Theme; label: string; sub?: string; value: string; valueColor?: string; last?: boolean; muted?: boolean }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 14,
      borderBottomWidth: last ? 0 : 1, borderBottomColor: theme.border,
    }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.textPrimary, fontSize: 14, fontWeight: '600' }}>{label}</Text>
        {sub && <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>{sub}</Text>}
      </View>
      <Text style={{
        fontSize: 20,
        fontWeight: '800',
        color: muted ? theme.textMuted : (valueColor || theme.textPrimary),
        letterSpacing: muted ? 2 : 0,
      }}>{value}</Text>
    </View>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    content: { padding: 16, gap: 14, paddingBottom: 140 },

    header: { marginBottom: 4 },
    date: { color: t.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 4 },
    greeting: { color: t.textPrimary, fontSize: 28, fontWeight: '800' },

    hero: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderWidth: 1,
      borderRadius: 16, padding: 16,
    },
    heroTitle: { fontSize: 15, fontWeight: '800' },
    heroBody: { color: t.textSecondary, fontSize: 13, marginTop: 4, lineHeight: 18 },
    heroCta: { fontSize: 13, fontWeight: '800' },

    weekStrip: {
      flexDirection: 'row', justifyContent: 'space-between',
      backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
      borderRadius: 16, paddingVertical: 10, paddingHorizontal: 8,
    },
    dayCell: { flex: 1, alignItems: 'center', gap: 4 },
    dayLetter: { color: t.textMuted, fontSize: 11, fontWeight: '700' },
    dayBubble: {
      width: 30, height: 30, borderRadius: 15,
      alignItems: 'center', justifyContent: 'center',
    },
    dayNumber: { color: t.textSecondary, fontSize: 14, fontWeight: '700' },
    dayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent', marginTop: 4 },

    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
    sectionLabel: { color: t.textPrimary, fontSize: 14, fontWeight: '800', marginTop: 6 },
    collapsibleHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 6,
    },
    collapsibleRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    collapsibleHint: { color: t.textMuted, fontSize: 11, fontWeight: '600' },
    revealPill: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingVertical: 4, paddingHorizontal: 10,
      borderWidth: 1, borderRadius: 999,
    },
    revealPillText: { fontSize: 12, fontWeight: '800' },
    sectionLink: { color: t.accent, fontSize: 13, fontWeight: '700' },

    todoRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
      borderRadius: 12, padding: 12,
    },
    todoIcon: {
      width: 34, height: 34, borderRadius: 10, borderWidth: 1,
      alignItems: 'center', justifyContent: 'center',
    },
    todoLabel: { color: t.textPrimary, fontSize: 14, fontWeight: '700' },
    todoSub: { color: t.textSecondary, fontSize: 12, marginTop: 2 },

    healthCard: {
      backgroundColor: t.surface, borderRadius: 16, borderWidth: 1, borderColor: t.border,
      paddingHorizontal: 14,
    },

    jobCard: {
      backgroundColor: t.surface, borderRadius: 12,
      padding: 12, borderWidth: 1, borderColor: t.border,
    },
    jobTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    jobName: { color: t.textPrimary, fontSize: 14, fontWeight: '700' },
    clientLine: { color: t.textSecondary, fontSize: 12, marginTop: 2 },
    stagePill: { borderWidth: 1, borderRadius: 14, paddingVertical: 3, paddingHorizontal: 10 },
    stagePillText: { fontSize: 11, fontWeight: '700' },
    jobMeta: {
      flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap',
    },
    metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaChipText: { color: t.textSecondary, fontSize: 12, fontWeight: '600' },
    metaTime: { color: t.textMuted, fontSize: 11, marginLeft: 'auto' },

    emptyCard: {
      backgroundColor: t.surface, borderRadius: 12, borderWidth: 1, borderColor: t.border,
      padding: 18, alignItems: 'center',
    },
    emptyText: { color: t.textSecondary, fontSize: 14 },

    activityRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
      borderRadius: 12, padding: 12,
    },
    activityIcon: {
      width: 32, height: 32, borderRadius: 10, borderWidth: 1,
      alignItems: 'center', justifyContent: 'center',
    },
    activityLine: { color: t.textPrimary, fontSize: 13, fontWeight: '600' },
    activitySub: { color: t.textSecondary, fontSize: 11, marginTop: 2 },
  });
}
