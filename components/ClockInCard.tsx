import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/themeContext';
import { Theme } from '../lib/theme';

// Universal free-punch clock-in. Persisted locally (AsyncStorage).
// Server-side time_entries wiring is planned but not required for the
// owner/crew to punch and see a live timer + today's total.
//
// Keys:
//  clockin.active_start_iso  — ISO start time of current punch (null if clocked out)
//  clockin.log.<YYYY-MM-DD>  — JSON array of completed punches for that day:
//                              [{ start: iso, end: iso, ms: number }, ...]

const K_ACTIVE = 'clockin.active_start_iso';
const K_LOG_PREFIX = 'clockin.log.';

function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${K_LOG_PREFIX}${y}-${m}-${day}`;
}

function fmtHMS(totalMs: number): string {
  if (totalMs < 0) totalMs = 0;
  const total = Math.floor(totalMs / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function ClockInCard() {
  const theme = useTheme();
  const styles = makeStyles(theme);

  const [activeStart, setActiveStart] = useState<number | null>(null); // epoch ms
  const [priorMsToday, setPriorMsToday] = useState<number>(0);
  const [now, setNow] = useState<number>(Date.now());

  const appState = useRef(AppState.currentState);

  const reload = useCallback(async () => {
    const [activeRaw, logRaw] = await Promise.all([
      AsyncStorage.getItem(K_ACTIVE),
      AsyncStorage.getItem(todayKey()),
    ]);
    setActiveStart(activeRaw ? new Date(activeRaw).getTime() : null);
    if (logRaw) {
      try {
        const log: Array<{ ms: number }> = JSON.parse(logRaw);
        setPriorMsToday(log.reduce((s, r) => s + (r.ms || 0), 0));
      } catch {
        setPriorMsToday(0);
      }
    } else {
      setPriorMsToday(0);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Re-read when app returns to foreground so another screen's punch shows.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') reload();
      appState.current = next;
    });
    return () => sub.remove();
  }, [reload]);

  // Tick every second while punched in.
  useEffect(() => {
    if (!activeStart) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeStart]);

  async function punchIn() {
    const startIso = new Date().toISOString();
    await AsyncStorage.setItem(K_ACTIVE, startIso);
    setActiveStart(new Date(startIso).getTime());
    setNow(Date.now());
  }

  async function punchOut() {
    if (!activeStart) return;
    const endIso = new Date().toISOString();
    const startIso = new Date(activeStart).toISOString();
    const ms = new Date(endIso).getTime() - activeStart;
    const key = todayKey(new Date());
    const raw = await AsyncStorage.getItem(key);
    let log: Array<{ start: string; end: string; ms: number }> = [];
    try { log = raw ? JSON.parse(raw) : []; } catch { log = []; }
    log.push({ start: startIso, end: endIso, ms });
    await AsyncStorage.setItem(key, JSON.stringify(log));
    await AsyncStorage.removeItem(K_ACTIVE);
    setActiveStart(null);
    setPriorMsToday(prev => prev + ms);
  }

  const liveMs = activeStart ? (now - activeStart) : 0;
  const totalTodayMs = priorMsToday + liveMs;
  const isActive = !!activeStart;

  return (
    <View style={styles.wrap}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.label}>Today's total</Text>
        <Text style={styles.time}>{fmtHMS(totalTodayMs)}</Text>
        {isActive ? (
          <Text style={styles.live}>● Clocked in</Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={[
          styles.btn,
          isActive
            ? { backgroundColor: theme.dangerMuted, borderColor: theme.danger + '66' }
            : { backgroundColor: theme.successMuted, borderColor: theme.success + '66' },
        ]}
        onPress={isActive ? punchOut : punchIn}
        activeOpacity={0.75}
      >
        <Ionicons
          name={isActive ? 'stop-circle-outline' : 'play-circle-outline'}
          size={18}
          color={isActive ? theme.danger : theme.success}
        />
        <Text style={[
          styles.btnText,
          { color: isActive ? theme.danger : theme.success },
        ]}>
          {isActive ? 'Clock Out' : 'Clock In'}
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
