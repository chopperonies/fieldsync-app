import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AppState, Alert } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { mobileGet, mobilePost } from '../lib/mobileApi';
import { useTheme } from '../lib/themeContext';
import { Theme } from '../lib/theme';

// Universal free-punch clock-in — backed by the time_entries table via
// /api/mobile/clock-in, /api/mobile/clock-out, and /api/mobile/me/clock-state.

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
  pins: Array<{ kind: 'in' | 'out'; lat: number; lng: number; at: string }>;
  entries: TimeEntry[];
};

async function getGPS(): Promise<{ lat: number; lng: number } | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: loc.coords.latitude, lng: loc.coords.longitude };
  } catch {
    return null;
  }
}

function fmtHMS(totalMs: number): string {
  if (totalMs < 0) totalMs = 0;
  const total = Math.floor(totalMs / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function ClockInCard({ onChange }: { onChange?: () => void }) {
  const theme = useTheme();
  const styles = makeStyles(theme);

  const [state, setState] = useState<ClockState>({ open: null, totalMs: 0, pins: [], entries: [] });
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<number>(Date.now());

  const appState = useRef(AppState.currentState);

  const reload = useCallback(async () => {
    try {
      const data = await mobileGet<ClockState>('/api/mobile/me/clock-state');
      setState({
        open: data.open || null,
        totalMs: data.totalMs || 0,
        pins: data.pins || [],
        entries: data.entries || [],
      });
    } catch {
      // Keep prior state on network hiccup
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') reload();
      appState.current = next;
    });
    return () => sub.remove();
  }, [reload]);

  useEffect(() => {
    if (!state.open) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.open]);

  async function punchIn() {
    if (busy) return;
    setBusy(true);
    try {
      const gps = await getGPS();
      await mobilePost('/api/mobile/clock-in', { gps });
      await reload();
      onChange?.();
    } catch (e: any) {
      Alert.alert('Could not clock in', e?.message || 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function punchOut() {
    if (busy) return;
    setBusy(true);
    try {
      const gps = await getGPS();
      await mobilePost('/api/mobile/clock-out', { gps });
      await reload();
      onChange?.();
    } catch (e: any) {
      Alert.alert('Could not clock out', e?.message || 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  const liveMs = state.open ? (now - new Date(state.open.started_at).getTime()) : 0;
  // totalMs from server already counts the open segment up to fetch time,
  // so add the delta between "now" and "fetch time" instead of full liveMs.
  // Simpler + stable: recompute from entries locally.
  let totalMs = 0;
  for (const r of state.entries) {
    const s = new Date(r.started_at).getTime();
    const e = r.ended_at ? new Date(r.ended_at).getTime() : now;
    totalMs += Math.max(0, e - s);
  }
  const isActive = !!state.open;

  return (
    <View style={styles.wrap}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.label}>Today's total</Text>
        <Text style={styles.time}>{fmtHMS(totalMs)}</Text>
        {isActive ? <Text style={styles.live}>● Clocked in</Text> : null}
      </View>
      <TouchableOpacity
        style={[
          styles.btn,
          isActive
            ? { backgroundColor: theme.dangerMuted, borderColor: theme.danger + '66' }
            : { backgroundColor: theme.successMuted, borderColor: theme.success + '66' },
          busy && { opacity: 0.6 },
        ]}
        onPress={isActive ? punchOut : punchIn}
        activeOpacity={0.75}
        disabled={busy}
      >
        <Ionicons
          name={isActive ? 'stop-circle-outline' : 'play-circle-outline'}
          size={18}
          color={isActive ? theme.danger : theme.success}
        />
        <Text style={[styles.btnText, { color: isActive ? theme.danger : theme.success }]}>
          {busy ? '…' : (isActive ? 'Clock Out' : 'Clock In')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    wrap: {
      marginHorizontal: 16,
      marginTop: 8,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    label: { color: t.textSecondary, fontSize: 12, fontWeight: '700' },
    time: {
      color: t.textPrimary,
      fontSize: 26,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.5,
    },
    live: { color: t.success, fontSize: 11, fontWeight: '800', marginTop: 2, letterSpacing: 0.3 },
    btn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderWidth: 1,
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    btnText: { fontSize: 14, fontWeight: '800' },
  });
}
