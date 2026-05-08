import { ReactNode } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, StyleProp, ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../lib/themeContext';
import { Theme } from '../lib/theme';

// Small, Jobber-style primitives. Content sits flush to the screen
// (no card containers), hairline dividers separate rows, section
// headers provide hierarchy.

// Inline screen header used in place of the React Navigation system
// header. 22pt bold title, optional subtitle, optional back chevron,
// optional right slot. Honors the safe-area top inset.
export function ScreenHeader({
  title, subtitle, right, showBack = true, onBack,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  showBack?: boolean;
  onBack?: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: showBack ? 8 : 16,
      paddingTop: insets.top + 10,
      paddingBottom: 10,
    }}>
      {showBack ? (
        <TouchableOpacity
          onPress={onBack || (() => router.back())}
          hitSlop={8}
          style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="chevron-back" size={26} color={t.textPrimary} />
        </TouchableOpacity>
      ) : null}
      <View style={{ flex: 1, minWidth: 0, paddingLeft: showBack ? 0 : 0 }}>
        <Text style={{ color: t.textPrimary, fontSize: 22, fontWeight: '800' }} numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text style={{ color: t.textSecondary, fontSize: 13, marginTop: 2 }} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>
      {right ? <View style={{ marginLeft: 12 }}>{right}</View> : null}
    </View>
  );
}

export function SectionHeader({
  label, hint, right, onPressRight,
}: { label: string; hint?: string; right?: string; onPressRight?: () => void }) {
  const t = useTheme();
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingTop: 22, paddingBottom: 8,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flex: 1 }}>
        <Text style={{ color: t.textPrimary, fontSize: 17, fontWeight: '800' }}>{label}</Text>
        {hint ? <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '600' }}>{hint}</Text> : null}
      </View>
      {right ? (
        <TouchableOpacity onPress={onPressRight} hitSlop={8}>
          <Text style={{ color: t.accent, fontSize: 14, fontWeight: '700' }}>{right}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function Divider({ inset = 16 }: { inset?: number }) {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginLeft: inset }} />;
}

// A flush-edge row (Jobber-style). Pass leading (avatar/icon), title,
// subtitle, trailing (amount/chip/chevron). Keep dividers on parent.
export function Row({
  leading, title, subtitle, trailing, onPress, titleColor,
}: {
  leading?: ReactNode; title: string; subtitle?: string | null; trailing?: ReactNode;
  onPress?: () => void; titleColor?: string;
}) {
  const t = useTheme();
  const Wrap: any = onPress ? TouchableOpacity : View;
  return (
    <Wrap activeOpacity={0.7} onPress={onPress} style={rowStyles.row}>
      {leading ? <View style={rowStyles.leading}>{leading}</View> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[rowStyles.title, { color: titleColor || t.textPrimary }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[rowStyles.sub, { color: t.textSecondary }]} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {trailing ? <View style={rowStyles.trailing}>{trailing}</View> : null}
    </Wrap>
  );
}

// Small Jobber-style pill: 28–32px tall, minimal padding, optional
// leading icon. Active fill comes from a tint color (default accent).
export function Pill({
  label, active, onPress, icon, tint, showIcon = 'always', style,
}: {
  label: string; active?: boolean; onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  tint?: string; // hex color; used for active fill + text
  showIcon?: 'always' | 'active-only';
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const accentTint = tint || t.accent;
  const bg = active ? accentTint + '22' : t.surfaceInset;
  const border = active ? accentTint + '55' : 'transparent';
  const color = active ? accentTint : t.textSecondary;
  const showingIcon = icon && (showIcon === 'always' || active);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        height: 30, paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: bg,
        borderWidth: 1, borderColor: border,
      }, style]}
    >
      {showingIcon ? <Ionicons name={icon!} size={13} color={color} /> : null}
      <Text style={{ color, fontSize: 13, fontWeight: '700' }}>{label}</Text>
    </TouchableOpacity>
  );
}

// Horizontal-scrolling pill row with edge padding.
export function PillRow({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        gap: 6,
        paddingHorizontal: padded ? 16 : 0,
        paddingVertical: 6,
      }}
    >
      {children}
    </ScrollView>
  );
}

// Leading circle used in rows (avatar / icon). 36px, soft-tinted background.
export function RowAvatar({
  letter, icon, tint, theme,
}: { letter?: string; icon?: keyof typeof Ionicons.glyphMap; tint?: string; theme?: Theme }) {
  const t = theme || useTheme();
  const color = tint || t.accent;
  return (
    <View style={{
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: color + '22',
      alignItems: 'center', justifyContent: 'center',
    }}>
      {letter
        ? <Text style={{ color, fontSize: 14, fontWeight: '800' }}>{letter}</Text>
        : icon
          ? <Ionicons name={icon} size={18} color={color} />
          : null}
    </View>
  );
}

// A small right-side chip (status tag). Use for trailing slot on rows.
export function StatusChip({ label, tint }: { label: string; tint: string }) {
  return (
    <View style={{
      paddingVertical: 2, paddingHorizontal: 8,
      borderRadius: 8,
      backgroundColor: tint + '22',
    }}>
      <Text style={{ color: tint, fontSize: 11, fontWeight: '800' }}>{label}</Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    minHeight: 56,
  },
  leading: {},
  trailing: { marginLeft: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '600' },
  sub: { fontSize: 12, marginTop: 2 },
});
