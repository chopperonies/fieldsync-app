import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../lib/themeContext';

type Props = {
  visible: boolean;
  value?: string | null;
  title?: string;
  onClose: () => void;
  onSelect: (value: string | null) => void;
};

const SLOT_VALUES = [
  null,
  ...Array.from({ length: 48 }, (_, index) => {
    const hour = Math.floor(index / 2);
    const minute = index % 2 === 0 ? '00' : '30';
    return `${String(hour).padStart(2, '0')}:${minute}`;
  }),
];

export function formatTimeLabel(value?: string | null): string {
  if (!value) return 'Anytime';
  const [hhRaw, mmRaw = '00'] = String(value).split(':');
  const hh = Number(hhRaw);
  if (!Number.isFinite(hh)) return 'Anytime';
  const suffix = hh >= 12 ? 'PM' : 'AM';
  const hour = hh % 12 || 12;
  return `${hour}:${mmRaw.padStart(2, '0').slice(0, 2)} ${suffix}`;
}

export default function TimePickerSheet({ visible, value, title = 'Schedule time', onClose, onSelect }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: theme.overlay }]} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: theme.surfaceElevated,
              borderColor: theme.border,
              paddingBottom: Math.max(18, insets.bottom + 12),
            },
          ]}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.surfaceInset }]} hitSlop={8}>
              <Ionicons name="close" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.grid}>
            {SLOT_VALUES.map((slot) => {
              const selected = (slot || null) === (value || null);
              return (
                <TouchableOpacity
                  key={slot || 'anytime'}
                  style={[
                    styles.slot,
                    {
                      backgroundColor: selected ? theme.accentMuted : theme.surfaceInset,
                      borderColor: selected ? theme.accent + '66' : theme.border,
                    },
                  ]}
                  activeOpacity={0.75}
                  onPress={() => {
                    onSelect(slot);
                    onClose();
                  }}
                >
                  <Ionicons
                    name={slot ? 'time-outline' : 'sunny-outline'}
                    size={16}
                    color={selected ? theme.accent : theme.textSecondary}
                  />
                  <Text style={[styles.slotText, { color: selected ? theme.accent : theme.textPrimary }]}>
                    {formatTimeLabel(slot)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    maxHeight: '82%',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '800' },
  closeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 10 },
  slot: {
    width: '48.7%',
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  slotText: { fontSize: 14, fontWeight: '800' },
});
