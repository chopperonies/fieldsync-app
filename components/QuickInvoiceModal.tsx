import { useCallback, useEffect, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { mobileGet, mobilePost } from '../lib/mobileApi';

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

type Mode = 'pick' | 'new' | 'amount';

export default function QuickInvoiceModal({ visible, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>('pick');
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setMode('pick');
    setSearch(''); setSelectedClient(null);
    setNewName(''); setNewEmail(''); setNewPhone('');
    setAmount(''); setDescription('');
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
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return Alert.alert('Enter a valid amount');
    setSubmitting(true);
    try {
      const body: any = { amount: amt };
      if (description.trim()) body.description = description.trim();
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

  const canSubmit = !!(amount && parseFloat(amount) > 0 && (selectedClient || (mode === 'new' && newName.trim())));

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

          <ScrollView keyboardShouldPersistTaps="handled">
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
                  placeholderTextColor="#555"
                  value={newName}
                  onChangeText={setNewName}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Email (optional — needed to auto-send)"
                  placeholderTextColor="#555"
                  value={newEmail}
                  onChangeText={setNewEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Phone (optional)"
                  placeholderTextColor="#555"
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
                  placeholderTextColor="#555"
                  value={search}
                  onChangeText={setSearch}
                />
                {clientsLoading ? (
                  <ActivityIndicator color="#0ea5e9" style={{ marginVertical: 12 }} />
                ) : (
                  <View style={styles.clientList}>
                    {filtered.slice(0, 6).map(c => (
                      <TouchableOpacity key={c.id} style={styles.clientRow} onPress={() => setSelectedClient(c)}>
                        <Text style={styles.clientName}>{c.name}</Text>
                        {c.email && <Text style={styles.clientMeta}>{c.email}</Text>}
                      </TouchableOpacity>
                    ))}
                    {filtered.length === 0 && search.trim() !== '' && (
                      <Text style={styles.emptyText}>No match for "{search}".</Text>
                    )}
                  </View>
                )}
                <TouchableOpacity onPress={() => setMode('new')} style={styles.switchLink}>
                  <Text style={styles.switchLinkText}>+ New client (walk-up)</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Amount + description */}
            <Text style={styles.label}>Amount</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor="#444"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />

            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
              placeholder="e.g. Quarterly cleanup — front & side yards"
              placeholderTextColor="#555"
              value={description}
              onChangeText={setDescription}
              multiline
            />

            <TouchableOpacity
              style={[styles.submit, !canSubmit && { opacity: 0.4 }]}
              onPress={submit}
              disabled={!canSubmit || submitting}
            >
              {submitting
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.submitText}>Create &amp; Send Invoice</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0f0f0f',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 28, maxHeight: '90%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  close: { color: '#0ea5e9', fontWeight: '600' },
  label: { color: '#888', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 8 },
  input: {
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
    borderRadius: 10, padding: 14, color: '#fff', fontSize: 15, marginBottom: 10,
  },
  clientList: { borderRadius: 10, overflow: 'hidden', marginBottom: 4 },
  clientRow: {
    backgroundColor: '#1a1a1a', padding: 12,
    borderBottomWidth: 1, borderBottomColor: '#1f1f1f',
  },
  clientName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  clientMeta: { color: '#666', fontSize: 12, marginTop: 2 },
  emptyText: { color: '#555', fontSize: 13, marginTop: 8, marginBottom: 4 },
  switchLink: { padding: 10, alignItems: 'center' },
  switchLinkText: { color: '#0ea5e9', fontSize: 13, fontWeight: '600' },
  selected: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0ea5e911', borderWidth: 1, borderColor: '#0ea5e9',
    borderRadius: 10, padding: 14, marginBottom: 4,
  },
  selectedName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  selectedMeta: { color: '#bae6fd', fontSize: 12, marginTop: 2 },
  changeLink: { color: '#0ea5e9', fontWeight: '600', fontSize: 13 },
  submit: {
    backgroundColor: '#0ea5e9', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 22,
  },
  submitText: { color: '#000', fontWeight: '800', fontSize: 15 },
});
