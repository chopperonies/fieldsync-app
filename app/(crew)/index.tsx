import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, AppState, RefreshControl, ScrollView, TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getUser } from '../../lib/storage';
import { syncQueue, getQueueCount } from '../../lib/offlineQueue';
import { mobileGet } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import ClockInCard from '../../components/ClockInCard';
import PunchMap, { MapPin } from '../../components/PunchMap';
import ProgressGauge from '../../components/ProgressGauge';
import { ScreenHeader } from '../../components/Flat';

type ClockStatePinsResponse = {
  pins: Array<{ kind: 'in' | 'out'; lat: number; lng: number; at?: string }>;
};

type TodayProgress = { completed: number; total: number };

export default function CrewHome() {
  const theme = useTheme();
  const styles = makeStyles(theme);

  const [myPins, setMyPins] = useState<MapPin[]>([]);
  const [progress, setProgress] = useState<TodayProgress>({ completed: 0, total: 0 });
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [firstName, setFirstName] = useState('');
  const appState = useRef(AppState.currentState);

  const loadPins = useCallback(async () => {
    try {
      const data = await mobileGet<ClockStatePinsResponse>('/api/mobile/me/clock-state');
      setMyPins((data?.pins || []).map(p => ({ lat: p.lat, lng: p.lng, kind: p.kind, at: p.at })));
    } catch {
      setMyPins([]);
    }
  }, []);

  const loadProgress = useCallback(async () => {
    try {
      const data = await mobileGet<TodayProgress>('/api/mobile/me/today-progress');
      setProgress({ completed: data?.completed || 0, total: data?.total || 0 });
    } catch {
      setProgress({ completed: 0, total: 0 });
    }
  }, []);

  const trySyncQueue = useCallback(async () => {
    const count = await getQueueCount();
    setPendingCount(count);
    if (count === 0) return;
    const synced = await syncQueue();
    const remaining = await getQueueCount();
    setPendingCount(remaining);
    if (synced > 0) setIsOnline(true);
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadPins(), loadProgress(), trySyncQueue()]);
  }, [loadPins, loadProgress, trySyncQueue]);

  useEffect(() => {
    (async () => {
      const u = await getUser();
      const first = (u?.name || '').split(/\s+/)[0] || '';
      setFirstName(first);
    })();
    loadAll();
    const sub = AppState.addEventListener('change', async (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        await loadAll();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [loadAll]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScreenHeader
        title={`${greeting}${firstName ? `, ${firstName}` : ''}`}
        subtitle={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        showBack={false}
        right={(
          <TouchableOpacity
            onPress={() => router.push('/(crew)/settings' as any)}
            hitSlop={8}
            style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="settings-outline" size={22} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await loadAll(); setRefreshing(false); }}
            tintColor={theme.accent}
          />
        }
      >
        {!isOnline ? (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={14} color={theme.danger} />
            <Text style={styles.offlineText}>
              No connection — working offline
              {pendingCount > 0 ? ` · ${pendingCount} action${pendingCount > 1 ? 's' : ''} pending` : ''}
            </Text>
          </View>
        ) : null}
        {isOnline && pendingCount > 0 ? (
          <View style={styles.syncBanner}>
            <Ionicons name="sync-outline" size={14} color={theme.info} />
            <Text style={styles.syncText}>Syncing {pendingCount} offline action{pendingCount > 1 ? 's' : ''}…</Text>
          </View>
        ) : null}

        <ClockInCard onChange={() => { loadPins(); loadProgress(); }} />

        <ProgressGauge completed={progress.completed} total={progress.total} />

        <PunchMap pins={myPins} emptyLabel="Clock in to drop a pin" />
      </ScrollView>
    </View>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    offlineBanner: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      backgroundColor: t.dangerMuted, paddingVertical: 8, paddingHorizontal: 16,
    },
    offlineText: { color: t.danger, fontSize: 12, fontWeight: '700' },
    syncBanner: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      backgroundColor: t.infoMuted, paddingVertical: 8, paddingHorizontal: 16,
    },
    syncText: { color: t.info, fontSize: 12, fontWeight: '700' },
  });
}
