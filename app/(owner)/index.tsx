import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl, TouchableOpacity
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { getUser, clearUser } from '../../lib/storage';
import { router } from 'expo-router';

interface Stats {
  activeJobs: number;
  crewOnSite: number;
  pendingSupplies: number;
  bottlenecksToday: number;
  jobBreakdown: { name: string; crew: number; pendingSupplies: number }[];
}

export default function OwnerOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const user = await getUser();
    const tid = user?.tenant_id;
    const jobsQ = supabase.from('jobs').select('id, name').in('status', ['active', 'in_progress', 'scheduled']);
    const onSiteQ = supabase.from('job_assignments').select('job_id').not('checked_in_at', 'is', null).is('checked_out_at', null);
    const suppliesQ = supabase.from('supply_requests').select('job_id').eq('status', 'pending');
    const bottlenecksQ = supabase.from('job_updates').select('job_id').eq('type', 'bottleneck').gte('created_at', today.toISOString());
    const [{ data: jobs }, { data: onSite }, { data: supplies }, { data: bottlenecks }] = await Promise.all([
      tid ? jobsQ.eq('tenant_id', tid) : jobsQ,
      tid ? onSiteQ.eq('tenant_id', tid) : onSiteQ,
      tid ? suppliesQ.eq('tenant_id', tid) : suppliesQ,
      tid ? bottlenecksQ.eq('tenant_id', tid) : bottlenecksQ,
    ]);

    const jobBreakdown = (jobs || []).map(job => ({
      name: job.name,
      crew: (onSite || []).filter(a => a.job_id === job.id).length,
      pendingSupplies: (supplies || []).filter(s => s.job_id === job.id).length,
    }));

    setStats({
      activeJobs: (jobs || []).length,
      crewOnSite: (onSite || []).length,
      pendingSupplies: (supplies || []).length,
      bottlenecksToday: (bottlenecks || []).length,
      jobBreakdown,
    });
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleLogout() {
    await clearUser();
    router.replace('/login');
  }

  if (loading || !stats) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#0ea5e9" /></View>;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#0ea5e9" />}
    >
      <Text style={styles.sectionLabel}>Today's Summary</Text>
      <View style={styles.statsGrid}>
        <StatCard value={stats.activeJobs} label="Active Jobs" color="#3b82f6" onPress={() => router.push('/(owner)/dashboard' as any)} />
        <StatCard value={stats.crewOnSite} label="Crew On Site" color="#4ade80" onPress={() => router.push('/(owner)/dashboard' as any)} />
        <StatCard value={stats.pendingSupplies} label="Pending Supplies" color="#0ea5e9" onPress={() => router.push('/(owner)/supplies' as any)} />
        <StatCard value={stats.bottlenecksToday} label="Bottlenecks Today" color="#ef4444" onPress={() => router.push('/(owner)/dashboard' as any)} />
      </View>

      <Text style={styles.sectionLabel}>Job Breakdown</Text>
      {stats.jobBreakdown.map((job, i) => (
        <TouchableOpacity key={i} style={styles.jobRow} onPress={() => router.push('/(owner)/dashboard' as any)}>
          <Text style={styles.jobName}>{job.name}</Text>
          <View style={styles.jobBadges}>
            <Text style={styles.crewBadge}>👷 {job.crew}</Text>
            {job.pendingSupplies > 0 && <Text style={styles.supplyBadge}>📦 {job.pendingSupplies}</Text>}
          </View>
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function StatCard({ value, label, color, onPress }: { value: number; label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.statCard, { borderColor: color + '44' }]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  content: { padding: 16, gap: 10 },
  sectionLabel: { color: '#888', fontSize: 13, fontWeight: '600', marginTop: 8 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    flex: 1, minWidth: '45%', backgroundColor: '#1a1a1a',
    borderRadius: 14, padding: 16, borderWidth: 1, alignItems: 'center',
  },
  statValue: { fontSize: 36, fontWeight: '800' },
  statLabel: { color: '#666', fontSize: 12, marginTop: 4, textAlign: 'center' },
  jobRow: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a',
  },
  jobName: { color: '#fff', fontSize: 14, fontWeight: '600', flex: 1 },
  jobBadges: { flexDirection: 'row', gap: 8 },
  crewBadge: { color: '#4ade80', fontSize: 13, fontWeight: '600' },
  supplyBadge: { color: '#0ea5e9', fontSize: 13, fontWeight: '600' },
  logoutBtn: {
    marginTop: 24, borderRadius: 12, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a',
  },
  logoutText: { color: '#555', fontWeight: '600' },
});
