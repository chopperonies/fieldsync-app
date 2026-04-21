import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { useTheme, useThemePreference } from '../lib/themeContext';
import { ThemePreference, allThemes, Theme, resolveTheme } from '../lib/theme';

// Theme picker with live swatch previews. Drop into any settings screen.
export default function AppearanceSettings() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const { preference, setPreference } = useThemePreference();

  const systemResolved = resolveTheme('system', scheme ?? null);
  const systemOption = {
    value: 'system' as ThemePreference,
    label: 'Match device',
    tagline: `Follows your phone — currently ${systemResolved.label}.`,
    theme: systemResolved,
  };
  const options = [
    systemOption,
    ...allThemes.map(t => ({ value: t.name as ThemePreference, label: t.label, tagline: t.tagline, theme: t })),
  ];

  return (
    <View>
      <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 14 }}>
        Pick the look that feels right. You can change this anytime.
      </Text>
      {options.map(o => {
        const selected = preference === o.value;
        return (
          <TouchableOpacity
            key={o.value}
            style={[
              styles.row,
              {
                backgroundColor: selected ? theme.accentSoft : theme.surface,
                borderColor: selected ? theme.accent : theme.border,
              },
            ]}
            onPress={() => setPreference(o.value)}
            activeOpacity={0.75}
          >
            <ThemeSwatch t={o.theme as Theme} />
            {o.value === 'system' && (
              <View style={{ position: 'absolute', left: 22, top: 14, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 10 }}>🌓</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[
                styles.label,
                { color: theme.textPrimary },
                selected && { color: theme.accent },
              ]}>{o.label}</Text>
              <Text style={[styles.detail, { color: theme.textSecondary }]}>{o.tagline}</Text>
            </View>
            <View style={[
              styles.radio,
              { borderColor: theme.textMuted },
              selected && { borderColor: theme.accent },
            ]}>
              {selected && <View style={[styles.radioInner, { backgroundColor: theme.accent }]} />}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function ThemeSwatch({ t }: { t: Theme }) {
  // Mini-preview — two stacked rows showing surface + accent, framed by bg.
  return (
    <View style={[styles.swatch, { backgroundColor: t.bg, borderColor: t.borderStrong }]}>
      <View style={[styles.swatchTop, { backgroundColor: t.surface }]} />
      <View style={[styles.swatchBottom, { backgroundColor: t.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 12, padding: 12,
    marginBottom: 8, borderWidth: 1,
  },
  label: { fontSize: 15, fontWeight: '700' },
  detail: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  swatch: {
    width: 40, height: 40, borderRadius: 8, overflow: 'hidden',
    borderWidth: 1,
  },
  swatchTop: { height: '60%', width: '100%' },
  swatchBottom: { height: '40%', width: '100%' },
  systemSwatch: {
    width: 40, height: 40, borderRadius: 8,
    backgroundColor: '#e5e7eb',
    alignItems: 'center', justifyContent: 'center',
  },
});
