import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme, useThemePreference } from '../lib/themeContext';
import { ThemePreference } from '../lib/theme';

// Dark / Light / System picker. Drop into any settings screen.
export default function AppearanceSettings() {
  const theme = useTheme();
  const { preference, setPreference } = useThemePreference();

  const options: { value: ThemePreference; label: string; detail: string }[] = [
    { value: 'system', label: 'Match device',    detail: 'Follow your phone\'s dark/light setting.' },
    { value: 'dark',   label: 'Dark',            detail: 'Black background, cyan accent (default).' },
    { value: 'light',  label: 'Light',           detail: 'White background, forest-green accent.' },
  ];

  return (
    <View>
      <Text style={[styles.hint, { color: theme.textMuted }]}>
        Switch how LinkCrew looks. Matches your preference across every tab.
      </Text>
      {options.map(o => {
        const selected = preference === o.value;
        return (
          <TouchableOpacity
            key={o.value}
            style={[
              styles.row,
              { backgroundColor: theme.surface, borderColor: theme.border },
              selected && { borderColor: theme.accent, backgroundColor: theme.accentSoft },
            ]}
            onPress={() => setPreference(o.value)}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text style={[
                styles.label,
                { color: theme.textPrimary },
                selected && { color: theme.accent },
              ]}>{o.label}</Text>
              <Text style={[styles.detail, { color: theme.textSecondary }]}>{o.detail}</Text>
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

const styles = StyleSheet.create({
  hint: { fontSize: 13, lineHeight: 19, marginBottom: 14 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1,
  },
  label: { fontSize: 15, fontWeight: '600' },
  detail: { fontSize: 12, marginTop: 2 },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
});
