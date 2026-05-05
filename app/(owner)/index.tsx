import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  RefreshControl, TouchableOpacity, Alert, ActivityIndicator, Linking,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileGet, mobilePost } from '../../lib/mobileApi';
import { router } from 'expo-router';
import { getUser } from '../../lib/storage';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import { SectionHeader, Row, Divider, RowAvatar, StatusChip } from '../../components/Flat';
import PunchMap, { MapPin } from '../../components/PunchMap';
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
  const insets = useSafeAreaInsets();
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
  const dateLabel = today.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const greeting = (() => {
    const h = today.getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

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

  const fourthTile = showFinancials
    ? {
        label: 'Paid 7d',
        value: financials ? (revealed ? shortMoney(financials.paidThisWeek) : '$•••') : '—',
        color: revealed && financials ? theme.success : theme.textMuted,
        onPress: financials ? () => setRevealed(v => !v) : undefined,
      }
    : {
        label: 'Bottlenecks',
        value: String(safe.bottlenecksToday),
        color: safe.bottlenecksToday > 0 ? theme.warning : theme.textPrimary,
        onPress: undefined,
      };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading || refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={theme.accent} />}
    >
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.greeting}>
          {greeting}{firstName ? `, ${firstName}` : ''}
        </Text>
        <Text style={styles.date}>{dateLabel}</Text>
      </View>

      <ClockInPill onChange={() => { loadCrewPins(); loadProgress(); }} />

      <View style={styles.statGrid}>
        <View style={styles.statRow}>
          <StatTile theme={theme} label="Active jobs" value={String(safe.activeJobs)} color={theme.accent} />
          <StatTile theme={theme} label="On site" value={String(safe.crewOnSite)} color={theme.success} />
        </View>
        <View style={styles.statRow}>
          <StatTile
            theme={theme}
            label="Done today"
            value={progress.total > 0 ? `${progress.completed}/${progress.total}` : '0'}
            color={theme.info}
          />
          <StatTile
            theme={theme}
            label={fourthTile.label}
            value={fourthTile.value}
            color={fourthTile.color}
            onPress={fourthTile.onPress}
          />
        </View>
      </View>

      {todayJobs.length > 0 && (
        <>
          <SectionHeader
            label="Today"
            hint={`${todayJobs.length}`}
            right={todayJobs.length > 3 ? 'View all' : undefined}
            onPressRight={todayJobs.length > 3 ? () => router.push('/(owner)/jobs?filter=active' as any) : undefined}
          />
          {todayJobs.slice(0, 3).map((j, i) => (
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
          ))}
        </>
      )}

      {crewPins.length > 0 && (
        <>
          <SectionHeader
            label="On the map"
            hint={`${crewPins.filter(p => p.active).length} active`}
          />
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
          <View style={styles.mapWrap}>
            <PunchMap pins={crewPins} emptyLabel="" />
          </View>
        </>
      )}

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

      {recent.length > 0 && (
        <>
          <SectionHeader label="Recent activity" hint={`${recent.length}`} />
          {recent.slice(0, 3).map((a, i) => {
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

      {(role === 'owner' || role === 'manager' || role === 'supervisor') && (
        <DesktopHandoffLink />
      )}
    </ScrollView>
  );
}

function ClockInPill({ onChange }: { onChange?: () => void }) {
  const theme = useTheme();
  const [open, setOpen] = useState<{ started_at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const reload = useCallback(async () => {
    try {
      const data = await mobileGet<{ open: { started_at: string } | null }>('/api/mobile/me/clock-state');
      setOpen(data?.open || null);
    } catch {
      // keep prior state
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  async function getGPS(): Promise<{ lat: number; lng: number } | null> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { lat: loc.coords.latitude, lng: loc.coords.longitude };
    } catch { return null; }
  }

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      const gps = await getGPS();
      await mobilePost(open ? '/api/mobile/clock-out' : '/api/mobile/clock-in', { gps });
      await reload();
      onChange?.();
    } catch (e: any) {
      Alert.alert(open ? 'Could not clock out' : 'Could not clock in', e?.message || 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  const elapsedMs = open ? now - new Date(open.started_at).getTime() : 0;
  const total = Math.max(0, Math.floor(elapsedMs / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const timer = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  return (
    <View style={{
      marginHorizontal: 16,
      marginTop: 12,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: open ? theme.success + '55' : theme.border,
      backgroundColor: open ? theme.successMuted : theme.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    }}>
      <View style={{
        width: 8, height: 8, borderRadius: 4,
        backgroundColor: open ? theme.success : theme.textMuted,
      }} />
      <Text style={{
        flex: 1,
        color: open ? theme.success : theme.textSecondary,
        fontSize: 13,
        fontWeight: '700',
        fontVariant: ['tabular-nums'],
      }}>
        {open ? `Clocked in · ${timer}` : 'Clock in to start tracking time'}
      </Text>
      <TouchableOpacity
        onPress={toggle}
        disabled={busy}
        activeOpacity={0.75}
        style={{
          paddingHorizontal: 14,
          paddingVertical: 6,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: open ? theme.danger + '66' : theme.success + '66',
          backgroundColor: open ? theme.dangerMuted : theme.successMuted,
          opacity: busy ? 0.6 : 1,
        }}
      >
        <Text style={{
          color: open ? theme.danger : theme.success,
          fontSize: 12,
          fontWeight: '800',
        }}>
          {busy ? '…' : (open ? 'Clock out' : 'Clock in')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function StatTile({
  theme, label, value, color, onPress,
}: { theme: Theme; label: string; value: string; color?: string; onPress?: () => void }) {
  const Wrap: any = onPress ? TouchableOpacity : View;
  return (
    <Wrap
      activeOpacity={0.7}
      onPress={onPress}
      style={{
        flex: 1,
        padding: 14,
        borderRadius: 12,
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      <Text style={{
        color: theme.textMuted,
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.6,
        textTransform: 'uppercase',
      }}>{label}</Text>
      <Text style={{
        color: color || theme.textPrimary,
        fontSize: 24,
        fontWeight: '800',
        marginTop: 6,
        fontVariant: ['tabular-nums'],
      }}>{value}</Text>
    </Wrap>
  );
}

function DesktopHandoffLink() {
  const theme = useTheme();
  const [sending, setSending] = useState(false);
  async function open() {
    if (sending) return;
    setSending(true);
    try {
      const resp = await mobilePost<{ ok: boolean; emailed: boolean; magic_url?: string; error?: string }>(
        '/api/mobile/me/desktop-magic-link',
        { skip_email: true },
      );
      if (resp.magic_url) {
        await Linking.openURL(resp.magic_url);
      } else if (resp.emailed) {
        Alert.alert('Sent to your email', 'Open the link there to sign into the dashboard.');
      } else {
        Alert.alert('Could not open', resp.error || 'Try again.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not open dashboard.');
    } finally {
      setSending(false);
    }
  }
  return (
    <TouchableOpacity
      onPress={open}
      disabled={sending}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 24,
        marginBottom: 12,
        paddingVertical: 12,
      }}
    >
      <Ionicons name="open-outline" size={16} color={theme.textSecondary} />
      <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '700' }}>
        {sending ? 'Opening…' : 'Open dashboard'}
      </Text>
      {sending ? <ActivityIndicator color={theme.textSecondary} size="small" /> : null}
    </TouchableOpacity>
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

    header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
    greeting: { color: t.textPrimary, fontSize: 22, fontWeight: '800' },
    date: { color: t.textSecondary, fontSize: 12, fontWeight: '600', marginTop: 2 },

    statGrid: { paddingHorizontal: 16, paddingTop: 14, gap: 8 },
    statRow: { flexDirection: 'row', gap: 8 },

    crewStrip: {
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 8,
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

    mapWrap: { paddingHorizontal: 16, paddingTop: 4 },
  });
}
