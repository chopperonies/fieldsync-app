import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, RefreshControl, Alert, Modal, Linking
} from 'react-native';
import { supabase, Employee, Role } from '../../lib/supabase';
import { getUser } from '../../lib/storage';

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
    const user = await getUser();
    let q = supabase.from('employees').select('*').order('name');
    if (user?.tenant_id) q = q.eq('tenant_id', user.tenant_id);
    const { data } = await q;
    setEmployees(data || []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function addEmployee() {
    if (!newName.trim() || !newPhone.trim()) return Alert.alert('Fill in name and phone');
    setSaving(true);
    const user = await getUser();
    const { data, error } = await supabase
      .from('employees')
      .insert({ name: newName.trim(), phone: newPhone.trim(), role: newRole, tenant_id: user?.tenant_id })
      .select().single();
    if (error) { Alert.alert('Error', error.message); setSaving(false); return; }
    setEmployees(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName(''); setNewPhone(''); setNewRole('crew');
    setShowAdd(false);
    setSaving(false);
  }

  async function changeRole(emp: Employee, role: Role) {
    await supabase.from('employees').update({ role }).eq('id', emp.id);
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, role } : e));
  }

  const ROLE_COLORS: Record<Role, string> = { crew: '#3b82f6', manager: '#0265dc', owner: '#a855f7' };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#0265dc" /></View>;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={employees}
        keyExtractor={e => e.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#0265dc" />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.empName}>{item.name}</Text>
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.phone}`)}>
                <Text style={styles.empPhone}>{item.phone}</Text>
              </TouchableOpacity>
            </View>
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
          </View>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}>
        <Text style={styles.fabText}>+ Add Member</Text>
      </TouchableOpacity>

      <Modal visible={showAdd} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Add Crew Member</Text>
            <TextInput style={styles.input} placeholder="Full name" placeholderTextColor="#555" value={newName} onChangeText={setNewName} />
            <TextInput style={styles.input} placeholder="Phone number" placeholderTextColor="#555" value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" />
            <Text style={styles.roleLabel}>Role</Text>
            <View style={styles.roleSelector}>
              {ROLES.map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.roleSelectorChip, newRole === r && { backgroundColor: '#0265dc', borderColor: '#0265dc' }]}
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
        </View>
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
  empPhone: { color: '#0265dc', fontSize: 13, marginTop: 2, marginBottom: 10 },
  roleRow: { flexDirection: 'row', gap: 6 },
  roleChip: {
    borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10,
    borderWidth: 1, borderColor: '#2a2a2a', backgroundColor: '#1a1a1a',
  },
  roleText: { color: '#555', fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
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
  saveBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center', backgroundColor: '#0265dc' },
  saveText: { color: '#000', fontWeight: '700' },
});
