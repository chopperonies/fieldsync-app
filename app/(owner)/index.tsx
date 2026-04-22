import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  RefreshControl, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mobileGet } from '../../lib/mobileApi';
import { router } from 'expo-router';
import { getUser } from '../../lib/storage';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import { SectionHeader, Row, Divider, RowAvatar, StatusChip } from '../../components/Flat';
import ClockInCard from '../../components/ClockInCard';
import PunchMap, { MapPin } from '../../components/PunchMap';
import ProgressGauge from '../../components/ProgressGauge';
import { useRole, canSeeFinancials } from '../../lib/useRole';

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

export default function OwnerOverview() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const role = useRole();
  const showFinancials = canSeeFinancials(role);
  const showCrewPins = role === 'owner' || role === 'manager';

  const [stats, setStats] = useState<Stats | null>(null);
  const [financials, setFinancials] = useState<Financials | null>(null);
  const [crewPins, setCrewPins] = useState<MapPin[]>([]);
  const [progress, setProgress] = useState<{ completed: number; total: number }>({ completed: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(null);

  const [revealed, setRevealed] = useState(false);

  const loadCrewPins = useCallback(async () => {
    try {
      if (showCrewPins) {
        const data = await mobileGet<{ pins: Array<{ name?: string; kind: 'in' | 'out'; lat: number; lng: number; at?: string; active?: boolean }> }>(
          '/api/mobile/owner/crew-pins'
        );
        const pins: MapPin[] = (data?.pins || []).map(p => ({
          lat: p.lat,
          lng: p.lng,
          kind: p.kind,
          name: p.name,
          label: (p.name || '').charAt(0).toUpperCase(),
          at: p.at,
          active: p.active,
        }));
        setCrewPins(pins);
      } else {
        // Crew-only user → show their own pins from clock-state instead.
        const data = await mobileGet<{ pins: Array<{ kind: 'in' | 'out'; lat: number; lng: number; at?: string }> }>(
          '/api/mobile/me/clock-state'
        );
        setCrewPins((data?.pins || []).map(p => ({ lat: p.lat, lng: p.lng, kind: p.kind, at: p.at })));
      }
    } catch {
      setCrewPins([]);
    }
  }, [showCrewPins]);

  const loadProgress = useCallback(async () => {
    try {
      const data = await mobileGet<{ completed: number; total: number }>('/api/mobile/me/today-progress');
      setProgress({ completed: data?.completed || 0, total: data?.total || 0 });
    } catch {
      setProgress({ completed: 0, total: 0 });
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      const tasks: Array<Promise<unknown>> = [
        mobileGet<Stats>('/api/mobile/owner/home').then(setStats).catch(() => null),
        loadCrewPins(),
        loadProgress(),
      ];
      if (showFinancials) {
        tasks.push(
          mobileGet<Financials>('/api/mobile/owner/financials')
            .then(setFinancials)
            .catch(() => null),
        );
      }
      await Promise.all(tasks);
    } catch {
      // Keep last-good on failure
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadCrewPins, loadProgress, showFinancials]);

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
  const today = new Date();
  const dateLabel = today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const greeting = (() => {
    const h = today.getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  // To-do items: stuck jobs + pending supplies flagged at a glance
  const todoItems: Array<{
    id: string; label: string; sub: string; icon: any; color: string; onPress: () => void;
  }> = [];
  (safe.stuckJobs || []).slice(0, 3).forEach(j => todoItems.push({
    id: 'stuck-' + j.id,
    label: j.name,
    sub: `Stuck ${j.updated_at ? timeAgo(j.updated_at) : ''}${j.stage_name ? ` · ${j.stage_name}` : ''}`,
    icon: 'alert-circle-outline',
    color: theme.warning,
    onPress: () => router.push({ pathname: '/(owner)/job/[id]', params: { id: j.id } } as any),
  }));
  if (safe.pendingSupplies > 0) todoItems.push({
    id: 'supplies',
    label: `${safe.pendingSupplies} pending supply ${safe.pendingSupplies === 1 ? 'request' : 'requests'}`,
    sub: 'Tap to review in Supplies',
    icon: 'cube-outline',
    color: theme.accent,
    onPress: () => router.push('/(owner)/supplies' as any),
  });

  const todayJobs = safe.todayJobs || [];
  const recent = safe.recentActivity || [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading || refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={theme.accent} />}
    >
      <View style={styles.header}>
        <Text style={styles.date}>{dateLabel}</Text>
        <Text style={styles.greeting}>
          {greeting}{firstName ? `, ${firstName}` : ''}
        </Text>
      </View>

      <ClockInCard onChange={() => { loadCrewPins(); loadProgress(); }} />

      <ProgressGauge completed={progress.completed} total={progress.total} />

      {showCrewPins && crewPins.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.crewStrip}
        >
          {crewPins
            .slice()
            .sort((a, b) => Number(!!b.active) - Number(!!a.active))
            .map((p, i) => (
              <View
                key={`${p.name || i}-${i}`}
                style={[
                  styles.crewChip,
                  p.active
                    ? { backgroundColor: theme.successMuted, borderColor: theme.success + '55' }
                    : { backgroundColor: theme.surfaceInset, borderColor: 'transparent' },
                ]}
              >
                <View style={[
                  styles.crewDot,
                  { backgroundColor: p.active ? theme.success : theme.textMuted },
                ]} />
                <Text style={[
                  styles.crewChipText,
                  { color: p.active ? theme.success : theme.textSecondary },
                ]}>
                  {p.name || 'Crew'}
                </Text>
              </View>
            ))}
        </ScrollView>
      ) : null}
      <PunchMap pins={crewPins} emptyLabel={showCrewPins ? 'No crew clock-ins yet today' : 'Clock in to drop a pin'} />


      {todoItems.length > 0 && (
        <>
          <SectionHeader label="To do" hint={`${todoItems.length}`} />
          {todoItems.map((t, i) => (
            <View key={t.id}>
              {i > 0 ? <Divider inset={64} /> : null}
              <Row
                leading={<RowAvatar icon={t.icon} tint={t.color} />}
                title={t.label}
                subtitle={t.sub}
                trailing={<Ionicons name="chevron-forward" size={16} color={theme.textMuted} />}
                onPress={t.onPress}
              />
            </View>
          ))}
        </>
      )}

      {financials && showFinancials && (
        <>
          <SectionHeader
            label="Business health"
            right={revealed ? 'Hide' : 'Reveal'}
            onPressRight={() => setRevealed(v => !v)}
          />
          <HealthRow theme={theme} label="Revenue this month" sub="MTD" value={revealed ? shortMoney(financials.revenueMtd) : '$•••'} muted={!revealed} />
          <Divider inset={16} />
          <HealthRow theme={theme} label="Outstanding" sub="Awaiting payment" value={revealed ? shortMoney(financials.outstanding) : '$•••'} valueColor={revealed ? theme.warning : undefined} muted={!revealed} />
          <Divider inset={16} />
          <HealthRow theme={theme} label="Paid in the last 7 days" sub="Cash collected" value={revealed ? shortMoney(financials.paidThisWeek) : '$•••'} valueColor={revealed ? theme.success : undefined} muted={!revealed} />
        </>
      )}

      <SectionHeader
        label="Today"
        hint={todayJobs.length > 0 ? `${todayJobs.length}` : undefined}
        right={todayJobs.length > 3 ? 'View all' : undefined}
        onPressRight={todayJobs.length > 3 ? () => router.push('/(owner)/jobs?filter=active' as any) : undefined}
      />
      {todayJobs.length === 0 && !loading ? (
        <Text style={styles.emptyText}>No active jobs right now.</Text>
      ) : (
        todayJobs.slice(0, 3).map((j, i) => (
          <View key={j.id}>
            {i > 0 ? <Divider inset={64} /> : null}
            <Row
              leading={<RowAvatar icon="hammer-outline" tint={theme.accent} />}
              title={j.name}
              subtitle={[j.client_name, j.crew.length > 0 ? j.crew.slice(0, 2).join(', ') + (j.crew.length > 2 ? ` +${j.crew.length - 2}` : '') : 'Unassigned'].filter(Boolean).join(' · ')}
              trailing={
                <>
                  {j.pendingSupplies > 0 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Ionicons name="cube-outline" size={12} color={theme.accent} />
                      <Text style={{ color: theme.accent, fontSize: 11, fontWeight: '700' }}>{j.pendingSupplies}</Text>
                    </View>
                  ) : null}
                  {j.stage_name ? <StatusChip label={j.stage_name} tint={j.stage_color || theme.accent} /> : null}
                </>
              }
              onPress={() => router.push({ pathname: '/(owner)/job/[id]', params: { id: j.id } } as any)}
            />
          </View>
        ))
      )}

      {recent.length > 0 && (
        <>
          <SectionHeader label="Recent activity" hint={`${recent.length}`} />
          {recent.slice(0, 5).map((a, i) => {
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
              <View key={a.id}>
                {i > 0 ? <Divider inset={64} /> : null}
                <Row
                  leading={<RowAvatar icon={iconName} tint={iconColor} />}
                  title={label}
                  subtitle={`${a.job_name || 'Job'} · ${a.employee_name || 'Crew'} · ${timeAgo(a.created_at)} ago`}
                  onPress={() => router.push({ pathname: '/(owner)/job/[id]', params: { id: a.job_id } } as any)}
                />
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

function HealthRow({
  theme, label, sub, value, valueColor, muted,
}: { theme: Theme; label: string; sub?: string; value: string; valueColor?: string; muted?: boolean }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 14,
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
        fontVariant: ['tabular-nums'],
      }}>{value}</Text>
    </View>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    content: { paddingBottom: 140 },

    header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
    date: { color: t.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 4 },
    greeting: { color: t.textPrimary, fontSize: 28, fontWeight: '800' },

    emptyText: { color: t.textMuted, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14 },

    crewStrip: {
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 2,
      gap: 6,
      flexDirection: 'row',
    },
    crewChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      height: 28,
      paddingHorizontal: 10,
      borderRadius: 999,
      borderWidth: 1,
    },
    crewDot: { width: 7, height: 7, borderRadius: 4 },
    crewChipText: { fontSize: 12, fontWeight: '700' },
  });
}
