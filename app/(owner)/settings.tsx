import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, ScrollView, RefreshControl, Linking
} from 'react-native';
import { mobileGet, mobilePatch, mobilePost } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { useRole, canSeeFinancials, canEditSettings } from '../../lib/useRole';
import { clearUser } from '../../lib/storage';
import { router } from 'expo-router';
import LockSettings from '../../components/LockSettings';
import AppearanceSettings from '../../components/AppearanceSettings';
import MyProfile from '../../components/MyProfile';

export default function OwnerSettings() {
  const theme = useTheme();
  const role = useRole();
  const canEditCompany = canEditSettings(role);
  const showFinancialSections = canSeeFinancials(role);
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stripeConnected, setStripeConnected] = useState<boolean | null>(null);
  const [stripeBusy, setStripeBusy] = useState(false);
  const [planName, setPlanName] = useState<string | null>(null);
  const [subStatus, setSubStatus] = useState<string | null>(null);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [hasStripeCustomer, setHasStripeCustomer] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [data, stripe] = await Promise.all([
        mobileGet<{
          company_name?: string; phone?: string; address?: string;
          plan?: string; subscription_status?: string; trial_ends_at?: string;
          stripe_customer_id?: string;
        }>('/api/mobile/owner/tenant'),
        mobileGet<{ connected: boolean }>('/api/mobile/owner/stripe-connect/status').catch(() => null),
      ]);
      if (data) {
        setCompanyName(data.company_name || '');
        setPhone(data.phone || '');
        setAddress(data.address || '');
        setPlanName(data.plan || null);
        setSubStatus(data.subscription_status || null);
        setTrialEndsAt(data.trial_ends_at || null);
        setHasStripeCustomer(!!data.stripe_customer_id);
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

  async function openBillingPortal() {
    setPortalBusy(true);
    try {
      const resp = await mobilePost<{ url: string }>('/api/mobile/owner/billing-portal');
      if (resp?.url) await Linking.openURL(resp.url);
    } catch (e: any) {
      if (String(e?.message || '').includes('No billing account')) {
        Alert.alert('No subscription', 'Subscribe at linkcrew.io/app to manage billing.');
      } else {
        Alert.alert('Error', e?.message || 'Could not open billing portal');
      }
    } finally {
      setPortalBusy(false);
    }
  }

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
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#0ea5e9" />}
    >
      <Text style={[styles.sectionLabel, { color: theme.textPrimary }]}>My Profile</Text>
      <MyProfile />

      <View style={styles.divider} />

      <Text style={[styles.sectionLabel, { color: theme.textPrimary }]}>Company Info</Text>
      <Text style={styles.hint}>
        {canEditCompany
          ? 'This appears on invoices sent to your clients.'
          : 'Ask your account owner to update these details.'}
      </Text>

      <Text style={styles.fieldLabel}>Company Name</Text>
      <TextInput
        style={[styles.input, !canEditCompany && { opacity: 0.7 }]}
        placeholder="Your company name"
        placeholderTextColor="#555"
        value={companyName}
        onChangeText={setCompanyName}
        editable={canEditCompany}
      />

      <Text style={styles.fieldLabel}>Phone</Text>
      <TextInput
        style={[styles.input, !canEditCompany && { opacity: 0.7 }]}
        placeholder="Business phone number"
        placeholderTextColor="#555"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        editable={canEditCompany}
      />

      <Text style={styles.fieldLabel}>Address</Text>
      <TextInput
        style={[styles.input, { height: 80, textAlignVertical: 'top' }, !canEditCompany && { opacity: 0.7 }]}
        placeholder="Business address"
        placeholderTextColor="#555"
        value={address}
        onChangeText={setAddress}
        multiline
        editable={canEditCompany}
      />

      {canEditCompany ? (
        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#000" />
            : <Text style={styles.saveBtnText}>Save Changes</Text>
          }
        </TouchableOpacity>
      ) : null}

      {showFinancialSections ? (
        <>
      <View style={styles.divider} />

      <Text style={[styles.sectionLabel, { color: theme.textPrimary }]}>Subscription</Text>
      <View style={[styles.row, { marginBottom: 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>
            {planName ? planName.charAt(0).toUpperCase() + planName.slice(1) : 'No plan'}
            {subStatus ? ` · ${subStatus}` : ''}
          </Text>
          {trialEndsAt && subStatus === 'trialing' && (
            <Text style={styles.hint}>
              Trial ends {new Date(trialEndsAt).toLocaleDateString()}
            </Text>
          )}
        </View>
      </View>
      {hasStripeCustomer ? (
        <TouchableOpacity style={styles.outlineBtnBlue} onPress={openBillingPortal} disabled={portalBusy}>
          {portalBusy
            ? <ActivityIndicator color="#0ea5e9" />
            : <Text style={styles.outlineBtnTextBlue}>Manage Subscription</Text>}
        </TouchableOpacity>
      ) : (
        <Text style={styles.hint}>Subscribe at linkcrew.io/app to manage billing from your phone.</Text>
      )}

      <View style={styles.divider} />

      <Text style={[styles.sectionLabel, { color: theme.textPrimary }]}>Payments</Text>
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
        </>
      ) : null}

      <View style={styles.divider} />

      <Text style={[styles.sectionLabel, { color: theme.textPrimary }]}>Appearance</Text>
      <AppearanceSettings />

      <View style={styles.divider} />

      <Text style={[styles.sectionLabel, { color: theme.textPrimary }]}>Security</Text>
      <LockSettings />

      <View style={styles.divider} />

      <Text style={[styles.sectionLabel, { color: theme.textPrimary }]}>Support</Text>
      <TouchableOpacity
        style={styles.supportBtn}
        onPress={() => Linking.openURL('mailto:support@linkcrew.io')}
      >
        <Text style={styles.supportBtnText}>Email support@linkcrew.io</Text>
      </TouchableOpacity>

      <View style={styles.divider} />

      <TouchableOpacity
        style={[styles.supportBtn, { borderColor: theme.danger }]}
        onPress={async () => { await clearUser(); router.replace('/login'); }}
      >
        <Text style={[styles.supportBtnText, { color: theme.danger }]}>Sign Out</Text>
      </TouchableOpacity>

      <View style={styles.divider} />

      <TouchableOpacity
        style={[styles.supportBtn, { borderColor: theme.danger }]}
        onPress={() => {
          Alert.alert(
            'Delete account?',
            'This permanently deletes your account and, if you are the sole owner, the entire company workspace and all jobs, clients, and invoices. This cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete forever',
                style: 'destructive',
                onPress: async () => {
                  try {
                    const res = await mobilePost('/api/mobile/me/delete-account', { confirm: 'DELETE' });
                    await clearUser();
                    Alert.alert('Account deleted', 'Your account has been removed.');
                    router.replace('/landing' as any);
                  } catch (e: any) {
                    Alert.alert('Error', e?.message || 'Could not delete account.');
                  }
                },
              },
            ],
          );
        }}
      >
        <Text style={[styles.supportBtnText, { color: theme.danger }]}>Delete Account</Text>
      </TouchableOpacity>
      <Text style={[styles.hint, { marginTop: 6, textAlign: 'center' }]}>
        Required by app-store guidelines.
      </Text>
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
  outlineBtnBlue: {
    borderWidth: 1, borderColor: '#0ea5e9', borderRadius: 12,
    padding: 14, alignItems: 'center', marginTop: 4,
  },
  outlineBtnTextBlue: { color: '#0ea5e9', fontWeight: '700', fontSize: 15 },
});
