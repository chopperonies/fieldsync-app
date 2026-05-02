import { useCallback, useEffect, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { mobileGet, mobilePost } from '../lib/mobileApi';
import { useTheme } from '../lib/themeContext';
import { Theme } from '../lib/theme';
import LineItemsPicker, { LineItem, lineItemsSummary, lineItemsTotal } from './LineItemsPicker';

type Client = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

type Mode = 'pick' | 'new';

export default function QuickInvoiceModal({ visible, onClose, onSuccess }: Props) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [mode, setMode] = useState<Mode>('new');
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setMode('new');
    setSearch(''); setSelectedClient(null);
    setNewName(''); setNewEmail(''); setNewPhone('');
    setAmount(''); setDescription('');
    setLineItems([]);
  }, []);

  useEffect(() => {
    if (!visible) return;
    reset();
    (async () => {
      setClientsLoading(true);
      try {
        const data = await mobileGet<Client[]>('/api/mobile/owner/clients');
        setClients(data || []);
      } catch {
        setClients([]);
      } finally {
        setClientsLoading(false);
      }
    })();
  }, [visible, reset]);

  const filtered = search.trim()
    ? clients.filter(c => c.name.toLowerCase().includes(search.trim().toLowerCase()))
    : clients;

  async function submit() {
    const catalogTotal = lineItemsTotal(lineItems);
    const amt = catalogTotal > 0 ? catalogTotal : parseFloat(amount);
    if (!amt || amt <= 0) return Alert.alert('Enter a valid amount');
    setSubmitting(true);
    try {
      const body: any = { amount: amt };
      const invoiceDescription = [
        description.trim() || null,
        lineItems.length ? lineItemsSummary(lineItems) : null,
      ].filter(Boolean).join('\n\n');
      if (invoiceDescription) body.description = invoiceDescription;
      if (selectedClient) body.client_id = selectedClient.id;
      else body.new_client = {
        name: newName.trim(),
        email: newEmail.trim() || undefined,
        phone: newPhone.trim() || undefined,
      };
      const resp: any = await mobilePost('/api/mobile/owner/invoices/quick', body);
      onClose();
      onSuccess?.();
      const who = resp?.client?.name || 'client';
      if (resp?.invoice_email_sent) {
        Alert.alert('Invoice sent', `Emailed to ${resp.invoice_emailed_to} for ${who}.`);
      } else if (resp?.client_created) {
        Alert.alert('Invoice created', `New client saved. No email on file, so nothing was sent — add an email in the client card to email future invoices.`);
      } else {
        Alert.alert('Invoice created', `No email on file for ${who} — nothing was sent.`);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not create invoice');
    } finally {
      setSubmitting(false);
    }
  }

  const payableAmount = lineItemsTotal(lineItems) || parseFloat(amount) || 0;
  const canSubmit = !!(payableAmount > 0 && (selectedClient || (mode === 'new' && newName.trim())));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.backdrop}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Quick Invoice</Text>
            <TouchableOpacity onPress={onClose} disabled={submitting}>
              <Text style={styles.close}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {/* Client section */}
            <Text style={styles.label}>Client</Text>
            {selectedClient ? (
              <View style={styles.selected}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedName}>{selectedClient.name}</Text>
                  {selectedClient.email && <Text style={styles.selectedMeta}>{selectedClient.email}</Text>}
                </View>
                <TouchableOpacity onPress={() => { setSelectedClient(null); setMode('pick'); }}>
                  <Text style={styles.changeLink}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : mode === 'new' ? (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Client name *"
                  placeholderTextColor={theme.textMuted}
                  value={newName}
                  onChangeText={setNewName}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Email (optional — needed to auto-send)"
                  placeholderTextColor={theme.textMuted}
                  value={newEmail}
                  onChangeText={setNewEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Phone (optional)"
                  placeholderTextColor={theme.textMuted}
                  value={newPhone}
                  onChangeText={setNewPhone}
                  keyboardType="phone-pad"
                />
                <TouchableOpacity onPress={() => setMode('pick')} style={styles.switchLink}>
                  <Text style={styles.switchLinkText}>Pick an existing client instead</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Search clients…"
                  placeholderTextColor={theme.textMuted}
                  value={search}
                  onChangeText={setSearch}
                />
                {clientsLoading ? (
                  <ActivityIndicator color={theme.accent} style={{ marginVertical: 12 }} />
                ) : (
                  <View style={styles.clientList}>
                    {filtered.slice(0, 6).map(c => (
                      <TouchableOpacity
                        key={c.id}
                        style={styles.clientRow}
                        onPress={() => {
                          setSelectedClient(c);
                          setSearch('');
                        }}
                      >
                        <Text style={styles.clientName}>{c.name}</Text>
                        {c.email && <Text style={styles.clientMeta}>{c.email}</Text>}
                      </TouchableOpacity>
                    ))}
                    {filtered.length === 0 && search.trim() !== '' && (
                      <Text style={styles.emptyText}>No match for "{search}".</Text>
                    )}
                  </View>
                )}
                <TouchableOpacity onPress={() => { setSelectedClient(null); setMode('new'); }} style={styles.switchLink}>
                  <Text style={styles.switchLinkText}>Use new client instead</Text>
                </TouchableOpacity>
              </>
            )}

            <LineItemsPicker
              items={lineItems}
              onChange={setLineItems}
              label="Product / Service"
              emptyLabel="Add catalog services or enter a custom invoice item."
            />

            {/* Amount + description */}
            <Text style={styles.label}>Amount</Text>
            <TextInput
              style={styles.input}
              placeholder={lineItems.length ? 'Amount set from line items' : '0.00'}
              placeholderTextColor={theme.textMuted}
              keyboardType="decimal-pad"
              value={lineItems.length ? lineItemsTotal(lineItems).toFixed(2) : amount}
              onChangeText={setAmount}
              editable={lineItems.length === 0}
            />

            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
              placeholder="e.g. Quarterly cleanup — front & side yards"
              placeholderTextColor={theme.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
            />
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.submit, !canSubmit && { opacity: 0.4 }]}
              onPress={submit}
              disabled={!canSubmit || submitting}
            >
              {submitting
                ? <ActivityIndicator color={theme.accentContrast} />
                : <Text style={styles.submitText}>Create & Send Invoice</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: t.overlay, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: t.surfaceElevated,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      maxHeight: '90%',
      overflow: 'hidden',
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 },
    title: { color: t.textPrimary, fontSize: 18, fontWeight: '800' },
    close: { color: t.accent, fontWeight: '600' },
    body: { paddingHorizontal: 20 },
    bodyContent: { paddingBottom: 18 },
    label: { color: t.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 8 },
    input: {
      backgroundColor: t.surfaceInset, borderWidth: 1, borderColor: t.border,
      borderRadius: 10, padding: 14, color: t.textPrimary, fontSize: 15, marginBottom: 10,
    },
    clientList: { borderRadius: 10, overflow: 'hidden', marginBottom: 4 },
    clientRow: {
      backgroundColor: t.surfaceInset, padding: 12,
      borderBottomWidth: 1, borderBottomColor: t.border,
    },
    clientName: { color: t.textPrimary, fontSize: 15, fontWeight: '600' },
    clientMeta: { color: t.textMuted, fontSize: 12, marginTop: 2 },
    emptyText: { color: t.textMuted, fontSize: 13, marginTop: 8, marginBottom: 4 },
    switchLink: { padding: 10, alignItems: 'center' },
    switchLinkText: { color: t.accent, fontSize: 13, fontWeight: '600' },
    selected: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: t.accentSoft, borderWidth: 1, borderColor: t.accent,
      borderRadius: 10, padding: 14, marginBottom: 4,
    },
    selectedName: { color: t.textPrimary, fontSize: 15, fontWeight: '700' },
    selectedMeta: { color: t.accent, fontSize: 12, marginTop: 2 },
    changeLink: { color: t.accent, fontWeight: '600', fontSize: 13 },
    footer: {
      paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24,
      borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.surfaceElevated,
    },
    submit: {
      backgroundColor: t.accent, borderRadius: 12, padding: 16,
      alignItems: 'center',
    },
    submitText: { color: t.accentContrast, fontWeight: '800', fontSize: 15 },
  });
}
