import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { getUser } from '../../lib/storage';

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
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weekHours, setWeekHours] = useState(0);

  const loadData = useCallback(async () => {
    const user = await getUser();
    if (!user) return;

    const { data } = await supabase
      .from('job_assignments')
      .select('id, checked_in_at, checked_out_at, jobs(name)')
      .eq('employee_id', user.id)
      .not('checked_in_at', 'is', null)
      .order('checked_in_at', { ascending: false })
      .limit(40);

    const rows = (data || []) as Assignment[];
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
    return <View style={styles.center}><ActivityIndicator size="large" color="#0265dc" /></View>;
  }

  return (
    <FlatList
      data={assignments}
      keyExtractor={a => a.id}
      style={styles.container}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#0265dc" />}
      ListHeaderComponent={
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{weekHours}h</Text>
          <Text style={styles.summaryLabel}>This week</Text>
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>No hours logged yet.</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={{ flex: 1 }}>
            <Text style={styles.jobName}>{(item.jobs as any)?.name}</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  summaryCard: {
    backgroundColor: '#1a1a1a', borderRadius: 14, padding: 20,
    alignItems: 'center', borderWidth: 1, borderColor: '#0265dc33', marginBottom: 4,
  },
  summaryValue: { color: '#0265dc', fontSize: 48, fontWeight: '800' },
  summaryLabel: { color: '#666', fontSize: 14, marginTop: 4 },
  empty: { color: '#444', textAlign: 'center', marginTop: 60, fontSize: 15 },
  card: {
    backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#2a2a2a',
  },
  jobName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  date: { color: '#666', fontSize: 12, marginTop: 2 },
  duration: { color: '#0265dc', fontSize: 15, fontWeight: '700' },
  timeRange: { color: '#555', fontSize: 12, marginTop: 2 },
});
