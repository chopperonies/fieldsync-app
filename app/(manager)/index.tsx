import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl, ScrollView, Image
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { getUser } from '../../lib/storage';

interface JobWithCrew {
  id: string;
  name: string;
  address: string;
  status: string;
  crew: { name: string }[];
  pendingSupplies: number;
  recentUpdates: { type: string; message: string; employees: { name: string }; created_at: string; photo_url?: string }[];
}

export default function ManagerDashboard() {
  const [jobs, setJobs] = useState<JobWithCrew[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const user = await getUser();
    let q = supabase.from('jobs').select('*').order('name');
    if (user?.tenant_id) q = q.eq('tenant_id', user.tenant_id);
    const { data: jobList } = await q;
    if (!jobList) return;

    const enriched = await Promise.all(jobList.map(async job => {
      const [{ data: assignments }, { data: supplies }, { data: updates }] = await Promise.all([
        supabase.from('job_assignments')
          .select('employees(name)')
          .eq('job_id', job.id)
          .is('checked_out_at', null),
        supabase.from('supply_requests')
          .select('id')
          .eq('job_id', job.id)
          .eq('status', 'pending'),
        supabase.from('job_updates')
          .select('type, message, photo_url, created_at, employees(name)')
          .eq('job_id', job.id)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      return {
        ...job,
        crew: (assignments || []).map((a: any) => a.employees),
        pendingSupplies: (supplies || []).length,
        recentUpdates: updates || [],
      };
    }));

    setJobs(enriched);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#0ea5e9" /></View>;
  }

  return (
    <FlatList
      data={jobs}
      keyExtractor={j => j.id}
      style={styles.container}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0ea5e9" />}
      renderItem={({ item }) => {
        const isOpen = selected === item.id;
        return (
          <TouchableOpacity
            style={[styles.card, item.status !== 'active' && styles.cardInactive]}
            onPress={() => setSelected(isOpen ? null : item.id)}
            activeOpacity={0.8}
          >
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.jobName}>{item.name}</Text>
                <Text style={styles.jobAddress}>{item.address}</Text>
              </View>
              <View style={styles.badges}>
                <View style={[styles.badge, { backgroundColor: item.crew.length > 0 ? '#052e16' : '#1a1a1a' }]}>
                  <Text style={[styles.badgeText, { color: item.crew.length > 0 ? '#4ade80' : '#555' }]}>
                    👷 {item.crew.length}
                  </Text>
                </View>
                {item.pendingSupplies > 0 && (
                  <View style={[styles.badge, { backgroundColor: '#e8f0fd' }]}>
                    <Text style={[styles.badgeText, { color: '#0ea5e9' }]}>📦 {item.pendingSupplies}</Text>
                  </View>
                )}
              </View>
            </View>

            {item.crew.length > 0 && (
              <Text style={styles.crewList}>On site: {item.crew.map(c => c.name).join(', ')}</Text>
            )}

            {isOpen && (
              <ScrollView style={styles.updates}>
                {item.recentUpdates.length === 0
                  ? <Text style={styles.noUpdates}>No recent activity</Text>
                  : item.recentUpdates.map((u, i) => (
                    <View key={i} style={styles.updateRow}>
                      <Text style={styles.updateIcon}>
                        {u.type === 'checkin' ? '📍' : u.type === 'checkout' ? '👋' : u.type === 'supply_request' ? '📦' : u.type === 'bottleneck' ? '🚧' : '📸'}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.updateText}>{u.message}</Text>
                        <Text style={styles.updateMeta}>{u.employees?.name} · {new Date(u.created_at).toLocaleTimeString()}</Text>
                        {u.photo_url && <Image source={{ uri: u.photo_url }} style={styles.updatePhoto} />}
                      </View>
                    </View>
                  ))
                }
              </ScrollView>
            )}
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  card: {
    backgroundColor: '#1a1a1a', borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: '#2a2a2a',
  },
  cardInactive: { opacity: 0.5 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  jobName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  jobAddress: { color: '#666', fontSize: 13, marginTop: 2 },
  badges: { flexDirection: 'row', gap: 6, marginLeft: 8 },
  badge: { borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  crewList: { color: '#4ade80', fontSize: 13, marginTop: 8 },
  updates: { marginTop: 12, maxHeight: 300 },
  noUpdates: { color: '#444', fontSize: 13, textAlign: 'center', padding: 8 },
  updateRow: { flexDirection: 'row', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#2a2a2a' },
  updateIcon: { fontSize: 16, marginTop: 1 },
  updateText: { color: '#ccc', fontSize: 13 },
  updateMeta: { color: '#555', fontSize: 11, marginTop: 2 },
  updatePhoto: { width: '100%', height: 140, borderRadius: 8, marginTop: 6 },
});
