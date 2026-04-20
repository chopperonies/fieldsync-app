import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Switch,
  StyleSheet, ActivityIndicator, Alert, ScrollView, RefreshControl, Linking
} from 'react-native';
import { mobileGet, mobilePatch, mobilePost } from '../../lib/mobileApi';
import { getPlan, getBiometricEnabled, setBiometricEnabled } from '../../lib/storage';
import { isBiometricAvailable } from '../../lib/biometric';

const PRIORITY_PLANS = ['team', 'pro', 'business'];

export default function OwnerSettings() {
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasPrioritySupport, setHasPrioritySupport] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [stripeConnected, setStripeConnected] = useState<boolean | null>(null);
  const [stripeBusy, setStripeBusy] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const plan = await getPlan();
      setHasPrioritySupport(PRIORITY_PLANS.includes(plan?.plan ?? ''));
      const [enabled, available] = await Promise.all([getBiometricEnabled(), isBiometricAvailable()]);
      setBiometricEnabledState(enabled);
      setBiometricAvailable(available);
      const [data, stripe] = await Promise.all([
        mobileGet<{ company_name?: string; phone?: string; address?: string }>('/api/mobile/owner/tenant'),
        mobileGet<{ connected: boolean }>('/api/mobile/owner/stripe-connect/status').catch(() => null),
      ]);
      if (data) {
        setCompanyName(data.company_name || '');
        setPhone(data.phone || '');
        setAddress(data.address || '');
      }
      if (stripe) setStripeConnected(!!stripe.connected);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to load settings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function connectStripe() {
    setStripeBusy(true);
    try {
      const resp = await mobilePost<{ url: string }>('/api/mobile/owner/stripe-connect/start');
      if (resp?.url) {
        await Linking.openURL(resp.url);
        Alert.alert(
          'Complete in browser',
          'Finish the Stripe connection in your browser, then pull to refresh when you return.',
        );
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not start Stripe Connect');
    } finally {
      setStripeBusy(false);
    }
  }

  async function disconnectStripe() {
    Alert.alert(
      'Disconnect Stripe?',
      'Clients will no longer be able to pay invoices by card until you reconnect.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setStripeBusy(true);
            try {
              await mobilePost('/api/mobile/owner/stripe-connect/disconnect');
              setStripeConnected(false);
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Disconnect failed');
            } finally {
              setStripeBusy(false);
            }
          },
        },
      ],
    );
  }

  async function save() {
    setSaving(true);
    try {
      await mobilePatch('/api/mobile/owner/tenant', {
        company_name: companyName.trim(),
        phone: phone.trim(),
        address: address.trim(),
      });
      Alert.alert('Saved', 'Company settings updated.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#0ea5e9" /></View>;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#0ea5e9" />}
    >
      <Text style={styles.sectionLabel}>Company Info</Text>
      <Text style={styles.hint}>This appears on invoices sent to your clients.</Text>

      <Text style={styles.fieldLabel}>Company Name</Text>
      <TextInput
        style={styles.input}
        placeholder="Your company name"
        placeholderTextColor="#555"
        value={companyName}
        onChangeText={setCompanyName}
      />

      <Text style={styles.fieldLabel}>Phone</Text>
      <TextInput
        style={styles.input}
        placeholder="Business phone number"
        placeholderTextColor="#555"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />

      <Text style={styles.fieldLabel}>Address</Text>
      <TextInput
        style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
        placeholder="Business address"
        placeholderTextColor="#555"
        value={address}
        onChangeText={setAddress}
        multiline
      />

      <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
        {saving
          ? <ActivityIndicator color="#000" />
          : <Text style={styles.saveBtnText}>Save Changes</Text>
        }
      </TouchableOpacity>

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>Payments</Text>
      <Text style={styles.hint}>Connect Stripe to let clients pay invoices by card through their portal.</Text>
      {stripeConnected === null ? (
        <ActivityIndicator color="#0ea5e9" style={{ marginTop: 8 }} />
      ) : stripeConnected ? (
        <>
          <View style={[styles.row, { marginBottom: 12 }]}>
            <View style={styles.statusDot} />
            <Text style={[styles.rowLabel, { flex: 1 }]}>Stripe connected</Text>
          </View>
          <TouchableOpacity style={styles.outlineBtn} onPress={disconnectStripe} disabled={stripeBusy}>
            {stripeBusy
              ? <ActivityIndicator color="#ef4444" />
              : <Text style={styles.outlineBtnTextDanger}>Disconnect Stripe</Text>}
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity style={styles.saveBtn} onPress={connectStripe} disabled={stripeBusy}>
          {stripeBusy
            ? <ActivityIndicator color="#000" />
            : <Text style={styles.saveBtnText}>Connect Stripe</Text>}
        </TouchableOpacity>
      )}

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>Security</Text>
      {biometricAvailable ? (
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>App Lock</Text>
            <Text style={styles.hint}>Require Face ID or fingerprint when reopening the app.</Text>
          </View>
          <Switch
            value={biometricEnabled}
            onValueChange={async (val) => {
              setBiometricEnabledState(val);
              await setBiometricEnabled(val);
            }}
            trackColor={{ false: '#2a2a2a', true: '#0ea5e9' }}
            thumbColor="#fff"
          />
        </View>
      ) : (
        <Text style={styles.hint}>No biometric hardware found on this device.</Text>
      )}

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>Logo</Text>
      <Text style={styles.hint}>To upload your company logo, visit the Settings page on the web dashboard at linkcrew.io.</Text>

      {hasPrioritySupport && (
        <>
          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>Support</Text>
          <Text style={styles.hint}>As a Team+ member you have access to priority support.</Text>
          <TouchableOpacity
            style={styles.supportBtn}
            onPress={() => Linking.openURL('mailto:hello@linkcrew.io?subject=Priority Support Request')}
          >
            <Text style={styles.supportBtnText}>Contact Priority Support</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  content: { padding: 20, gap: 4 },
  sectionLabel: { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 4, marginTop: 8 },
  hint: { color: '#555', fontSize: 13, marginBottom: 16, lineHeight: 18 },
  fieldLabel: { color: '#888', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
    borderRadius: 10, padding: 14, color: '#fff', fontSize: 15,
  },
  saveBtn: {
    backgroundColor: '#0ea5e9', borderRadius: 12,
    padding: 16, alignItems: 'center', marginTop: 24,
  },
  saveBtnText: { color: '#000', fontWeight: '700', fontSize: 16 },
  divider: { height: 1, backgroundColor: '#2a2a2a', marginVertical: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  rowLabel: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 2 },
  supportBtn: {
    borderWidth: 1, borderColor: '#0ea5e9', borderRadius: 12,
    padding: 16, alignItems: 'center', marginTop: 8,
  },
  supportBtnText: { color: '#0ea5e9', fontWeight: '700', fontSize: 15 },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#4ade80', marginRight: 10 },
  outlineBtn: {
    borderWidth: 1, borderColor: '#ef4444', borderRadius: 12,
    padding: 14, alignItems: 'center', marginTop: 4,
  },
  outlineBtnTextDanger: { color: '#ef4444', fontWeight: '700', fontSize: 15 },
});
