import { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, AppState, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Job } from '../../lib/supabase';
import { getUser } from '../../lib/storage';
import { setCache, getStaleCache } from '../../lib/cache';
import { enqueue, syncQueue, getQueueCount } from '../../lib/offlineQueue';
import { mobileGet, mobilePost } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import { Pill, PillRow, SectionHeader, Divider } from '../../components/Flat';
import ClockInCard from '../../components/ClockInCard';

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
  const router = useRouter();
  const theme = useTheme();
  const styles = makeStyles(theme);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [history, setHistory] = useState<Job[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [view, setView] = useState<'active' | 'history'>('active');
  const [checkedInJob, setCheckedInJob] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [fromCache, setFromCache] = useState(false);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    init();
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
    if (synced > 0) setIsOnline(true);
  }

  async function loadHistory() {
    try {
      const data = await mobileGet<Job[]>('/api/mobile/crew/jobs/history');
      setHistory(data || []);
      setHistoryLoaded(true);
    } catch {
      setHistory([]);
    }
  }

  async function loadJobs() {
    const user = await getUser();
    try {
      const data = await mobileGet<Job[]>('/api/mobile/crew/jobs');
      const result = data || [];
      setJobs(result);
      setFromCache(false);
      setIsOnline(true);
      await setCache('crew_jobs_' + user?.tenant_id, result);
    } catch (e: any) {
      const msg = String(e?.message || '');
      const serverResponded = /failed:\s*\d+/.test(msg);
      if (serverResponded) {
        setJobs([]);
        setFromCache(false);
        setIsOnline(true);
      } else {
        const cached = await getStaleCache<Job[]>('crew_jobs_' + user?.tenant_id);
        if (cached) {
          setJobs(cached);
          setFromCache(true);
          setIsOnline(false);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadCurrentAssignment() {
    const user = await getUser();
    if (!user) return;
    try {
      const data = await mobileGet<{ job_id: string } | null>('/api/mobile/crew/assignment');
      if (data) setCheckedInJob(data.job_id);
    } catch {
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
        await mobilePost(`/api/mobile/crew/jobs/${job.id}/check-in`, { gps });
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
        await mobilePost(`/api/mobile/crew/jobs/${job.id}/check-out`, { gps });
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

  const activeList = view === 'active' ? jobs : history;

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
          <Text style={styles.syncText}>🔄 Syncing {pendingCount} offline action{pendingCount > 1 ? 's' : ''}…</Text>
        </View>
      )}

      <ClockInCard />

      <PillRow>
        <Pill
          label={`Active${jobs.length > 0 ? ` · ${jobs.length}` : ''}`}
          active={view === 'active'}
          onPress={() => setView('active')}
        />
        <Pill
          label={`History${history.length > 0 ? ` · ${history.length}` : ''}`}
          active={view === 'history'}
          onPress={() => { setView('history'); if (!historyLoaded) loadHistory(); }}
        />
      </PillRow>

      <SectionHeader
        label={checkedInJob ? 'On site now' : (view === 'active' ? 'Assigned jobs' : 'Past jobs')}
      />

      <FlatList
        data={activeList}
        keyExtractor={j => j.id}
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadJobs} tintColor={theme.accent} />}
        ItemSeparatorComponent={() => <Divider inset={16} />}
        ListEmptyComponent={
          view === 'active' ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{fromCache ? 'No cached jobs' : 'No active jobs'}</Text>
              <Text style={styles.emptySub}>Jobs your owner assigns show up here.</Text>
              <TouchableOpacity onPress={loadJobs} style={styles.retryBtn}>
                <Text style={styles.retryBtnText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{historyLoaded ? 'No past jobs yet' : 'Loading…'}</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const isActive = checkedInJob === item.id;
          const isHistory = view === 'history';
          return (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push({ pathname: '/(crew)/job/[id]', params: { id: item.id } } as any)}
              style={styles.jobRow}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.jobName} numberOfLines={1}>{item.name}</Text>
                {item.address ? <Text style={styles.jobAddress} numberOfLines={1}>{item.address}</Text> : null}
                {!isHistory && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    {item.workflow_id ? (
                      <>
                        <Ionicons name="git-branch-outline" size={11} color={theme.accent} />
                        <Text style={styles.hint}>Workflow attached</Text>
                      </>
                    ) : (
                      <Text style={[styles.hint, { color: theme.textMuted }]}>Tap to open</Text>
                    )}
                  </View>
                )}
                {isHistory && item.status ? (
                  <Text style={[styles.hint, { color: theme.textMuted, marginTop: 4 }]}>
                    {String(item.status).replace(/_/g, ' ')}
                  </Text>
                ) : null}
              </View>
              {!isHistory ? (
                <TouchableOpacity
                  style={[
                    styles.punchBtn,
                    isActive
                      ? { backgroundColor: theme.dangerMuted, borderColor: theme.danger + '55' }
                      : { backgroundColor: theme.successMuted, borderColor: theme.success + '55' },
                  ]}
                  onPress={(e) => { e.stopPropagation?.(); isActive ? handleCheckOut(item) : handleCheckIn(item); }}
                  disabled={actionLoading || (!!checkedInJob && !isActive)}
                >
                  {actionLoading && isActive
                    ? <ActivityIndicator size="small" color={theme.danger} />
                    : (
                      <Text style={[
                        styles.punchBtnText,
                        { color: isActive ? theme.danger : theme.success },
                      ]}>
                        {isActive ? 'Check Out' : 'Check In'}
                      </Text>
                    )
                  }
                </TouchableOpacity>
              ) : (
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
              )}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    offlineBanner: { backgroundColor: t.dangerMuted, paddingVertical: 8, paddingHorizontal: 16 },
    offlineText: { color: t.danger, fontSize: 12, fontWeight: '700', textAlign: 'center' },
    syncBanner: { backgroundColor: t.infoMuted, paddingVertical: 8, paddingHorizontal: 16 },
    syncText: { color: t.info, fontSize: 12, fontWeight: '700', textAlign: 'center' },

    jobRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 14,
      minHeight: 68,
    },
    jobName: { color: t.textPrimary, fontSize: 15, fontWeight: '700' },
    jobAddress: { color: t.textSecondary, fontSize: 13, marginTop: 2 },
    hint: { color: t.accent, fontSize: 11, fontWeight: '700' },

    punchBtn: {
      borderWidth: 1,
      borderRadius: 999,
      paddingVertical: 8, paddingHorizontal: 14,
      alignItems: 'center', justifyContent: 'center',
      minWidth: 94,
    },
    punchBtnText: { fontSize: 13, fontWeight: '800' },

    empty: { padding: 48, alignItems: 'center' },
    emptyTitle: { color: t.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 6 },
    emptySub: { color: t.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 16 },
    retryBtn: {
      backgroundColor: t.accent, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10,
    },
    retryBtnText: { color: t.accentContrast, fontWeight: '700', fontSize: 14 },
  });
}
