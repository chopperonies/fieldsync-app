import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileGet, mobilePatch, mobilePost } from '../../../lib/mobileApi';
import { useTheme } from '../../../lib/themeContext';
import { Theme } from '../../../lib/theme';
import CalendarPicker, { prettyDate } from '../../../components/CalendarPicker';
import TimePickerSheet, { formatTimeLabel } from '../../../components/TimePickerSheet';
import { callNumber, textNumber } from '../../../lib/phone';
import { ScreenHeader } from '../../../components/Flat';

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
  clients?: { id: string; name: string | null; email?: string | null; phone?: string | null; address?: string | null } | null;
};

function money(n?: number | null): string {
  if (n == null || Number.isNaN(Number(n))) return 'No estimate';
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function submittedAt(value?: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function OwnerRequestDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const styles = makeStyles(theme);
  const insets = useSafeAreaInsets();

  const [request, setRequest] = useState<RequestJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [bookDate, setBookDate] = useState<string | null>(null);
  const [bookTime, setBookTime] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    try {
      const data = await mobileGet<RequestJob>(`/api/mobile/owner/requests/${id}`);
      setRequest(data);
      setBookDate(data.scheduled_date || null);
      setBookTime(data.scheduled_time || null);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not load request');
      setRequest(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function bookRequest() {
    if (!request) return;
    setSaving(true);
    try {
      const updated = await mobilePatch<RequestJob>(`/api/mobile/owner/requests/${request.id}/action`, {
        action: 'book',
        scheduled_date: bookDate,
        scheduled_time: bookTime,
      });
      Alert.alert('Booked', 'Request moved to Schedule.', [
        {
          text: 'View schedule',
          onPress: () => router.replace({ pathname: '/(owner)/jobs', params: updated.scheduled_date ? { day: updated.scheduled_date } : undefined } as any),
        },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not book request.');
    } finally {
      setSaving(false);
    }
  }

  function declineRequest() {
    if (!request) return;
    Alert.alert('Decline request?', 'This removes it from active requests.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await mobilePatch(`/api/mobile/owner/requests/${request.id}/action`, { action: 'decline' });
            router.replace('/(owner)/requests' as any);
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not decline request.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  async function shareEstimate() {
    if (!request) return;
    const url = `https://linkcrew.io/workorder?job_id=${request.id}`;
    await Share.share({ message: `View request / estimate: ${url}`, url });
  }

  async function emailEstimate() {
    if (!request) return;
    try {
      const resp: any = await mobilePost(`/api/mobile/owner/jobs/${request.id}/send-workorder`);
      Alert.alert('Sent', `Estimate emailed to ${resp?.emailed_to || 'client'}.`);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not send estimate.');
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.accent} /></View>;
  }

  if (!request) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Request" />
        <View style={styles.center}>
          <Text style={styles.muted}>Request not found.</Text>
        </View>
      </View>
    );
  }

  const client = request.clients || null;
  const canEmail = !!client?.email;
  const canText = !!client?.phone;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Request" subtitle={request.clients?.name || undefined} />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.accent} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 28 + insets.bottom }}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.requestBadge}>
              <Ionicons name="file-tray-full-outline" size={14} color={theme.stageAmber} />
              <Text style={styles.requestBadgeText}>REQUEST</Text>
            </View>
            <Text style={styles.submitted}>Submitted {submittedAt(request.created_at)}</Text>
          </View>
          <Text style={styles.title}>{request.name}</Text>
          {request.address ? <Text style={styles.address}>{request.address}</Text> : null}
          <View style={styles.valueRow}>
            <View style={styles.valueBox}>
              <Text style={styles.valueLabel}>Estimate</Text>
              <Text style={styles.valueText}>{money(request.estimate_amount)}</Text>
            </View>
            <TouchableOpacity style={styles.valueBox} onPress={() => setCalendarOpen(true)} activeOpacity={0.7}>
              <Text style={styles.valueLabel}>Appointment</Text>
              <Text style={styles.valueText}>{prettyDate(bookDate)}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.timeBox} onPress={() => setTimePickerOpen(true)} activeOpacity={0.7}>
            <View>
              <Text style={styles.valueLabel}>Appointment time</Text>
              <Text style={styles.valueText}>{formatTimeLabel(bookTime)}</Text>
            </View>
            <Ionicons name="time-outline" size={18} color={theme.accent} />
          </TouchableOpacity>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.primaryAction} onPress={bookRequest} disabled={saving} activeOpacity={0.75}>
            {saving ? <ActivityIndicator color={theme.accentContrast} /> : (
              <>
                <Ionicons name="calendar" size={17} color={theme.accentContrast} />
                <Text style={styles.primaryActionText}>Book job</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryAction} onPress={declineRequest} disabled={saving} activeOpacity={0.75}>
            <Text style={styles.secondaryActionText}>Decline</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Client</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{client?.name || 'No client linked'}</Text>
            {client?.email ? <Text style={styles.cardLine}>{client.email}</Text> : null}
            {client?.phone ? <Text style={styles.cardLine}>{client.phone}</Text> : null}
            <View style={styles.contactRow}>
              <TouchableOpacity
                style={[styles.contactBtn, !canText && styles.disabledBtn]}
                disabled={!canText}
                onPress={() => textNumber(client?.phone)}
              >
                <Ionicons name="chatbubble-outline" size={17} color={canText ? theme.accent : theme.textMuted} />
                <Text style={[styles.contactText, !canText && styles.disabledText]}>Text</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.contactBtn, !client?.phone && styles.disabledBtn]}
                disabled={!client?.phone}
                onPress={() => callNumber(client?.phone)}
              >
                <Ionicons name="call-outline" size={17} color={client?.phone ? theme.accent : theme.textMuted} />
                <Text style={[styles.contactText, !client?.phone && styles.disabledText]}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.contactBtn, !canEmail && styles.disabledBtn]}
                disabled={!canEmail}
                onPress={() => Linking.openURL(`mailto:${client?.email}`)}
              >
                <Ionicons name="mail-outline" size={17} color={canEmail ? theme.accent : theme.textMuted} />
                <Text style={[styles.contactText, !canEmail && styles.disabledText]}>Email</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Request notes</Text>
          <View style={styles.card}>
            {request.description ? (
              <Text style={styles.bodyText}>{request.description}</Text>
            ) : (
              <Text style={styles.muted}>No request notes yet.</Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Estimate</Text>
          <View style={styles.card}>
            <Text style={styles.bodyText}>Share the estimate link, or email it if the client has an email on file.</Text>
            <View style={styles.estimateActions}>
              <TouchableOpacity style={styles.estimateBtn} onPress={shareEstimate} activeOpacity={0.75}>
                <Ionicons name="share-outline" size={17} color={theme.accent} />
                <Text style={styles.estimateBtnText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.estimateBtn, !canEmail && styles.disabledBtn]}
                onPress={emailEstimate}
                disabled={!canEmail}
                activeOpacity={0.75}
              >
                <Ionicons name="mail-outline" size={17} color={canEmail ? theme.accent : theme.textMuted} />
                <Text style={[styles.estimateBtnText, !canEmail && styles.disabledText]}>Email estimate</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.fullDetailBtn}
          onPress={() => router.push({ pathname: '/(owner)/job/[id]', params: { id: request.id } } as any)}
          activeOpacity={0.75}
        >
          <Ionicons name="create-outline" size={18} color={theme.textPrimary} />
          <Text style={styles.fullDetailText}>Open full job editor</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
        </TouchableOpacity>
      </ScrollView>

      <CalendarPicker
        visible={calendarOpen}
        value={bookDate}
        title="Appointment date"
        onClose={() => setCalendarOpen(false)}
        onSelect={setBookDate}
      />
      <TimePickerSheet
        visible={timePickerOpen}
        value={bookTime}
        title="Appointment time"
        onClose={() => setTimePickerOpen(false)}
        onSelect={setBookTime}
      />
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg, padding: 20 },
    hero: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      padding: 16,
    },
    heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    requestBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.stageAmber + '66',
      backgroundColor: theme.stageAmber + '18',
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    requestBadgeText: { color: theme.stageAmber, fontSize: 10, fontWeight: '900' },
    submitted: { color: theme.textMuted, fontSize: 12, fontWeight: '700' },
    title: { color: theme.textPrimary, fontSize: 22, fontWeight: '800', marginTop: 14 },
    address: { color: theme.textSecondary, fontSize: 14, marginTop: 5, lineHeight: 20 },
    valueRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
    valueBox: {
      flex: 1,
      backgroundColor: theme.surfaceInset,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
    },
    valueLabel: { color: theme.textMuted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
    valueText: { color: theme.textPrimary, fontSize: 14, fontWeight: '800', marginTop: 4 },
    timeBox: {
      marginTop: 10,
      backgroundColor: theme.surfaceInset,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    primaryAction: {
      flex: 1.4,
      minHeight: 46,
      borderRadius: 8,
      backgroundColor: theme.accent,
      flexDirection: 'row',
      gap: 7,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryActionText: { color: theme.accentContrast, fontSize: 14, fontWeight: '800' },
    secondaryAction: {
      flex: 1,
      minHeight: 46,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
    },
    secondaryActionText: { color: theme.danger, fontSize: 14, fontWeight: '800' },
    section: { marginTop: 18 },
    sectionTitle: { color: theme.textPrimary, fontSize: 13, fontWeight: '900', marginBottom: 8 },
    card: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      padding: 14,
    },
    cardTitle: { color: theme.textPrimary, fontSize: 16, fontWeight: '800' },
    cardLine: { color: theme.textSecondary, fontSize: 13, marginTop: 4 },
    contactRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
    contactBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 40,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.accent + '55',
      backgroundColor: theme.accentSoft,
    },
    contactText: { color: theme.accent, fontSize: 13, fontWeight: '800' },
    disabledBtn: { borderColor: theme.border, backgroundColor: theme.surfaceInset },
    disabledText: { color: theme.textMuted },
    bodyText: { color: theme.textSecondary, fontSize: 14, lineHeight: 21 },
    muted: { color: theme.textMuted, fontSize: 13, lineHeight: 19 },
    estimateActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
    estimateBtn: {
      flex: 1,
      minHeight: 42,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.accent + '55',
      backgroundColor: theme.accentSoft,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
    },
    estimateBtnText: { color: theme.accent, fontSize: 13, fontWeight: '800' },
    fullDetailBtn: {
      marginTop: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    fullDetailText: { color: theme.textPrimary, fontSize: 14, fontWeight: '800', flex: 1 },
  });
}
