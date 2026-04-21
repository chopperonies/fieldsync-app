import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/themeContext';
import { Theme } from '../lib/theme';

// Pure-JS month-grid calendar. No native module — OTA-able. Used in
// Add/Edit Job modals to set scheduled_date.

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromDateString(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

export function prettyDate(s: string | null | undefined): string {
  if (!s) return 'Not scheduled';
  const d = fromDateString(s);
  if (!d) return 'Not scheduled';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

type Props = {
  visible: boolean;
  value: string | null;        // YYYY-MM-DD
  onClose: () => void;
  onSelect: (value: string | null) => void;
  title?: string;
};

export default function CalendarPicker({ visible, value, onClose, onSelect, title }: Props) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const initial = value ? fromDateString(value) || new Date() : new Date();
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const d = new Date(initial);
    d.setDate(1);
    return d;
  });

  function shiftMonth(delta: number) {
    const next = new Date(viewMonth);
    next.setMonth(next.getMonth() + delta);
    setViewMonth(next);
  }

  const firstWeekday = viewMonth.getDay();
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const todayStr = toDateString(new Date());

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>{title || 'Pick a date'}</Text>
            <TouchableOpacity onPress={onClose}><Text style={styles.close}>Close</Text></TouchableOpacity>
          </View>

          <View style={styles.monthRow}>
            <TouchableOpacity onPress={() => shiftMonth(-1)} style={styles.monthBtn}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>
              {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </Text>
            <TouchableOpacity onPress={() => shiftMonth(1)} style={styles.monthBtn}>
              <Ionicons name="chevron-forward" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.weekHeader}>
            {DAYS.map((d, i) => <Text key={i} style={styles.weekHeaderCell}>{d}</Text>)}
          </View>

          <View style={styles.grid}>
            {cells.map((d, i) => {
              if (!d) return <View key={i} style={styles.cellEmpty} />;
              const str = toDateString(d);
              const isToday = str === todayStr;
              const isSelected = value === str;
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.cell,
                    isToday && styles.cellToday,
                    isSelected && styles.cellSelected,
                  ]}
                  onPress={() => { onSelect(str); onClose(); }}
                >
                  <Text style={[
                    styles.cellText,
                    isToday && !isSelected && { color: theme.accent },
                    isSelected && { color: theme.accentContrast, fontWeight: '800' },
                  ]}>
                    {d.getDate()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.quickBtn} onPress={() => { onSelect(toDateString(new Date())); onClose(); }}>
              <Text style={styles.quickBtnText}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickBtn} onPress={() => {
              const t = new Date(); t.setDate(t.getDate() + 1);
              onSelect(toDateString(t)); onClose();
            }}>
              <Text style={styles.quickBtnText}>Tomorrow</Text>
            </TouchableOpacity>
            {value && (
              <TouchableOpacity style={styles.clearBtn} onPress={() => { onSelect(null); onClose(); }}>
                <Text style={styles.clearBtnText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: t.overlay, alignItems: 'center', justifyContent: 'center', padding: 20 },
    card: {
      backgroundColor: t.surfaceElevated,
      borderRadius: 16, padding: 16, width: '100%', maxWidth: 380,
      borderWidth: 1, borderColor: t.border,
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    title: { color: t.textPrimary, fontSize: 16, fontWeight: '800' },
    close: { color: t.accent, fontSize: 13, fontWeight: '700' },

    monthRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 8,
    },
    monthBtn: { padding: 6 },
    monthLabel: { color: t.textPrimary, fontSize: 16, fontWeight: '700' },

    weekHeader: { flexDirection: 'row', marginTop: 4 },
    weekHeaderCell: { flex: 1, textAlign: 'center', color: t.textMuted, fontSize: 11, fontWeight: '700', paddingVertical: 6 },

    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: {
      width: `${100 / 7}%`, aspectRatio: 1,
      alignItems: 'center', justifyContent: 'center',
    },
    cellEmpty: { width: `${100 / 7}%`, aspectRatio: 1 },
    cellToday: { borderWidth: 1, borderColor: t.accent, borderRadius: 20 },
    cellSelected: { backgroundColor: t.accent, borderRadius: 20 },
    cellText: { color: t.textPrimary, fontSize: 14, fontWeight: '600' },

    footer: { flexDirection: 'row', gap: 8, marginTop: 12 },
    quickBtn: {
      flex: 1, borderWidth: 1, borderColor: t.border, borderRadius: 10,
      paddingVertical: 10, alignItems: 'center',
    },
    quickBtnText: { color: t.textPrimary, fontSize: 13, fontWeight: '700' },
    clearBtn: {
      flex: 1, borderWidth: 1, borderColor: t.danger, borderRadius: 10,
      paddingVertical: 10, alignItems: 'center',
    },
    clearBtnText: { color: t.danger, fontSize: 13, fontWeight: '700' },
  });
}
