import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../lib/themeContext';
import { Theme } from '../lib/theme';

// OTA-safe, no native deps. A clean progress card: big "X / Y",
// subtitle, and a segmented bar. When Y = 0 we show an empty state.

type Props = {
  completed: number;
  total: number;
  label?: string;
  emptyLabel?: string;
};

export default function ProgressGauge({
  completed, total, label = 'Jobs completed today', emptyLabel = 'No jobs scheduled for today',
}: Props) {
  const theme = useTheme();
  const styles = makeStyles(theme);

  if (total <= 0) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.emptyLabel}>{emptyLabel}</Text>
      </View>
    );
  }

  const pct = Math.max(0, Math.min(1, total > 0 ? completed / total : 0));
  const allDone = completed >= total;
  const barColor = allDone ? theme.success : theme.accent;

  return (
    <View style={styles.wrap}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.countRow}>
          <Text style={[styles.countBig, { color: barColor }]}>{completed}</Text>
          <Text style={styles.countSep}>/</Text>
          <Text style={styles.countTotal}>{total}</Text>
          {allDone ? (
            <View style={[styles.chip, { backgroundColor: theme.successMuted, borderColor: theme.success + '55' }]}>
              <Text style={[styles.chipText, { color: theme.success }]}>ALL DONE</Text>
            </View>
          ) : null}
        </View>

        {/* Segmented bar — one cell per scheduled job so crew with 2–4
            jobs/day get a clean discrete visual. Caps at 10 cells. */}
        {total <= 10 ? (
          <View style={styles.segments}>
            {Array.from({ length: total }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.segment,
                  { backgroundColor: i < completed ? barColor : theme.surfaceInset },
                ]}
              />
            ))}
          </View>
        ) : (
          <View style={styles.continuous}>
            <View style={[styles.continuousFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: barColor }]} />
          </View>
        )}
      </View>
    </View>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    wrap: {
      marginHorizontal: 16,
      marginTop: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 14,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
    },
    label: { color: t.textSecondary, fontSize: 12, fontWeight: '700' },
    countRow: {
      flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 6,
    },
    countBig: {
      fontSize: 38, fontWeight: '800',
      fontVariant: ['tabular-nums'],
      letterSpacing: -1,
    },
    countSep: { color: t.textMuted, fontSize: 28, fontWeight: '700' },
    countTotal: { color: t.textPrimary, fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'] },
    chip: {
      marginLeft: 'auto',
      paddingVertical: 3, paddingHorizontal: 10,
      borderRadius: 999, borderWidth: 1,
    },
    chipText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

    segments: {
      flexDirection: 'row', gap: 4, marginTop: 10,
    },
    segment: { flex: 1, height: 8, borderRadius: 4 },

    continuous: {
      height: 8, marginTop: 10,
      borderRadius: 4,
      backgroundColor: t.surfaceInset,
      overflow: 'hidden',
    },
    continuousFill: { height: '100%', borderRadius: 4 },

    emptyLabel: { color: t.textMuted, fontSize: 13, fontWeight: '600', textAlign: 'center', paddingVertical: 4 },
  });
}
