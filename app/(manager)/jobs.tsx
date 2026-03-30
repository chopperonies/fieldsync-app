import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, RefreshControl, Alert, Modal
} from 'react-native';
import { supabase, Job } from '../../lib/supabase';

export default function ManagerJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    const { data } = await supabase.from('jobs').select('*').order('name');
    setJobs(data || []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function addJob() {
    if (!newName.trim() || !newAddress.trim()) return Alert.alert('Fill in both fields');
    setSaving(true);
    const { data } = await supabase.from('jobs')
      .insert({ name: newName.trim(), address: newAddress.trim() })
      .select().single();
    if (data) setJobs(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName('');
    setNewAddress('');
    setShowAdd(false);
    setSaving(false);
  }

  async function toggleStatus(job: Job) {
    const next = job.status === 'active' ? 'on_hold' : 'active';
    await supabase.from('jobs').update({ status: next }).eq('id', job.id);
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: next } : j));
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#f97316" /></View>;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={jobs}
        keyExtractor={j => j.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#f97316" />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.jobName}>{item.name}</Text>
              <Text style={styles.jobAddress}>{item.address}</Text>
            </View>
            <TouchableOpacity
              style={[styles.statusBtn, item.status === 'active' ? styles.statusActive : styles.statusHold]}
              onPress={() => toggleStatus(item)}
            >
              <Text style={styles.statusBtnText}>
                {item.status === 'active' ? 'Active' : 'On Hold'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}>
        <Text style={styles.fabText}>+ Add Job</Text>
      </TouchableOpacity>

      <Modal visible={showAdd} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>New Job Site</Text>
            <TextInput
              style={styles.input}
              placeholder="Job name"
              placeholderTextColor="#555"
              value={newName}
              onChangeText={setNewName}
            />
            <TextInput
              style={styles.input}
              placeholder="Address"
              placeholderTextColor="#555"
              value={newAddress}
              onChangeText={setNewAddress}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAdd(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={addJob} disabled={saving}>
                {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveText}>Add Job</Text>}
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
    borderWidth: 1, borderColor: '#2a2a2a', flexDirection: 'row', alignItems: 'center',
  },
  jobName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  jobAddress: { color: '#666', fontSize: 13, marginTop: 2 },
  statusBtn: { borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1 },
  statusActive: { backgroundColor: '#052e16', borderColor: '#4ade80' },
  statusHold: { backgroundColor: '#1a1200', borderColor: '#f59e0b' },
  statusBtnText: { color: '#ccc', fontSize: 12, fontWeight: '600' },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    backgroundColor: '#f97316', borderRadius: 28,
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
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  cancelText: { color: '#888', fontWeight: '600' },
  saveBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center', backgroundColor: '#f97316' },
  saveText: { color: '#000', fontWeight: '700' },
});
