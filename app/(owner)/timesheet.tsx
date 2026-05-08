import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileGet } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import ClockInCard from '../../components/ClockInCard';
import { Divider, Row, RowAvatar, SectionHeader, StatusChip } from '../../components/Flat';

type TimeEntry = {
  id: string;
  started_at: string;
  ended_at: string | null;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
};

type ClockState = {
  open: TimeEntry | null;
  totalMs: number;
  entries: TimeEntry[];
};

function todayStartIso() {
  const local = new Date();
  local.setHours(0, 0, 0, 0);
  return encodeURIComponent(local.toISOString());
}

function fmtDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function entryDuration(entry: TimeEntry) {
  const start = new Date(entry.started_at).getTime();
  const end = entry.ended_at ? new Date(entry.ended_at).getTime() : Date.now();
  return Math.max(0, end - start);
}

function fmtTime(iso: string | null) {
  if (!iso) return 'Now';
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function OwnerTimesheet() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<ClockState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await mobileGet<ClockState>(`/api/mobile/me/clock-state?since=${todayStartIso()}`);
      setState({
        open: data.open || null,
        totalMs: data.totalMs || 0,
        entries: data.entries || [],
      });
    } catch {
      setState({ open: null, totalMs: 0, entries: [] });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const entries = state?.entries || [];
  const total = entries.reduce((sum, entry) => sum + entryDuration(entry), 0);

  if (loading && !state) {
    return <View style={styles.center}><ActivityIndicator color={theme.accent} /></View>;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.accent} />}
    >
      <View style={[styles.summary, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.kicker}>Today</Text>
        <Text style={styles.total}>{fmtDuration(total)}</Text>
        <Text style={styles.sub}>Clocked time for this workday</Text>
      </View>

      <ClockInCard onChange={load} />

      <SectionHeader label="Time entries" hint={entries.length ? String(entries.length) : undefined} />
      {entries.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="time-outline" size={34} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>No time logged yet</Text>
          <Text style={styles.emptySub}>Clock in to start today’s timesheet.</Text>
        </View>
      ) : entries.map((entry, index) => (
        <View key={entry.id}>
          {index > 0 ? <Divider inset={64} /> : null}
          <Row
            leading={<RowAvatar icon={entry.ended_at ? 'checkmark-circle-outline' : 'radio-button-on-outline'} tint={entry.ended_at ? theme.success : theme.accent} />}
            title={`${fmtTime(entry.started_at)} - ${fmtTime(entry.ended_at)}`}
            subtitle={entry.start_lat && entry.start_lng ? 'Location captured' : 'No location captured'}
            trailing={
              <>
                <Text style={styles.duration}>{fmtDuration(entryDuration(entry))}</Text>
                {!entry.ended_at ? <StatusChip label="Live" tint={theme.success} /> : null}
              </>
            }
          />
        </View>
      ))}
    </ScrollView>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    content: { paddingBottom: 140 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg },
    summary: {
      paddingHorizontal: 16,
      paddingBottom: 4,
    },
    kicker: { color: t.textSecondary, fontSize: 13, fontWeight: '700' },
    total: {
      color: t.textPrimary,
      fontSize: 36,
      lineHeight: 42,
      fontWeight: '800',
      marginTop: 4,
      fontVariant: ['tabular-nums'],
    },
    sub: { color: t.textMuted, fontSize: 13, marginTop: 2 },
    duration: {
      color: t.textPrimary,
      fontSize: 13,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    empty: { alignItems: 'center', paddingHorizontal: 36, paddingVertical: 44 },
    emptyTitle: { color: t.textPrimary, fontSize: 16, fontWeight: '800', marginTop: 10 },
    emptySub: { color: t.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4 },
  });
}
