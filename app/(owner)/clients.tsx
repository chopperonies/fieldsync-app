import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, RefreshControl, Alert,
  Modal, ScrollView, KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { callNumber, textNumber } from '../../lib/phone';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Client } from '../../lib/supabase';
import { getUser } from '../../lib/storage';
import { setCache, getStaleCache } from '../../lib/cache';
import { mobileGet, mobilePost, mobilePatch } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import { useKeyboardVisible } from '../../lib/useKeyboardVisible';
import { Row, RowAvatar, Divider, SectionHeader } from '../../components/Flat';

export default function OwnerClients() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const kbVisible = useKeyboardVisible();
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [jobCounts, setJobCounts] = useState<Record<string, number>>({});

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

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
        company: newCompany.trim() || null,
        notes: newNotes.trim() || null,
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

  const filtered = query.trim()
    ? clients.filter(c => {
        const needle = query.trim().toLowerCase();
        return (
          c.name.toLowerCase().includes(needle) ||
          (c.email || '').toLowerCase().includes(needle) ||
          (c.phone || '').toLowerCase().includes(needle) ||
          ((c as any).company || '').toLowerCase().includes(needle)
        );
      })
    : clients;

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.accent} /></View>;
  }

  return (
    <View style={styles.container}>
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>📵 No connection — showing cached clients</Text>
        </View>
      )}

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={theme.textSecondary} />
        <TextInput
          style={styles.input}
          placeholder="Search clients"
          placeholderTextColor={theme.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={styles.addBar} onPress={() => setShowAdd(true)} activeOpacity={0.75}>
        <View style={[styles.addIcon, { backgroundColor: theme.accentMuted }]}>
          <Ionicons name="person-add-outline" size={18} color={theme.accent} />
        </View>
        <Text style={[styles.addText, { color: theme.accent }]}>Add client</Text>
      </TouchableOpacity>

      <FlatList
        data={filtered}
        keyExtractor={c => c.id}
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={theme.accent} />}
        ListHeaderComponent={
          clients.length > 0 ? <SectionHeader label="Clients" hint={`${clients.length}`} /> : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No clients yet</Text>
            <Text style={styles.emptySub}>Tap "Add client" above to create your first one.</Text>
          </View>
        }
        ItemSeparatorComponent={() => <Divider inset={64} />}
        renderItem={({ item }) => {
          const isOpen = selected === item.id;
          const sub = [
            (item as any).company,
            item.email,
            item.phone,
          ].filter(Boolean).join(' · ') || 'Client';
          return (
            <View>
              <Row
                leading={<RowAvatar letter={item.name.charAt(0).toUpperCase()} tint={theme.stagePurple} />}
                title={item.name}
                subtitle={sub}
                trailing={
                  <Ionicons
                    name={isOpen ? 'chevron-down' : 'chevron-forward'}
                    size={16}
                    color={theme.textMuted}
                  />
                }
                onPress={() => setSelected(isOpen ? null : item.id)}
              />
              {isOpen && (
                <View style={styles.details}>
                  {item.email && (
                    <DetailLine label="Email" value={item.email} theme={theme} />
                  )}
                  {item.phone && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                      <Text style={{ color: theme.textMuted, fontSize: 12, width: 56, fontWeight: '700' }}>Phone</Text>
                      <Text style={{ color: theme.textPrimary, fontSize: 14, flex: 1 }}>{item.phone}</Text>
                      <TouchableOpacity onPress={() => textNumber(item.phone)} hitSlop={8}>
                        <Ionicons name="chatbubble-outline" size={18} color={theme.accent} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => callNumber(item.phone)} hitSlop={8}>
                        <Ionicons name="call-outline" size={18} color={theme.accent} />
                      </TouchableOpacity>
                    </View>
                  )}
                  {(item as any).address && (
                    <DetailLine label="Address" value={(item as any).address} theme={theme} />
                  )}
                  {item.notes && (
                    <DetailLine label="Notes" value={item.notes} theme={theme} multiline />
                  )}
                  <View style={styles.detailsFooter}>
                    <Text style={styles.addedDate}>
                      Added {new Date(item.created_at).toLocaleDateString()}
                    </Text>
                    <TouchableOpacity onPress={() => openEdit(item)} style={styles.editBtn}>
                      <Text style={styles.editBtnText}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          );
        }}
      />

      <Modal
        visible={showAdd}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (kbVisible) { Keyboard.dismiss(); return; }
          resetForm(); setShowAdd(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modal, { paddingBottom: 24 + insets.bottom, maxHeight: '92%' }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>New Client</Text>
              <TextInput style={styles.modalInput} placeholder="Full name *" placeholderTextColor={theme.textMuted} value={newName} onChangeText={setNewName} />
              <TextInput style={styles.modalInput} placeholder="Company (optional)" placeholderTextColor={theme.textMuted} value={newCompany} onChangeText={setNewCompany} />
              <TextInput style={styles.modalInput} placeholder="Email (optional)" placeholderTextColor={theme.textMuted} value={newEmail} onChangeText={setNewEmail} keyboardType="email-address" autoCapitalize="none" />
              <TextInput style={styles.modalInput} placeholder="Phone (optional)" placeholderTextColor={theme.textMuted} value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" />
              <TextInput
                style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
                placeholder="Notes (optional)"
                placeholderTextColor={theme.textMuted}
                value={newNotes}
                onChangeText={setNewNotes}
                multiline
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { Keyboard.dismiss(); resetForm(); setShowAdd(false); }}>
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

      <Modal
        visible={!!editClient}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (kbVisible) { Keyboard.dismiss(); return; }
          setEditClient(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modal, { paddingBottom: 24 + insets.bottom, maxHeight: '92%' }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Edit {editClient?.name || 'Client'}</Text>
              <TextInput style={styles.modalInput} placeholder="Full name *" placeholderTextColor={theme.textMuted} value={editName} onChangeText={setEditName} />
              <TextInput style={styles.modalInput} placeholder="Company" placeholderTextColor={theme.textMuted} value={editCompany} onChangeText={setEditCompany} />
              <TextInput style={styles.modalInput} placeholder="Email" placeholderTextColor={theme.textMuted} value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" autoCapitalize="none" />
              <TextInput style={styles.modalInput} placeholder="Phone" placeholderTextColor={theme.textMuted} value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" />
              <TextInput style={styles.modalInput} placeholder="Address" placeholderTextColor={theme.textMuted} value={editAddress} onChangeText={setEditAddress} />
              <TextInput
                style={[styles.modalInput, { height: 100, textAlignVertical: 'top' }]}
                placeholder="Notes — preferences, access instructions, etc."
                placeholderTextColor={theme.textMuted}
                value={editNotes}
                onChangeText={setEditNotes}
                multiline
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { Keyboard.dismiss(); setEditClient(null); }} disabled={editSaving}>
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

