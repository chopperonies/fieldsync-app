import { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, Pressable, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import QuickInvoiceModal from './QuickInvoiceModal';

const TAB_BAR_HEIGHT = 60;      // keep in sync with (owner)/_layout.tsx
const FAB_GAP_ABOVE_TABS = 16;  // clear space above the bottom nav
const FAB_SIZE = 60;

// Action list is stored top→bottom; the stack renders reversed so the
// first entry sits closest to the FAB (just above it).
const ACTIONS: { label: string; icon: any; color: string; path?: string; quick?: 'invoice' }[] = [
  { label: 'Invoice',  icon: 'document-text', color: '#4ade80', quick: 'invoice' },
  { label: 'Job',      icon: 'hammer',        color: '#0ea5e9', path: '/(owner)/jobs?open=new' },
  { label: 'Client',   icon: 'person-add',    color: '#a78bfa', path: '/(owner)/clients?open=new' },
  { label: 'Quote',    icon: 'pricetag',      color: '#6366f1', path: '/(owner)/jobs?open=new_quote' },
  { label: 'Payment',  icon: 'cash',          color: '#facc15', path: '/(owner)/invoices?open=record_payment' },
  { label: 'Crew',     icon: 'person-circle', color: '#f472b6', path: '/(owner)/crew?open=new' },
];

export default function OwnerFab() {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [quickInvoiceOpen, setQuickInvoiceOpen] = useState(false);
  const rotate = useRef(new Animated.Value(0)).current;

  const fabBottom = insets.bottom + TAB_BAR_HEIGHT + FAB_GAP_ABOVE_TABS;

  function toggle(next: boolean) {
    setOpen(next);
    Animated.timing(rotate, {
      toValue: next ? 1 : 0,
      duration: 160,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }

  function pick(action: typeof ACTIONS[number]) {
    toggle(false);
    setTimeout(() => {
      if (action.quick === 'invoice') setQuickInvoiceOpen(true);
      else if (action.path) router.push(action.path as any);
    }, 80);
  }

  const fabRotation = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  return (
    <>
      <TouchableOpacity
        style={[styles.fab, { bottom: fabBottom }]}
        activeOpacity={0.85}
        onPress={() => toggle(!open)}
      >
        <Animated.View style={{ transform: [{ rotate: fabRotation }] }}>
          <Ionicons name="add" size={32} color="#000" />
        </Animated.View>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => toggle(false)}>
        <Pressable style={styles.backdrop} onPress={() => toggle(false)}>
          <View pointerEvents="box-none" style={styles.stackContainer}>
            <View style={[styles.stack, { bottom: fabBottom + FAB_SIZE + 16, right: 20 }]}>
              {ACTIONS.map((a, i) => (
                <Pressable
                  key={a.label}
                  onPress={() => pick(a)}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { opacity: 0.6 },
                    { marginBottom: 14 },
                  ]}
                >
                  <View style={styles.labelWrap}>
                    <Text style={styles.label}>{a.label}</Text>
                  </View>
                  <View style={[styles.iconCircle, { borderColor: a.color + '66' }]}>
                    <Ionicons name={a.icon} size={22} color={a.color} />
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>

      <QuickInvoiceModal
        visible={quickInvoiceOpen}
        onClose={() => setQuickInvoiceOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute', right: 20,
    width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2,
    backgroundColor: '#0ea5e9',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 1000,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  stackContainer: { flex: 1 },
  stack: { position: 'absolute', alignItems: 'flex-end' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  labelWrap: {
    backgroundColor: '#0f0f0f',
    borderWidth: 1, borderColor: '#2a2a2a',
    borderRadius: 14,
    paddingVertical: 8, paddingHorizontal: 14,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  label: { color: '#fff', fontSize: 15, fontWeight: '700' },
  iconCircle: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#0f0f0f', borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
