import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, RefreshControl, Alert, Modal,
  KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { callNumber, textNumber } from '../../lib/phone';
import { useRole, canManageCrew } from '../../lib/useRole';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Employee, Role } from '../../lib/supabase';
import { getPlan } from '../../lib/storage';
import { mobileGet, mobilePost, mobilePatch, mobileDelete } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { useKeyboardVisible } from '../../lib/useKeyboardVisible';
import { Theme } from '../../lib/theme';

const ROLES: Role[] = ['crew', 'supervisor', 'manager', 'owner'];

export default function OwnerCrew() {
  const theme = useTheme();
  const role = useRole();
  const canEdit = canManageCrew(role);
  const styles = makeStyles(theme);
  const kbVisible = useKeyboardVisible();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<Role>('crew');
  const [saving, setSaving] = useState(false);

  // Edit-member modal
  const [editMember, setEditMember] = useState<Employee | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editStatus, setEditStatus] = useState<string>('active');
  const [editSaving, setEditSaving] = useState(false);

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
    if (params.open === 'new' && canEdit) handleAddPress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.open, canEdit]);

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

  function changeRole(emp: Employee, role: Role) {
    if (emp.role === role) return;
    const warnsTo: Record<Role, string> = {
      crew: 'Crew see only jobs they are assigned to.',
      supervisor: 'Supervisors can approve job closures and manage crew/jobs from mobile + web.',
      manager: 'Managers can see all jobs, clients, supplies, and photos.',
      owner: 'Owners have full access including financials, billing, and crew controls.',
    };
    Alert.alert(
      `Change ${emp.name} to ${role}?`,
      warnsTo[role],
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change',
          style: role === 'owner' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await mobilePatch(`/api/mobile/owner/crew/${emp.id}`, { role });
              setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, role } : e));
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Could not change role.');
            }
          },
        },
      ],
    );
  }

  function openEdit(emp: Employee) {
    setEditMember(emp);
    setEditName(emp.name || '');
    setEditPhone(emp.phone || '');
    setEditStatus(String((emp as any).status || 'active'));
  }

  async function saveEdit() {
    if (!editMember) return;
    if (!editName.trim() || !editPhone.trim()) return Alert.alert('Name and phone are required');
    setEditSaving(true);
    try {
      const updated = await mobilePatch<Employee>(`/api/mobile/owner/crew/${editMember.id}`, {
        name: editName.trim(),
        phone: editPhone.trim(),
        status: editStatus,
      });
      setEmployees(prev => prev.map(e => e.id === editMember.id ? { ...e, ...updated } : e));
      setEditMember(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save changes.');
    } finally {
      setEditSaving(false);
    }
  }

  function deleteMember() {
    if (!editMember) return;
    const emp = editMember;
    Alert.alert(
      `Remove ${emp.name}?`,
      'Their job history stays intact, but they lose mobile app access immediately.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await mobileDelete(`/api/mobile/owner/crew/${emp.id}`);
              setEmployees(prev => prev.filter(e => e.id !== emp.id));
              setEditMember(null);
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Could not remove.');
            }
          },
        },
      ],
    );
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

  const ROLE_COLORS: Record<Role, string> = { crew: '#3b82f6', supervisor: '#14b8a6', manager: '#0ea5e9', owner: '#a855f7' };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.accent} /></View>;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={employees}
        keyExtractor={e => e.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={theme.accent} />}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} activeOpacity={canEdit ? 0.75 : 1} onPress={() => canEdit && openEdit(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.empName}>{item.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
                <Text style={styles.empPhone}>{item.phone}</Text>
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation?.(); textNumber(item.phone); }}
                  hitSlop={8}
                >
                  <Ionicons name="chatbubble-outline" size={16} color={theme.accent} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation?.(); callNumber(item.phone); }}
                  hitSlop={8}
                >
                  <Ionicons name="call-outline" size={16} color={theme.accent} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {canEdit ? (
                <>
                  <View style={styles.roleRow}>
                    {ROLES.map(r => (
                      <TouchableOpacity
                        key={r}
                        style={[styles.roleChip, item.role === r && { backgroundColor: ROLE_COLORS[r] + '22', borderColor: ROLE_COLORS[r] }]}
                        onPress={(e) => { e.stopPropagation?.(); changeRole(item, r); }}
                      >
                        <Text style={[styles.roleText, item.role === r && { color: ROLE_COLORS[r] }]}>{r}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.tapHintRow}>
                    <Text style={styles.tapHint}>Edit</Text>
                    <Text style={styles.tapHintArrow}>›</Text>
                  </View>
                </>
              ) : (
                <View style={[styles.roleChip, { backgroundColor: ROLE_COLORS[item.role as Role] + '22', borderColor: ROLE_COLORS[item.role as Role] }]}>
                  <Text style={[styles.roleText, { color: ROLE_COLORS[item.role as Role] }]}>{item.role}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        )}
      />

      <Modal
        visible={showAdd}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (kbVisible) { Keyboard.dismiss(); return; }
          setShowAdd(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modal, { paddingBottom: 24 + insets.bottom }]}>
            <Text style={styles.modalTitle}>Add Crew Member</Text>
            <TextInput style={styles.input} placeholder="Full name" placeholderTextColor={theme.textMuted} value={newName} onChangeText={setNewName} />
            <TextInput style={styles.input} placeholder="Phone number" placeholderTextColor={theme.textMuted} value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" />
            <Text style={styles.roleLabel}>Role</Text>
            <View style={styles.roleSelector}>
              {ROLES.map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.roleSelectorChip, newRole === r && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                  onPress={() => setNewRole(r)}
                >
                  <Text style={[styles.roleSelectorText, newRole === r && { color: '#000' }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { Keyboard.dismiss(); setShowAdd(false); }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={addEmployee} disabled={saving}>
                {saving ? <ActivityIndicator color={theme.accentContrast} /> : <Text style={styles.saveText}>Add</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit member modal — tap crew card */}
      <Modal
        visible={!!editMember}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (kbVisible) { Keyboard.dismiss(); return; }
          setEditMember(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modal, { paddingBottom: 24 + insets.bottom, maxHeight: '90%' }]}>
            <Text style={styles.modalTitle}>Edit {editMember?.name || 'Member'}</Text>

            <Text style={styles.fieldHint}>Personal details</Text>
            <TextInput style={styles.input} placeholder="Full name" placeholderTextColor={theme.textMuted} value={editName} onChangeText={setEditName} />
            <TextInput style={styles.input} placeholder="Phone number" placeholderTextColor={theme.textMuted} value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" />

            <Text style={styles.roleLabel}>Status</Text>
            <View style={styles.roleSelector}>
              {[
                { value: 'active', label: 'Active' },
                { value: 'vacation', label: 'Vacation' },
                { value: 'suspended', label: 'Suspended' },
              ].map(s => (
                <TouchableOpacity
                  key={s.value}
                  style={[styles.roleSelectorChip, editStatus === s.value && { backgroundColor: theme.accent, borderColor: theme.accent }]}
                  onPress={() => setEditStatus(s.value)}
                >
                  <Text style={[styles.roleSelectorText, editStatus === s.value && { color: '#000' }]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.fieldHint}>Suspended blocks their mobile login entirely.</Text>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity
                style={{ flex: 1, borderWidth: 1, borderColor: '#ef4444', borderRadius: 8, padding: 12, alignItems: 'center' }}
                onPress={() => editMember && revokeSession(editMember)}
              >
                <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 13 }}>Kick from Mobile</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, borderWidth: 1, borderColor: '#7f1d1d', borderRadius: 8, padding: 12, alignItems: 'center' }}
                onPress={deleteMember}
              >
                <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 13 }}>Remove from Team</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.modalActions, { marginTop: 16 }]}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { Keyboard.dismiss(); setEditMember(null); }} disabled={editSaving}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveEdit} disabled={editSaving}>
                {editSaving ? <ActivityIndicator color={theme.accentContrast} /> : <Text style={styles.saveText}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
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
    card: {
      backgroundColor: t.surface, borderRadius: 14, padding: 16,
      borderWidth: 1, borderColor: t.border,
    },
    empName: { color: t.textPrimary, fontSize: 15, fontWeight: '600' },
    empPhone: { color: t.accent, fontSize: 13, marginTop: 2, marginBottom: 10 },
    roleRow: { flexDirection: 'row', gap: 6 },
    roleChip: {
      borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10,
      borderWidth: 1, borderColor: t.border, backgroundColor: t.surface,
    },
    roleText: { color: t.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
    revokeLink: { color: t.danger, fontSize: 11, fontWeight: '600' },
    tapHint: { color: t.accent, fontSize: 11, fontWeight: '700' },
    tapHintRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
    tapHintArrow: { color: t.accent, fontSize: 16, fontWeight: '700', lineHeight: 16 },
    fieldHint: { color: t.textMuted, fontSize: 12, marginTop: 4, marginBottom: 10 },
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
    roleLabel: { color: t.textSecondary, fontSize: 13, marginBottom: 8 },
    roleSelector: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    roleSelectorChip: {
      flex: 1, borderRadius: 8, padding: 10, alignItems: 'center',
      borderWidth: 1, borderColor: t.border, backgroundColor: t.surfaceInset,
    },
    roleSelectorText: { color: t.textSecondary, fontWeight: '600', textTransform: 'capitalize' },
    modalActions: { flexDirection: 'row', gap: 10 },
    cancelBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: t.border },
    cancelText: { color: t.textSecondary, fontWeight: '600' },
    saveBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center', backgroundColor: t.accent },
    saveText: { color: t.accentContrast, fontWeight: '700' },
  });
}
