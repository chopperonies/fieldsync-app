import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileGet, mobilePatch, mobilePost } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import CalendarPicker, { prettyDate } from '../../components/CalendarPicker';
import LineItemsPicker, { LineItem, lineItemsSummary, lineItemsTotal } from '../../components/LineItemsPicker';

type RequestJob = {
  id: string;
  name: string;
  address: string | null;
  description: string | null;
  status: string;
  estimate_amount: number | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  created_at: string;
  updated_at: string;
  clients?: { id: string; name: string | null; email?: string | null; phone?: string | null } | null;
};

function money(n?: number | null): string | null {
  if (n == null || Number.isNaN(Number(n))) return null;
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function dateLabel(value?: string | null): string {
  if (!value) return 'No date picked';
  const d = new Date(`${value}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function OwnerRequests() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ open?: string }>();

  const [requests, setRequests] = useState<RequestJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [bookDate, setBookDate] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [estimate, setEstimate] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await mobileGet<RequestJob[]>('/api/mobile/owner/requests');
      setRequests(data || []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (params.open === 'new') {
      setCreateOpen(true);
      setTimeout(() => router.setParams({ open: undefined } as any), 100);
    }
  }, [params.open]);

  function resetCreate() {
    setName('');
    setAddress('');
    setDescription('');
    setEstimate('');
    setLineItems([]);
  }

  function closeCreate() {
    Keyboard.dismiss();
    setCreateOpen(false);
    resetCreate();
  }

  async function createRequest() {
    if (!name.trim() || !address.trim()) return Alert.alert('Fill in name and address');
    const catalogTotal = lineItemsTotal(lineItems);
    const finalEstimate = catalogTotal > 0 ? catalogTotal : (estimate.trim() ? parseFloat(estimate) : null);
    if (finalEstimate !== null && (!Number.isFinite(finalEstimate) || finalEstimate < 0)) {
      return Alert.alert('Invalid amount');
    }
    const finalDescription = [
      description.trim() || null,
      lineItems.length ? `Line items:\n${lineItemsSummary(lineItems)}` : null,
    ].filter(Boolean).join('\n\n') || null;

    setSaving(true);
    try {
      const created = await mobilePost<RequestJob>('/api/mobile/owner/requests', {
        name: name.trim(),
        address: address.trim(),
        description: finalDescription,
        estimate_amount: finalEstimate,
      });
      setRequests(prev => [created, ...prev.filter(r => r.id !== created.id)]);
      closeCreate();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not create request.');
    } finally {
      setSaving(false);
    }
  }

  async function bookRequest(request: RequestJob) {
    setBookingId(request.id);
    setBookDate(request.scheduled_date || null);
  }

  async function saveBooking() {
    if (!bookingId) return;
    setSaving(true);
    try {
      const updated = await mobilePatch<RequestJob>(`/api/mobile/owner/requests/${bookingId}/action`, {
        action: 'book',
        scheduled_date: bookDate,
      });
      setRequests(prev => prev.filter(r => r.id !== updated.id));
      setBookingId(null);
      Alert.alert('Booked', 'Request moved to Schedule.', [
        { text: 'Stay here', style: 'cancel' },
        {
          text: 'View schedule',
          onPress: () => router.push({ pathname: '/(owner)/jobs', params: bookDate ? { day: bookDate } : undefined } as any),
        },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not book request.');
    } finally {
      setSaving(false);
    }
  }

  function declineRequest(request: RequestJob) {
    Alert.alert('Decline request?', 'This removes it from active requests.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          try {
            await mobilePatch(`/api/mobile/owner/requests/${request.id}/action`, { action: 'decline' });
            setRequests(prev => prev.filter(r => r.id !== request.id));
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not decline request.');
          }
        },
      },
    ]);
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.accent} /></View>;
  }

  const booking = requests.find(r => r.id === bookingId) || null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Requests</Text>
          <Text style={styles.subtitle}>{requests.length} active pre-booking {requests.length === 1 ? 'item' : 'items'}</Text>
        </View>
        <TouchableOpacity style={styles.newBtn} onPress={() => setCreateOpen(true)} activeOpacity={0.7}>
          <Ionicons name="add" size={18} color={theme.accentContrast} />
          <Text style={styles.newBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={requests}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.accent} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="file-tray-full-outline" size={32} color={theme.textMuted} />
            <Text style={styles.emptyTitle}>No open requests</Text>
            <TouchableOpacity onPress={() => setCreateOpen(true)}>
              <Text style={styles.emptyCta}>+ Add a request</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          const amount = money(item.estimate_amount);
          return (
            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.card}
              onPress={() => router.push({ pathname: '/(owner)/request/[id]', params: { id: item.id } } as any)}
            >
              <View style={styles.cardTop}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.requestName} numberOfLines={1}>{item.name}</Text>
                  {item.clients?.name ? <Text style={styles.clientName} numberOfLines={1}>{item.clients.name}</Text> : null}
                  {item.address ? <Text style={styles.address} numberOfLines={1}>{item.address}</Text> : null}
                </View>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>REQUEST</Text>
                </View>
              </View>

              {item.description ? <Text style={styles.description} numberOfLines={2}>{item.description}</Text> : null}

              <View style={styles.metaRow}>
                <View style={styles.metaPill}>
                  <Ionicons name="calendar-outline" size={13} color={theme.textSecondary} />
                  <Text style={styles.metaText}>{dateLabel(item.scheduled_date)}</Text>
                </View>
                {amount ? (
                  <View style={styles.metaPill}>
                    <Ionicons name="cash-outline" size={13} color={theme.textSecondary} />
                    <Text style={styles.metaText}>{amount}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.actions}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => declineRequest(item)} activeOpacity={0.7}>
                  <Text style={styles.secondaryBtnText}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={() => bookRequest(item)} activeOpacity={0.7}>
                  <Ionicons name="calendar" size={15} color={theme.accentContrast} />
                  <Text style={styles.primaryBtnText}>Book job</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <Modal visible={createOpen} transparent animationType="slide" onRequestClose={closeCreate}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={[styles.modal, { paddingBottom: 22 + insets.bottom }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New request</Text>
              <TouchableOpacity onPress={closeCreate} hitSlop={8}>
                <Ionicons name="close" size={22} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <TextInput style={styles.input} placeholder="Request name" placeholderTextColor={theme.textMuted} value={name} onChangeText={setName} />
              <TextInput style={styles.input} placeholder="Address" placeholderTextColor={theme.textMuted} value={address} onChangeText={setAddress} />
              <TextInput
                style={[styles.input, styles.textarea]}
                placeholder="Client notes / scope"
                placeholderTextColor={theme.textMuted}
                value={description}
                onChangeText={setDescription}
                multiline
              />
              <TextInput
                style={styles.input}
                placeholder={lineItems.length ? 'Estimate set from line items' : 'Rough estimate'}
                placeholderTextColor={theme.textMuted}
                value={lineItems.length ? String(lineItemsTotal(lineItems).toFixed(2)) : estimate}
                onChangeText={setEstimate}
                keyboardType="decimal-pad"
                editable={lineItems.length === 0}
              />
              <LineItemsPicker
                items={lineItems}
                onChange={setLineItems}
                label="Product / Service"
                emptyLabel="Add services from your catalog or enter a custom request item."
              />
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeCreate}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={createRequest} disabled={saving}>
                {saving ? <ActivityIndicator color={theme.accentContrast} /> : <Text style={styles.saveText}>Add request</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!booking} transparent animationType="slide" onRequestClose={() => setBookingId(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { paddingBottom: 22 + insets.bottom }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Book job</Text>
              <TouchableOpacity onPress={() => setBookingId(null)} hitSlop={8}>
                <Ionicons name="close" size={22} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
            {booking ? (
              <View style={{ gap: 12 }}>
                <Text style={styles.bookingName}>{booking.name}</Text>
                <TouchableOpacity style={styles.scheduleField} onPress={() => setCalendarOpen(true)} activeOpacity={0.7}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.scheduleLabel}>Schedule</Text>
                    <Text style={styles.scheduleValue}>{prettyDate(bookDate)}</Text>
                  </View>
                  <Ionicons name="calendar-outline" size={20} color={theme.accent} />
                </TouchableOpacity>
              </View>
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setBookingId(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveBooking} disabled={saving}>
                {saving ? <ActivityIndicator color={theme.accentContrast} /> : <Text style={styles.saveText}>Move to schedule</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CalendarPicker
        visible={calendarOpen}
        value={bookDate}
        title="Schedule date"
        onClose={() => setCalendarOpen(false)}
        onSelect={setBookDate}
      />
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 12,
    },
    title: { color: theme.textPrimary, fontSize: 22, fontWeight: '800' },
    subtitle: { color: theme.textSecondary, fontSize: 13, marginTop: 4 },
    newBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: theme.accent,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    newBtnText: { color: theme.accentContrast, fontSize: 13, fontWeight: '800' },
    separator: { height: 10 },
    card: {
      marginHorizontal: 16,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      padding: 14,
    },
    cardTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    requestName: { color: theme.textPrimary, fontSize: 16, fontWeight: '800' },
    clientName: { color: theme.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 3 },
    address: { color: theme.textSecondary, fontSize: 13, marginTop: 3 },
    badge: {
      borderWidth: 1,
      borderColor: theme.stageAmber + '66',
      backgroundColor: theme.stageAmber + '18',
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    badgeText: { color: theme.stageAmber, fontSize: 10, fontWeight: '900' },
    description: { color: theme.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 12 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    metaPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: theme.surfaceInset,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    metaText: { color: theme.textSecondary, fontSize: 12, fontWeight: '700' },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 },
    secondaryBtn: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 13,
      paddingVertical: 9,
    },
    secondaryBtnText: { color: theme.textSecondary, fontSize: 13, fontWeight: '800' },
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 8,
      backgroundColor: theme.accent,
      paddingHorizontal: 13,
      paddingVertical: 9,
    },
    primaryBtnText: { color: theme.accentContrast, fontSize: 13, fontWeight: '800' },
    empty: { alignItems: 'center', paddingTop: 100, gap: 10 },
    emptyTitle: { color: theme.textPrimary, fontSize: 16, fontWeight: '800' },
    emptyCta: { color: theme.accent, fontSize: 14, fontWeight: '800' },
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: theme.overlay,
    },
    modal: {
      maxHeight: '90%',
      backgroundColor: theme.surfaceElevated,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingHorizontal: 16,
      paddingTop: 16,
      borderTopWidth: 1,
      borderColor: theme.border,
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    modalTitle: { color: theme.textPrimary, fontSize: 20, fontWeight: '800' },
    input: {
      backgroundColor: theme.surfaceInset,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      color: theme.textPrimary,
      fontSize: 15,
      paddingHorizontal: 12,
      paddingVertical: 12,
      marginBottom: 10,
    },
    textarea: { height: 92, textAlignVertical: 'top' },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
    cancelBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 13,
    },
    cancelText: { color: theme.textSecondary, fontWeight: '800' },
    saveBtn: {
      flex: 1.4,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      backgroundColor: theme.accent,
      paddingVertical: 13,
    },
    saveText: { color: theme.accentContrast, fontWeight: '800' },
    bookingName: { color: theme.textPrimary, fontSize: 16, fontWeight: '800' },
    scheduleField: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: theme.surfaceInset,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      padding: 13,
    },
    scheduleLabel: { color: theme.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
    scheduleValue: { color: theme.textPrimary, fontSize: 15, fontWeight: '700', marginTop: 3 },
  });
}
