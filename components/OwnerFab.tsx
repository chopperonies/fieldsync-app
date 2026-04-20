import { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import QuickInvoiceModal from './QuickInvoiceModal';

// Universal quick-create button visible on every owner tab. Bottom-right
// round (+) that opens a sheet with the five most-common create actions.
// Quick Invoice has its own modal (walk-up client flow); other actions
// route to the corresponding tab with an ?open=… param the target screen
// reads to auto-open its existing create modal.
export default function OwnerFab() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [quickInvoiceOpen, setQuickInvoiceOpen] = useState(false);

  function go(path: string) {
    setSheetOpen(false);
    setTimeout(() => router.push(path as any), 60);
  }

  return (
    <>
      <TouchableOpacity style={styles.fab} activeOpacity={0.8} onPress={() => setSheetOpen(true)}>
        <Ionicons name="add" size={30} color="#000" />
      </TouchableOpacity>

      <Modal visible={sheetOpen} transparent animationType="fade" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSheetOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.grabber} />
            <Text style={styles.title}>Create</Text>

            <ActionRow
              icon="document-text-outline"
              label="New Invoice"
              detail="Walk-up client or existing — sends to their email"
              color="#4ade80"
              onPress={() => { setSheetOpen(false); setTimeout(() => setQuickInvoiceOpen(true), 60); }}
            />
            <ActionRow
              icon="hammer-outline"
              label="New Job"
              detail="Schedule work, add scope, assign crew"
              color="#0ea5e9"
              onPress={() => go('/(owner)/jobs?open=new')}
            />
            <ActionRow
              icon="person-add-outline"
              label="New Client"
              detail="Add to your CRM — portal invite on save"
              color="#a78bfa"
              onPress={() => go('/(owner)/clients?open=new')}
            />
            <ActionRow
              icon="pricetag-outline"
              label="New Quote"
              detail="Create a job with estimate + email work order"
              color="#6366f1"
              onPress={() => go('/(owner)/jobs?open=new_quote')}
            />
            <ActionRow
              icon="cash-outline"
              label="Record Payment"
              detail="Mark an unpaid invoice as paid"
              color="#facc15"
              onPress={() => go('/(owner)/invoices?open=record_payment')}
            />

            <TouchableOpacity style={styles.cancel} onPress={() => setSheetOpen(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
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

function ActionRow({
  icon, label, detail, color, onPress,
}: {
  icon: any; label: string; detail: string; color: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.iconWrap, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#444" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute', right: 20, bottom: 96,
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
    padding: 20, paddingBottom: 30,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#2a2a2a', marginBottom: 12 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 14 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#111', borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#1e1e1e',
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  rowLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
  rowDetail: { color: '#888', fontSize: 12, marginTop: 2 },
  cancel: { padding: 14, alignItems: 'center', marginTop: 4 },
  cancelText: { color: '#666', fontSize: 14 },
});
