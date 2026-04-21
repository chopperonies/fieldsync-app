import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { mobileGet } from '../../lib/mobileApi';
import { getUser } from '../../lib/storage';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import { Divider, SectionHeader } from '../../components/Flat';

function formatDuration(start: string, end: string | null): string {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const ms = e - s;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m${!end ? ' (ongoing)' : ''}`;
}

interface Assignment {
  id: string;
  checked_in_at: string;
  checked_out_at: string | null;
  jobs: { name: string };
}

export default function CrewHours() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weekHours, setWeekHours] = useState(0);

  const loadData = useCallback(async () => {
    const user = await getUser();
    if (!user) return;
    let rows: Assignment[] = [];
    try {
      rows = await mobileGet<Assignment[]>('/api/mobile/crew/my-assignments');
    } catch {
      rows = [];
    }
    setAssignments(rows);

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const ms = rows
      .filter(r => new Date(r.checked_in_at) >= weekStart)
      .reduce((sum, r) => {
        const s = new Date(r.checked_in_at).getTime();
        const e = r.checked_out_at ? new Date(r.checked_out_at).getTime() : Date.now();
        return sum + (e - s);
      }, 0);

    setWeekHours(Math.round(ms / 3600000 * 10) / 10);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.accent} /></View>;
  }

  return (
    <FlatList
      data={assignments}
      keyExtractor={a => a.id}
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 140 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={theme.accent} />}
      ItemSeparatorComponent={() => <Divider inset={16} />}
      ListHeaderComponent={
        <>
          <View style={styles.summary}>
            <Text style={styles.summaryValue}>{weekHours}h</Text>
            <Text style={styles.summaryLabel}>This week</Text>
          </View>
          {assignments.length > 0 && <SectionHeader label="Check-ins" hint={`${assignments.length}`} />}
        </>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No hours logged yet</Text>
          <Text style={styles.emptySub}>Check in from the Home tab when you're on site.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.jobName} numberOfLines={1}>{(item.jobs as any)?.name}</Text>
            <Text style={styles.date}>
              {new Date(item.checked_in_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.duration}>{formatDuration(item.checked_in_at, item.checked_out_at)}</Text>
            <Text style={styles.timeRange}>
              {new Date(item.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {' → '}
              {item.checked_out_at
                ? new Date(item.checked_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : 'Now'}
            </Text>
          </View>
        </View>
      )}
    />
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: t.bg },
    summary: {
      alignItems: 'center',
      paddingVertical: 32,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border,
    },
    summaryValue: {
      color: t.accent,
      fontSize: 56, fontWeight: '800',
      fontVariant: ['tabular-nums'],
      letterSpacing: -1,
    },
    summaryLabel: { color: t.textSecondary, fontSize: 14, fontWeight: '600', marginTop: 4 },

    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 14,
    },
    jobName: { color: t.textPrimary, fontSize: 15, fontWeight: '600' },
    date: { color: t.textSecondary, fontSize: 12, marginTop: 2 },
    duration: { color: t.textPrimary, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
    timeRange: { color: t.textMuted, fontSize: 12, marginTop: 2 },

    empty: { padding: 48, alignItems: 'center' },
    emptyTitle: { color: t.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 6 },
    emptySub: { color: t.textMuted, fontSize: 13, textAlign: 'center' },
  });
}
