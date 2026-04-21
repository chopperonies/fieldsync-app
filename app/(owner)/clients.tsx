import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, RefreshControl, Alert,
  Modal, ScrollView, Linking, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Client } from '../../lib/supabase';
import { getUser } from '../../lib/storage';
import { setCache, getStaleCache } from '../../lib/cache';
import { mobileGet, mobilePost, mobilePatch } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';

export default function OwnerClients() {
  const theme = useTheme();
  const styles = makeStyles(theme);
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

  // Edit client modal
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [editName, setEditName] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  function openEdit(c: Client) {
    setEditClient(c);
    setEditName(c.name || '');
    setEditCompany((c as any).company || '');
    setEditEmail(c.email || '');
    setEditPhone(c.phone || '');
    setEditAddress((c as any).address || '');
    setEditNotes((c as any).notes || '');
  }

  async function saveEdit() {
    if (!editClient) return;
    if (!editName.trim()) return Alert.alert('Name is required');
    setEditSaving(true);
    try {
      const updated = await mobilePatch<Client>(`/api/mobile/owner/clients/${editClient.id}`, {
        name: editName.trim(),
        company: editCompany.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim(),
        address: editAddress.trim(),
        notes: editNotes.trim(),
      });
      setClients(prev => prev.map(c => c.id === editClient.id ? { ...c, ...updated } : c));
      setEditClient(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save');
    } finally {
      setEditSaving(false);
    }
  }

  const loadData = useCallback(async () => {
    const user = await getUser();
    try {
      const result = await mobileGet<Client[]>('/api/mobile/owner/clients');
      setClients(result || []);
      setIsOffline(false);
      await setCache('owner_clients_' + user?.tenant_id, result);
      // Job counts would need another endpoint — leave as 0 for now.
      setJobCounts({});
    } catch {
      const cached = await getStaleCache<Client[]>('owner_clients_' + user?.tenant_id);
      if (cached) {
        setClients(cached);
        setIsOffline(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ open?: string }>();
  useEffect(() => {
    if (params.open === 'new') setShowAdd(true);
  }, [params.open]);

  async function addClient() {
    if (!newName.trim()) return Alert.alert('Name is required');
    setSaving(true);
    try {
      const data = await mobilePost<Client>('/api/mobile/owner/clients', {
        name: newName.trim(),
        email: newEmail.trim() || null,
        phone: newPhone.trim() || null,
        address: null,
      });
      setClients(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setJobCounts(prev => ({ ...prev, [data.id]: 0 }));
      resetForm();
      setShowAdd(false);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not add client.');
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setNewName(''); setNewEmail(''); setNewPhone('');
    setNewCompany(''); setNewNotes('');
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.accent} /></View>;
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={theme.accent} />}
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
                      <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); Linking.openURL(`tel:${item.phone}`); }}>
                        <Text style={[styles.detailValue, { color: theme.accent }]}>{item.phone}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {(item as any).address && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Address</Text>
                      <Text style={styles.detailValue}>{(item as any).address}</Text>
                    </View>
                  )}
                  {item.notes && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Notes</Text>
                      <Text style={styles.detailValue}>{item.notes}</Text>
                    </View>
                  )}
                  <View style={styles.detailsFooter}>
                    <Text style={styles.addedDate}>Added {new Date(item.created_at).toLocaleDateString()}</Text>
                    <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); openEdit(item); }} style={styles.editBtn}>
                      <Text style={styles.editBtnText}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />

      <Modal visible={showAdd} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modal, { paddingBottom: 24 + insets.bottom, maxHeight: '92%' }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>New Client</Text>
              <TextInput style={styles.input} placeholder="Full name *" placeholderTextColor={theme.textMuted} value={newName} onChangeText={setNewName} />
              <TextInput style={styles.input} placeholder="Company (optional)" placeholderTextColor={theme.textMuted} value={newCompany} onChangeText={setNewCompany} />
              <TextInput style={styles.input} placeholder="Email (optional)" placeholderTextColor={theme.textMuted} value={newEmail} onChangeText={setNewEmail} keyboardType="email-address" autoCapitalize="none" />
              <TextInput style={styles.input} placeholder="Phone (optional)" placeholderTextColor={theme.textMuted} value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" />
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                placeholder="Notes (optional)"
                placeholderTextColor={theme.textMuted}
                value={newNotes}
                onChangeText={setNewNotes}
                multiline
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { resetForm(); setShowAdd(false); }}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={addClient} disabled={saving}>
                  {saving ? <ActivityIndicator color={theme.accentContrast} /> : <Text style={styles.saveText}>Add Client</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Client modal */}
      <Modal visible={!!editClient} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modal, { paddingBottom: 24 + insets.bottom, maxHeight: '92%' }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Edit {editClient?.name || 'Client'}</Text>
              <TextInput style={styles.input} placeholder="Full name *" placeholderTextColor={theme.textMuted} value={editName} onChangeText={setEditName} />
              <TextInput style={styles.input} placeholder="Company" placeholderTextColor={theme.textMuted} value={editCompany} onChangeText={setEditCompany} />
              <TextInput style={styles.input} placeholder="Email" placeholderTextColor={theme.textMuted} value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" autoCapitalize="none" />
              <TextInput style={styles.input} placeholder="Phone" placeholderTextColor={theme.textMuted} value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" />
              <TextInput style={styles.input} placeholder="Address" placeholderTextColor={theme.textMuted} value={editAddress} onChangeText={setEditAddress} />
              <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                placeholder="Notes — preferences, access instructions, etc."
                placeholderTextColor={theme.textMuted}
                value={editNotes}
                onChangeText={setEditNotes}
                multiline
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditClient(null)} disabled={editSaving}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={saveEdit} disabled={editSaving}>
                  {editSaving ? <ActivityIndicator color={theme.accentContrast} /> : <Text style={styles.saveText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: t.bg },
    empty: { color: t.textMuted, textAlign: 'center', marginTop: 60, fontSize: 15 },
    card: { backgroundColor: t.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: t.border },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: t.accentMuted, alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { color: t.accent, fontSize: 18, fontWeight: '700' },
    clientName: { color: t.textPrimary, fontSize: 15, fontWeight: '600' },
    company: { color: t.textSecondary, fontSize: 13, marginTop: 1 },
    jobBadge: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
    jobBadgeText: { color: t.textSecondary, fontSize: 12, fontWeight: '600' },
    details: { marginTop: 14, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 12, gap: 8 },
    detailRow: { flexDirection: 'row', gap: 8 },
    detailLabel: { color: t.textMuted, fontSize: 13, width: 50 },
    detailValue: { color: t.textPrimary, fontSize: 13, flex: 1 },
    addedDate: { color: t.textMuted, fontSize: 11 },
    detailsFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
    editBtn: {
      borderWidth: 1, borderColor: t.accent, borderRadius: 8,
      paddingVertical: 6, paddingHorizontal: 14,
    },
    editBtnText: { color: t.accent, fontSize: 12, fontWeight: '700' },
    fab: {
      position: 'absolute', bottom: 24, right: 24,
      backgroundColor: t.accent, borderRadius: 28,
      paddingVertical: 14, paddingHorizontal: 24, elevation: 4,
    },
    fabText: { color: t.accentContrast, fontWeight: '700', fontSize: 15 },
    modalOverlay: { flex: 1, backgroundColor: t.overlay, justifyContent: 'flex-end' },
    modal: { backgroundColor: t.surfaceElevated, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
    modalTitle: { color: t.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: 16 },
    input: {
      backgroundColor: t.surfaceInset, borderWidth: 1, borderColor: t.border,
      borderRadius: 10, padding: 14, color: t.textPrimary, fontSize: 15, marginBottom: 12,
    },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
    cancelBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: t.border },
    cancelText: { color: t.textSecondary, fontWeight: '600' },
    saveBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center', backgroundColor: t.accent },
    saveText: { color: t.accentContrast, fontWeight: '700' },
  });
}
