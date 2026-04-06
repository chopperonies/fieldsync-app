import { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, AppState
} from 'react-native';
import * as Location from 'expo-location';
import { supabase, Job } from '../../lib/supabase';
import { getUser } from '../../lib/storage';
import { setCache, getStaleCache } from '../../lib/cache';
import { enqueue, syncQueue, getQueueCount } from '../../lib/offlineQueue';

async function getGPS(): Promise<{ lat: number; lng: number } | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: loc.coords.latitude, lng: loc.coords.longitude };
  } catch {
    return null;
  }
}

export default function CheckIn() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [checkedInJob, setCheckedInJob] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [fromCache, setFromCache] = useState(false);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    init();

    // Sync queue and re-check connectivity when app comes to foreground
    const sub = AppState.addEventListener('change', async (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        await trySyncQueue();
        await loadJobs();
      }
      appState.current = next;
    });

    return () => sub.remove();
  }, []);

  async function init() {
    await loadJobs();
    await loadCurrentAssignment();
    await trySyncQueue();
  }

  async function trySyncQueue() {
    const count = await getQueueCount();
    setPendingCount(count);
    if (count === 0) return;
    const synced = await syncQueue();
    const remaining = await getQueueCount();
    setPendingCount(remaining);
    if (synced > 0) {
      setIsOnline(true);
    }
  }

  async function loadJobs() {
    const user = await getUser();
    try {
      let query = supabase.from('jobs').select('*').eq('status', 'active').order('name');
      if (user?.tenant_id) query = query.eq('tenant_id', user.tenant_id);
      const { data, error } = await query;
      if (error) throw error;
      const result = data || [];
      setJobs(result);
      setFromCache(false);
      setIsOnline(true);
      await setCache('crew_jobs_' + user?.tenant_id, result);
    } catch {
      // Offline — load from cache
      const cached = await getStaleCache<Job[]>('crew_jobs_' + user?.tenant_id);
      if (cached) {
        setJobs(cached);
        setFromCache(true);
        setIsOnline(false);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadCurrentAssignment() {
    const user = await getUser();
    if (!user) return;
    try {
      const { data } = await supabase
        .from('job_assignments')
        .select('job_id')
        .eq('employee_id', user.id)
        .is('checked_out_at', null)
        .single();
      if (data) setCheckedInJob(data.job_id);
    } catch {
      // Try from cache
      const cached = await getStaleCache<string>('crew_checked_in_' + user.id);
      if (cached) setCheckedInJob(cached);
    }
  }

  async function handleCheckIn(job: Job) {
    const user = await getUser();
    if (!user) return;
    setActionLoading(true);
    const gps = await getGPS();
    try {
      const checkedInAt = new Date().toISOString();
      const payload = {
        job_id: job.id,
        employee_id: user.id,
        tenant_id: user.tenant_id,
        checked_in_at: checkedInAt,
        checked_out_at: null,
        employee_name: user.name,
        punch_in_lat: gps?.lat ?? null,
        punch_in_lng: gps?.lng ?? null,
      };

      if (isOnline) {
        const { error } = await supabase.from('job_assignments').upsert(
          {
            job_id: job.id, employee_id: user.id, tenant_id: user.tenant_id,
            checked_in_at: checkedInAt, checked_out_at: null,
            punch_in_lat: gps?.lat ?? null, punch_in_lng: gps?.lng ?? null,
          },
          { onConflict: 'job_id,employee_id' }
        );
        if (error) throw error;
        await supabase.from('job_updates').insert({
          job_id: job.id, employee_id: user.id, tenant_id: user.tenant_id,
          type: 'checkin', message: `${user.name} checked in${gps ? ' 📍' : ''}`,
        });
        Alert.alert('Checked in!', `You're now on site at ${job.name}${gps ? '\n📍 Location recorded' : ''}`);
      } else {
        await enqueue('checkin', payload);
        const count = await getQueueCount();
        setPendingCount(count);
        Alert.alert('Saved offline', `Check-in saved. It will sync automatically when you're back online.`);
      }

      setCheckedInJob(job.id);
      await setCache('crew_checked_in_' + user.id, job.id);
    } catch {
      // Fallback to offline queue on network error
      const user2 = await getUser();
      if (user2) {
        await enqueue('checkin', {
          job_id: job.id, employee_id: user2.id, tenant_id: user2.tenant_id,
          checked_in_at: new Date().toISOString(), checked_out_at: null, employee_name: user2.name,
        });
        const count = await getQueueCount();
        setPendingCount(count);
        setCheckedInJob(job.id);
        setIsOnline(false);
        Alert.alert('Saved offline', `Check-in saved. It will sync when you're back online.`);
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCheckOut(job: Job) {
    const user = await getUser();
    if (!user) return;
    setActionLoading(true);
    const checkedOutAt = new Date().toISOString();
    const gps = await getGPS();
    try {
      if (isOnline) {
        const { error } = await supabase.from('job_assignments')
          .update({ checked_out_at: checkedOutAt, punch_out_lat: gps?.lat ?? null, punch_out_lng: gps?.lng ?? null })
          .eq('job_id', job.id)
          .eq('employee_id', user.id);
        if (error) throw error;
        await supabase.from('job_updates').insert({
          job_id: job.id, employee_id: user.id, tenant_id: user.tenant_id,
          type: 'checkout', message: `${user.name} checked out${gps ? ' 📍' : ''}`,
        });
        Alert.alert('Checked out', `Good work at ${job.name}!${gps ? '\n📍 Location recorded' : ''}`);
      } else {
        await enqueue('checkout', {
          job_id: job.id, employee_id: user.id, tenant_id: user.tenant_id,
          checked_out_at: checkedOutAt, employee_name: user.name,
          punch_out_lat: gps?.lat ?? null, punch_out_lng: gps?.lng ?? null,
        });
        const count = await getQueueCount();
        setPendingCount(count);
        Alert.alert('Saved offline', `Check-out saved. It will sync when you're back online.`);
      }

      setCheckedInJob(null);
      await setCache('crew_checked_in_' + user.id, null);
    } catch {
      const user2 = await getUser();
      if (user2) {
        await enqueue('checkout', {
          job_id: job.id, employee_id: user2.id, tenant_id: user2.tenant_id,
          checked_out_at: checkedOutAt, employee_name: user2.name,
        });
        const count = await getQueueCount();
        setPendingCount(count);
        setCheckedInJob(null);
        setIsOnline(false);
        Alert.alert('Saved offline', `Check-out saved. It will sync when you're back online.`);
      }
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            📵 No connection — showing cached jobs
            {pendingCount > 0 ? ` · ${pendingCount} action${pendingCount > 1 ? 's' : ''} pending sync` : ''}
          </Text>
        </View>
      )}
      {isOnline && pendingCount > 0 && (
        <View style={styles.syncBanner}>
          <Text style={styles.syncText}>🔄 Syncing {pendingCount} offline action{pendingCount > 1 ? 's' : ''}...</Text>
        </View>
      )}

      <Text style={styles.label}>
        {checkedInJob ? '✅ Currently on site' : '📍 Select a job site'}
      </Text>

      <FlatList
        data={jobs}
        keyExtractor={j => j.id}
        contentContainerStyle={{ gap: 12, padding: 16 }}
        ListEmptyComponent={
          <Text style={{ color: '#555', textAlign: 'center', marginTop: 40 }}>
            {fromCache ? 'No cached jobs available.' : 'No active jobs found.'}
          </Text>
        }
        renderItem={({ item }) => {
          const isActive = checkedInJob === item.id;
          return (
            <View style={[styles.card, isActive && styles.cardActive]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.jobName}>{item.name}</Text>
                <Text style={styles.jobAddress}>{item.address}</Text>
              </View>
              <TouchableOpacity
                style={[styles.btn, isActive ? styles.btnOut : styles.btnIn]}
                onPress={() => isActive ? handleCheckOut(item) : handleCheckIn(item)}
                disabled={actionLoading || (!!checkedInJob && !isActive)}
              >
                {actionLoading && isActive
                  ? <ActivityIndicator size="small" color="#000" />
                  : <Text style={styles.btnText}>{isActive ? 'Check Out' : 'Check In'}</Text>
                }
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  offlineBanner: { backgroundColor: '#7f1d1d', paddingVertical: 8, paddingHorizontal: 16 },
  offlineText: { color: '#fca5a5', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  syncBanner: { backgroundColor: '#1e3a5f', paddingVertical: 8, paddingHorizontal: 16 },
  syncText: { color: '#93c5fd', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  label: { color: '#888', fontSize: 14, padding: 16, paddingBottom: 4 },
  card: {
    backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a',
  },
  cardActive: { borderColor: '#0ea5e9' },
  jobName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  jobAddress: { color: '#666', fontSize: 13, marginTop: 2 },
  btn: { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, minWidth: 90, alignItems: 'center' },
  btnIn: { backgroundColor: '#0ea5e9' },
  btnOut: { backgroundColor: '#ef4444' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
