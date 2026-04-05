import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, RefreshControl, Alert,
  Modal, ScrollView, Linking
} from 'react-native';
import { supabase, Client } from '../../lib/supabase';
import { getUser } from '../../lib/storage';
import { setCache, getStaleCache } from '../../lib/cache';

export default function OwnerClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [jobCounts, setJobCounts] = useState<Record<string, number>>({});

  // Add client modal
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const loadData = useCallback(async () => {
    const user = await getUser();
    try {
      let q = supabase.from('clients').select('*').order('name');
      if (user?.tenant_id) q = q.eq('tenant_id', user.tenant_id);
      const { data, error } = await q;
      if (error) throw error;
      const result = data || [];
      setClients(result);
      setIsOffline(false);
      await setCache('owner_clients_' + user?.tenant_id, result);

      if (result.length > 0) {
        const counts: Record<string, number> = {};
        await Promise.all(result.map(async (c) => {
          const { count } = await supabase
            .from('jobs').select('id', { count: 'exact', head: true }).eq('client_id', c.id);
          counts[c.id] = count || 0;
        }));
        setJobCounts(counts);
        await setCache('owner_client_job_counts_' + user?.tenant_id, counts);
      }
    } catch {
      const cached = await getStaleCache<Client[]>('owner_clients_' + user?.tenant_id);
      if (cached) {
        setClients(cached);
        setIsOffline(true);
        const cachedCounts = await getStaleCache<Record<string, number>>('owner_client_job_counts_' + user?.tenant_id);
        if (cachedCounts) setJobCounts(cachedCounts);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function addClient() {
    if (!newName.trim()) return Alert.alert('Name is required');
    setSaving(true);
    const user = await getUser();
    const { data, error } = await supabase.from('clients').insert({
      name: newName.trim(),
      email: newEmail.trim() || null,
      phone: newPhone.trim() || null,
      company: newCompany.trim() || null,
      notes: newNotes.trim() || null,
      tenant_id: user?.tenant_id,
    }).select().single();
    if (error) { Alert.alert('Error', error.message); setSaving(false); return; }
    setClients(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setJobCounts(prev => ({ ...prev, [data.id]: 0 }));
    resetForm();
    setShowAdd(false);
    setSaving(false);
  }

  function resetForm() {
    setNewName(''); setNewEmail(''); setNewPhone('');
    setNewCompany(''); setNewNotes('');
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#0265dc" /></View>;
  }

  return (
    <View style={styles.container}>
      {isOffline && (
        <View style={{ backgroundColor: '#7f1d1d', paddingVertical: 8, paddingHorizontal: 16 }}>
          <Text style={{ color: '#fca5a5', fontSize: 12, fontWeight: '600', textAlign: 'center' }}>
            📵 No connection — showing cached clients
          </Text>
        </View>
      )}
      <FlatList
        data={clients}
        keyExtractor={c => c.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#0265dc" />}
        ListEmptyComponent={<Text style={styles.empty}>No clients yet. Add your first client.</Text>}
        renderItem={({ item }) => {
          const isOpen = selected === item.id;
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => setSelected(isOpen ? null : item.id)}
              activeOpacity={0.8}
            >
              <View style={styles.cardRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.clientName}>{item.name}</Text>
                  {item.company && <Text style={styles.company}>{item.company}</Text>}
                </View>
                <View style={styles.jobBadge}>
                  <Text style={styles.jobBadgeText}>{jobCounts[item.id] || 0} jobs</Text>
                </View>
              </View>

              {isOpen && (
                <View style={styles.details}>
                  {item.email && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Email</Text>
                      <Text style={styles.detailValue}>{item.email}</Text>
                    </View>
                  )}
                  {item.phone && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Phone</Text>
                      <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.phone}`)}>
                        <Text style={[styles.detailValue, { color: '#0265dc' }]}>{item.phone}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {item.notes && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Notes</Text>
                      <Text style={styles.detailValue}>{item.notes}</Text>
                    </View>
                  )}
                  <Text style={styles.addedDate}>Added {new Date(item.created_at).toLocaleDateString()}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}>
        <Text style={styles.fabText}>+ Add Client</Text>
      </TouchableOpacity>

      <Modal visible={showAdd} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>New Client</Text>
              <TextInput style={styles.input} placeholder="Full name *" placeholderTextColor="#555" value={newName} onChangeText={setNewName} />
              <TextInput style={styles.input} placeholder="Company (optional)" placeholderTextColor="#555" value={newCompany} onChangeText={setNewCompany} />
              <TextInput style={styles.input} placeholder="Email (optional)" placeholderTextColor="#555" value={newEmail} onChangeText={setNewEmail} keyboardType="email-address" autoCapitalize="none" />
              <TextInput style={styles.input} placeholder="Phone (optional)" placeholderTextColor="#555" value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" />
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                placeholder="Notes (optional)"
                placeholderTextColor="#555"
                value={newNotes}
                onChangeText={setNewNotes}
                multiline
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { resetForm(); setShowAdd(false); }}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={addClient} disabled={saving}>
                  {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveText}>Add Client</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  empty: { color: '#444', textAlign: 'center', marginTop: 60, fontSize: 15 },
  card: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#2a2a2a' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#0265dc22', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#0265dc', fontSize: 18, fontWeight: '700' },
  clientName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  company: { color: '#666', fontSize: 13, marginTop: 1 },
  jobBadge: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  jobBadgeText: { color: '#666', fontSize: 12, fontWeight: '600' },
  details: { marginTop: 14, borderTopWidth: 1, borderTopColor: '#2a2a2a', paddingTop: 12, gap: 8 },
  detailRow: { flexDirection: 'row', gap: 8 },
  detailLabel: { color: '#555', fontSize: 13, width: 50 },
  detailValue: { color: '#ccc', fontSize: 13, flex: 1 },
  addedDate: { color: '#444', fontSize: 11, marginTop: 4 },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    backgroundColor: '#0265dc', borderRadius: 28,
    paddingVertical: 14, paddingHorizontal: 24, elevation: 4,
  },
  fabText: { color: '#000', fontWeight: '700', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#1a1a1a', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  input: {
    backgroundColor: '#0a0a0a', borderWidth: 1, borderColor: '#2a2a2a',
    borderRadius: 10, padding: 14, color: '#fff', fontSize: 15, marginBottom: 12,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  cancelText: { color: '#888', fontWeight: '600' },
  saveBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center', backgroundColor: '#0265dc' },
  saveText: { color: '#000', fontWeight: '700' },
});
