import { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, Pressable, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, usePathname } from 'expo-router';
import { useTheme } from '../lib/themeContext';
import { useRole, canCreateInvoices, canSeeFinancials, canManageCrew } from '../lib/useRole';
import QuickInvoiceModal from './QuickInvoiceModal';

const TAB_BAR_HEIGHT = 62;      // keep in sync with (owner)/_layout.tsx
const FAB_GAP_ABOVE_TABS = 16;  // clear space above the bottom nav
const FAB_SIZE = 60;

type Action = { label: string; icon: any; color: string; path?: string; quick?: 'invoice'; key: string };

// Full action catalog. Each entry is a one-tap path — no cascading sub-
// sheets. Job/Install/Repair used to live behind a TypePicker; they're now
// surfaced as direct tiles here so the only place to "add anything" is
// this FAB.
const ALL_ACTIONS: Action[] = [
  { key: 'estimate', label: 'Estimate', icon: 'document-text-outline', color: '#0e7490', path: '/(owner)/jobs?open=new_estimate' },
  { key: 'job',      label: 'Job',      icon: 'hammer-outline',        color: '#2f7d20', path: '/(owner)/jobs?open=new_job' },
  { key: 'invoice',  label: 'Invoice',  icon: 'cash-outline',          color: '#1d4ed8', quick: 'invoice' },
  { key: 'install',  label: 'Install',  icon: 'build-outline',         color: '#0e7490', path: '/(owner)/jobs?open=new_install' },
  { key: 'repair',   label: 'Repair',   icon: 'construct-outline',     color: '#b7791f', path: '/(owner)/jobs?open=new_repair' },
  { key: 'expense',  label: 'Expense',  icon: 'receipt-outline',       color: '#7c3aed', path: '/(owner)/expense-new' },
  { key: 'client',   label: 'Client',   icon: 'person-add-outline',    color: '#0f766e', path: '/(owner)/clients?open=new' },
  { key: 'request',  label: 'Request',  icon: 'file-tray-full-outline', color: '#b7791f', path: '/(owner)/requests?open=new' },
  { key: 'message',  label: 'Message',  icon: 'chatbubble-outline',    color: '#0e7490', path: '/(owner)/message-new' },
];

export default function OwnerFab() {
  const theme = useTheme();
  const role = useRole();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [quickInvoiceOpen, setQuickInvoiceOpen] = useState(false);
  const rotate = useRef(new Animated.Value(0)).current;

  const fabBottom = insets.bottom + TAB_BAR_HEIGHT + FAB_GAP_ABOVE_TABS;

  // Role-gate the FAB stack. Crew get nothing to create → hide the FAB
  // completely (returning null). Manager gets everything except Crew
  // management. Owner gets everything.
  const actions = ALL_ACTIONS.filter(a => {
    if (a.key === 'crew') return canManageCrew(role);
    if (a.key === 'invoice' || a.key === 'expense') return canCreateInvoices(role);
    if (a.key === 'estimate') return canCreateInvoices(role);
    if (a.key === 'client') return canCreateInvoices(role);
    if (a.key === 'job' || a.key === 'install' || a.key === 'repair') return canCreateInvoices(role);
    if (a.key === 'request') return canCreateInvoices(role);
    return true;
  });
  if (actions.length === 0 || pathname.includes('expense-new')) return null;

  function toggle(next: boolean) {
    setOpen(next);
    Animated.timing(rotate, {
      toValue: next ? 1 : 0,
      duration: 160,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }

  function pick(action: Action) {
    toggle(false);
    setTimeout(() => {
      if (action.quick === 'invoice') setQuickInvoiceOpen(true);
      else if (action.key === 'expense') router.push({ pathname: '/(owner)/expense-new', params: { ts: String(Date.now()) } } as any);
      else if (action.path) router.push(action.path as any);
    }, 80);
  }

  const fabRotation = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  return (
    <>
      {!quickInvoiceOpen ? (
        <TouchableOpacity
          style={[styles.fab, { bottom: fabBottom, backgroundColor: '#244457' }]}
          activeOpacity={0.85}
          onPress={() => toggle(!open)}
        >
          <Animated.View style={{ transform: [{ rotate: fabRotation }] }}>
            <Ionicons name="add" size={32} color={theme.accentContrast} />
          </Animated.View>
        </TouchableOpacity>
      ) : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => toggle(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: theme.overlay }]} onPress={() => toggle(false)}>
          <View pointerEvents="box-none" style={styles.sheetWrap}>
            <Pressable
              style={[
                styles.sheet,
                {
                  backgroundColor: theme.surfaceElevated,
                  paddingBottom: Math.max(18, insets.bottom + 12),
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.grabber} />
              <View style={styles.sheetHeader}>
                <View>
                  <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>Create</Text>
                  <Text style={[styles.sheetSub, { color: theme.textSecondary }]}>Start a client, request, job, or billing workflow.</Text>
                </View>
                <TouchableOpacity onPress={() => toggle(false)} hitSlop={10} style={[styles.closeBtn, { backgroundColor: theme.surfaceInset }]}>
                  <Ionicons name="close" size={18} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.quickStrip}>
                <TouchableOpacity style={styles.quickLink} onPress={() => pick({ key: 'schedule', label: 'Schedule', icon: 'calendar', color: theme.accent, path: '/(owner)/jobs' })}>
                  <Ionicons name="calendar-outline" size={15} color={theme.accent} />
                  <Text style={[styles.quickText, { color: theme.accent }]}>Schedule</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickLink} onPress={() => pick({ key: 'requests', label: 'Requests', icon: 'file-tray-full', color: theme.accent, path: '/(owner)/requests' })}>
                  <Ionicons name="file-tray-full-outline" size={15} color={theme.accent} />
                  <Text style={[styles.quickText, { color: theme.accent }]}>Requests</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickLink} onPress={() => pick({ key: 'search', label: 'Search', icon: 'search', color: theme.accent, path: '/(owner)/search' })}>
                  <Ionicons name="search-outline" size={15} color={theme.accent} />
                  <Text style={[styles.quickText, { color: theme.accent }]}>Search</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.actionGrid}>
                {actions.map((a) => (
                <Pressable
                  key={a.label}
                  onPress={() => pick(a)}
                  style={({ pressed }) => [
                    styles.tile,
                    { backgroundColor: theme.surfaceInset, borderColor: theme.border },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <View style={[styles.iconCircle, { backgroundColor: a.color + '18' }]}>
                    <Ionicons name={a.icon} size={22} color={a.color} />
                  </View>
                  <Text style={[styles.label, { color: theme.textPrimary }]}>{a.label}</Text>
                </Pressable>
              ))}
              </View>
            </Pressable>
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
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 1000,
  },
  backdrop: { flex: 1 },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#d4d4d8',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 20, fontWeight: '800' },
  sheetSub: { fontSize: 13, lineHeight: 18, marginTop: 3, maxWidth: 250 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickStrip: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  quickLink: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(36, 68, 87, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  quickText: { fontSize: 12, fontWeight: '900' },
  tile: {
    width: '31.9%',
    minHeight: 72,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
  },
  label: { fontSize: 12, fontWeight: '900', textAlign: 'center' },
  iconCircle: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
});
