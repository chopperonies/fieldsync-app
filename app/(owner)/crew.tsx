import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, RefreshControl, Alert, Modal, Linking,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Employee, Role } from '../../lib/supabase';
import { getPlan } from '../../lib/storage';
import { mobileGet, mobilePost, mobilePatch } from '../../lib/mobileApi';

const ROLES: Role[] = ['crew', 'manager', 'owner'];

export default function OwnerCrew() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<Role>('crew');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await mobileGet<Employee[]>('/api/mobile/owner/crew');
      setEmployees(data || []);
    } catch {
      setEmployees([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ open?: string }>();
  useEffect(() => {
    if (params.open === 'new') handleAddPress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.open]);

  async function handleAddPress() {
    const plan = await getPlan();
    const maxUsers = plan?.max_users ?? 1;
    if (employees.length >= maxUsers) {
      Alert.alert(
        'Plan limit reached',
        `Your ${plan?.plan ?? 'current'} plan allows up to ${maxUsers} crew member${maxUsers === 1 ? '' : 's'}. Upgrade your plan at linkcrew.io/pricing to add more.`,
        [{ text: 'OK' }]
      );
      return;
    }
    setShowAdd(true);
  }

  async function addEmployee() {
    if (!newName.trim() || !newPhone.trim()) return Alert.alert('Fill in name and phone');
    setSaving(true);
    try {
      const data = await mobilePost<Employee>('/api/mobile/owner/crew', {
        name: newName.trim(), phone: newPhone.trim(), role: newRole,
      });
      setEmployees(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName(''); setNewPhone(''); setNewRole('crew');
      setShowAdd(false);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not add crew member.');
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(emp: Employee, role: Role) {
    try {
      await mobilePatch(`/api/mobile/owner/crew/${emp.id}`, { role });
      setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, role } : e));
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not change role.');
    }
  }

  function revokeSession(emp: Employee) {
    Alert.alert(
      `Kick ${emp.name} off mobile?`,
      'Their phone will be logged out immediately and must log in again. Use this if a phone is lost or the person is no longer on the team.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              await mobilePost(`/api/mobile/owner/crew/${emp.id}/revoke-session`);
              Alert.alert('Revoked', `${emp.name}'s phone session has been cleared.`);
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Could not revoke session.');
            }
          },
        },
      ],
    );
  }

  const ROLE_COLORS: Record<Role, string> = { crew: '#3b82f6', manager: '#0ea5e9', owner: '#a855f7' };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#0ea5e9" /></View>;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={employees}
        keyExtractor={e => e.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#0ea5e9" />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.empName}>{item.name}</Text>
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.phone}`)}>
                <Text style={styles.empPhone}>{item.phone}</Text>
              </TouchableOpacity>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={styles.roleRow}>
                {ROLES.map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.roleChip, item.role === r && { backgroundColor: ROLE_COLORS[r] + '22', borderColor: ROLE_COLORS[r] }]}
                    onPress={() => changeRole(item, r)}
                  >
                    <Text style={[styles.roleText, item.role === r && { color: ROLE_COLORS[r] }]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity onPress={() => revokeSession(item)} style={{ marginTop: 6 }}>
                <Text style={styles.revokeLink}>Kick from mobile</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      <Modal visible={showAdd} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modal, { paddingBottom: 24 + insets.bottom }]}>
            <Text style={styles.modalTitle}>Add Crew Member</Text>
            <TextInput style={styles.input} placeholder="Full name" placeholderTextColor="#555" value={newName} onChangeText={setNewName} />
            <TextInput style={styles.input} placeholder="Phone number" placeholderTextColor="#555" value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" />
            <Text style={styles.roleLabel}>Role</Text>
            <View style={styles.roleSelector}>
              {ROLES.map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.roleSelectorChip, newRole === r && { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' }]}
                  onPress={() => setNewRole(r)}
                >
                  <Text style={[styles.roleSelectorText, newRole === r && { color: '#000' }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAdd(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={addEmployee} disabled={saving}>
                {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveText}>Add</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  card: {
    backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#2a2a2a',
  },
  empName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  empPhone: { color: '#0ea5e9', fontSize: 13, marginTop: 2, marginBottom: 10 },
  roleRow: { flexDirection: 'row', gap: 6 },
  roleChip: {
    borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10,
    borderWidth: 1, borderColor: '#2a2a2a', backgroundColor: '#1a1a1a',
  },
  roleText: { color: '#555', fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  revokeLink: { color: '#ef4444', fontSize: 11, fontWeight: '600' },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    backgroundColor: '#0ea5e9', borderRadius: 28,
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
  roleLabel: { color: '#888', fontSize: 13, marginBottom: 8 },
  roleSelector: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  roleSelectorChip: {
    flex: 1, borderRadius: 8, padding: 10, alignItems: 'center',
    borderWidth: 1, borderColor: '#2a2a2a', backgroundColor: '#0a0a0a',
  },
  roleSelectorText: { color: '#888', fontWeight: '600', textTransform: 'capitalize' },
  modalActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  cancelText: { color: '#888', fontWeight: '600' },
  saveBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center', backgroundColor: '#0ea5e9' },
  saveText: { color: '#000', fontWeight: '700' },
});
