import { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import QuickInvoiceModal from './QuickInvoiceModal';

// Universal quick-create button visible on every owner tab. Bottom-right
// round (+) that opens a sheet with the five most-common create actions.
// Quick Invoice has its own modal (walk-up client flow); other actions
// route to the corresponding tab with an ?open=… param the target screen
// reads to auto-open its existing create modal.
const TAB_BAR_HEIGHT = 60;      // keep in sync with (owner)/_layout.tsx
const FAB_GAP_ABOVE_TABS = 16;  // clear space above the bottom nav

export default function OwnerFab() {
  const insets = useSafeAreaInsets();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [quickInvoiceOpen, setQuickInvoiceOpen] = useState(false);

  // Lift the FAB clear of the tab bar on every device (gesture bar, notched,
  // or plain). Old constant bottom=96 landed on top of the More icon on
  // devices with tall system insets.
  const fabBottom = insets.bottom + TAB_BAR_HEIGHT + FAB_GAP_ABOVE_TABS;

  function go(path: string) {
    setSheetOpen(false);
    setTimeout(() => router.push(path as any), 60);
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.fab, { bottom: fabBottom }]}
        activeOpacity={0.8}
        onPress={() => setSheetOpen(true)}
      >
        <Ionicons name="add" size={32} color="#000" />
      </TouchableOpacity>

      <Modal visible={sheetOpen} transparent animationType="fade" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSheetOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]} onPress={() => {}}>
            <View style={styles.grabber} />
            <Text style={styles.title}>Quick Create</Text>
            <Text style={styles.subtitle}>Pick an action to start right now.</Text>

            <View style={styles.grid}>
              <ActionTile
                icon="document-text"
                label="Invoice"
                color="#4ade80"
                onPress={() => { setSheetOpen(false); setTimeout(() => setQuickInvoiceOpen(true), 60); }}
              />
              <ActionTile
                icon="hammer"
                label="Job"
                color="#0ea5e9"
                onPress={() => go('/(owner)/jobs?open=new')}
              />
              <ActionTile
                icon="person-add"
                label="Client"
                color="#a78bfa"
                onPress={() => go('/(owner)/clients?open=new')}
              />
              <ActionTile
                icon="pricetag"
                label="Quote"
                color="#6366f1"
                onPress={() => go('/(owner)/jobs?open=new_quote')}
              />
              <ActionTile
                icon="cash"
                label="Payment"
                color="#facc15"
                onPress={() => go('/(owner)/invoices?open=record_payment')}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <QuickInvoiceModal
        visible={quickInvoiceOpen}
        onClose={() => setQuickInvoiceOpen(false)}
      />
    </>
  );
}

function ActionTile({
  icon, label, color, onPress,
}: {
  icon: any; label: string; color: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.tile} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.tileIcon, { backgroundColor: color + '22', borderColor: color + '44' }]}>
        <Ionicons name={icon} size={26} color={color} />
      </View>
      <Text style={styles.tileLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute', right: 20,
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#0ea5e9',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 1000,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0f0f0f',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#2a2a2a', marginBottom: 14 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  subtitle: { color: '#888', fontSize: 13, marginTop: 4, marginBottom: 18 },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  tile: {
    width: '31.5%',
    backgroundColor: '#111', borderRadius: 16, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: '#1e1e1e',
  },
  tileIcon: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, marginBottom: 10,
  },
  tileLabel: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