function DetailLine({
  label, value, theme, onPress, multiline,
}: { label: string; value: string; theme: Theme; onPress?: () => void; multiline?: boolean }) {
  const Wrap: any = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={{ flexDirection: 'row', gap: 10, paddingVertical: 6 }} onPress={onPress}>
      <Text style={{ color: theme.textMuted, fontSize: 12, width: 56, fontWeight: '700', paddingTop: 2 }}>{label}</Text>
      <Text
        style={{
          color: onPress ? theme.accent : theme.textPrimary,
          fontSize: 14, flex: 1,
          lineHeight: multiline ? 20 : undefined,
        }}
      >
        {value}
      </Text>
    </Wrap>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: t.bg },

    offlineBanner: { backgroundColor: t.dangerMuted, paddingVertical: 8, paddingHorizontal: 16 },
    offlineText: { color: t.danger, fontSize: 12, fontWeight: '700', textAlign: 'center' },

    searchBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 16, marginTop: 12,
      backgroundColor: t.surfaceInset,
      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    },
    input: { flex: 1, color: t.textPrimary, fontSize: 15, paddingVertical: 0 },

    addBar: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 14,
      marginTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border,
    },
    addIcon: {
      width: 32, height: 32, borderRadius: 16,
      alignItems: 'center', justifyContent: 'center',
    },
    addText: { fontSize: 15, fontWeight: '700' },

    empty: { paddingTop: 80, paddingHorizontal: 32, alignItems: 'center' },
    emptyTitle: { color: t.textPrimary, fontSize: 18, fontWeight: '800', marginBottom: 6 },
    emptySub: { color: t.textMuted, fontSize: 14, textAlign: 'center' },

    details: {
      paddingHorizontal: 16, paddingBottom: 14,
      paddingLeft: 64,
      gap: 2,
    },
    addedDate: { color: t.textMuted, fontSize: 11 },
    detailsFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
    editBtn: {
      borderWidth: 1, borderColor: t.accent, borderRadius: 8,
      paddingVertical: 6, paddingHorizontal: 14,
    },
    editBtnText: { color: t.accent, fontSize: 12, fontWeight: '700' },

    modalOverlay: { flex: 1, backgroundColor: t.overlay, justifyContent: 'flex-end' },
    modal: { backgroundColor: t.surfaceElevated, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
    modalTitle: { color: t.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: 16 },
    modalInput: {
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
