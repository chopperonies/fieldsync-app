import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, RefreshControl, Alert,
  Modal, ScrollView
} from 'react-native';
import { supabase, Job, Employee } from '../../lib/supabase';
import { getUser } from '../../lib/storage';

const PIPELINE = [
  { key: 'quoted',      label: 'Quoted',      color: '#6366f1' },
  { key: 'scheduled',   label: 'Scheduled',   color: '#3b82f6' },
  { key: 'in_progress', label: 'In Progress', color: '#0ea5e9' },
  { key: 'complete',    label: 'Complete',    color: '#4ade80' },
  { key: 'invoiced',    label: 'Invoiced',    color: '#a78bfa' },
  { key: 'on_hold',     label: 'On Hold',     color: '#f59e0b' },
];

function normalizeStatus(s: string) {
  return s === 'active' ? 'in_progress' : s;
}

function pipelineFor(key: string) {
  return PIPELINE.find(p => p.key === normalizeStatus(key)) ?? PIPELINE[2];
}

interface AssignedEmployee {
  employee_id: string;
  checked_in_at: string | null;
  employees: { name: string };
}

export default function ManagerJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [assignedMap, setAssignedMap] = useState<Record<string, AssignedEmployee[]>>({});

  // Add job modal
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [saving, setSaving] = useState(false);

  // Assign crew modal
  const [assignJobId, setAssignJobId] = useState<string | null>(null);
  const [allCrew, setAllCrew] = useState<Employee[]>([]);
  const [selected_crew, setSelectedCrew] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);

  const loadData = useCallback(async () => {
    const user = await getUser();
    let q = supabase.from('jobs').select('*').order('name');
    if (user?.tenant_id) q = q.eq('tenant_id', user.tenant_id);
    const { data } = await q;
    setJobs(data || []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function loadAssigned(jobId: string) {
    const { data } = await supabase
      .from('job_assignments')
      .select('employee_id, checked_in_at, employees(name)')
      .eq('job_id', jobId)
      .is('checked_out_at', null);
    setAssignedMap(prev => ({ ...prev, [jobId]: (data || []) as AssignedEmployee[] }));
  }

  function toggleExpand(jobId: string) {
    if (selected === jobId) {
      setSelected(null);
    } else {
      setSelected(jobId);
      loadAssigned(jobId);
    }
  }

  async function updateStatus(jobId: string, status: string) {
    await supabase.from('jobs').update({ status }).eq('id', jobId);
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: status as any } : j));
  }

  async function addJob() {
    if (!newName.trim() || !newAddress.trim()) return Alert.alert('Fill in both fields');
    setSaving(true);
    const user = await getUser();
    const { data } = await supabase.from('jobs')
      .insert({ name: newName.trim(), address: newAddress.trim(), status: 'quoted', tenant_id: user?.tenant_id })
      .select().single();
    if (data) setJobs(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName(''); setNewAddress('');
    setShowAdd(false); setSaving(false);
  }

  async function openAssignModal(jobId: string) {
    const user = await getUser();
    let crewQ = supabase.from('employees').select('*').in('role', ['crew', 'manager']).order('name');
    if (user?.tenant_id) crewQ = crewQ.eq('tenant_id', user.tenant_id);
    const { data: crew } = await crewQ;
    setAllCrew(crew || []);

    const current = assignedMap[jobId] || [];
    setSelectedCrew(new Set(current.map(a => a.employee_id)));
    setAssignJobId(jobId);
  }

  async function saveAssignments() {
    if (!assignJobId) return;
    setAssigning(true);

    const current = (assignedMap[assignJobId] || []).map(a => a.employee_id);
    const toAdd = [...selected_crew].filter(id => !current.includes(id));
    const toRemove = current.filter(id => !selected_crew.has(id));

    // Add new pre-assignments (only if not already checked in)
    if (toAdd.length > 0) {
      await supabase.from('job_assignments').upsert(
        toAdd.map(id => ({ job_id: assignJobId, employee_id: id })),
        { onConflict: 'job_id,employee_id', ignoreDuplicates: true }
      );
    }

    // Remove only pre-assignments (not active check-ins)
    for (const id of toRemove) {
      const entry = (assignedMap[assignJobId] || []).find(a => a.employee_id === id);
      if (entry && !entry.checked_in_at) {
        await supabase.from('job_assignments')
          .delete()
          .eq('job_id', assignJobId)
          .eq('employee_id', id)
          .is('checked_in_at', null);
      }
    }

    await loadAssigned(assignJobId);
    setAssignJobId(null);
    setAssigning(false);
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#0ea5e9" /></View>;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={jobs}
        keyExtractor={j => j.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#0ea5e9" />}
        renderItem={({ item }) => {
          const isOpen = selected === item.id;
          const stage = pipelineFor(item.status);
          const assigned = assignedMap[item.id] || [];

          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => toggleExpand(item.id)}
              activeOpacity={0.8}
            >
              <View style={styles.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.jobName}>{item.name}</Text>
                  <Text style={styles.jobAddress}>{item.address}</Text>
                </View>
                <View style={[styles.stageBadge, { backgroundColor: stage.color + '22' }]}>
                  <Text style={[styles.stageText, { color: stage.color }]}>{stage.label}</Text>
                </View>
              </View>

              {isOpen && (
                <View style={styles.expanded}>
                  {/* Pipeline selector */}
                  <Text style={styles.sectionLabel}>Status</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                    <View style={styles.pipelineRow}>
                      {PIPELINE.map(p => {
                        const active = normalizeStatus(item.status) === p.key;
                        return (
                          <TouchableOpacity
                            key={p.key}
                            style={[styles.pipeChip, active && { backgroundColor: p.color + '33', borderColor: p.color }]}
                            onPress={() => updateStatus(item.id, p.key)}
                          >
                            <Text style={[styles.pipeChipText, active && { color: p.color }]}>{p.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>

                  {/* Assigned crew */}
                  <View style={styles.crewHeader}>
                    <Text style={styles.sectionLabel}>Crew</Text>
                    <TouchableOpacity onPress={() => openAssignModal(item.id)}>
                      <Text style={styles.assignLink}>+ Assign</Text>
                    </TouchableOpacity>
                  </View>
                  {assigned.length === 0
                    ? <Text style={styles.noCrewText}>No crew assigned</Text>
                    : assigned.map(a => (
                      <View key={a.employee_id} style={styles.crewRow}>
                        <Text style={styles.crewName}>{(a.employees as any)?.name}</Text>
                        <View style={[styles.crewBadge, a.checked_in_at ? styles.onSiteBadge : styles.assignedBadge]}>
                          <Text style={[styles.crewBadgeText, { color: a.checked_in_at ? '#4ade80' : '#3b82f6' }]}>
                            {a.checked_in_at ? 'On site' : 'Assigned'}
                          </Text>
                        </View>
                      </View>
                    ))
                  }
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}>
        <Text style={styles.fabText}>+ Add Job</Text>
      </TouchableOpacity>

      {/* Add Job Modal */}
      <Modal visible={showAdd} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>New Job Site</Text>
            <TextInput style={styles.input} placeholder="Job name" placeholderTextColor="#555" value={newName} onChangeText={setNewName} />
            <TextInput style={styles.input} placeholder="Address" placeholderTextColor="#555" value={newAddress} onChangeText={setNewAddress} />
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

      {/* Assign Crew Modal */}
      <Modal visible={!!assignJobId} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { maxHeight: '70%' }]}>
            <Text style={styles.modalTitle}>Assign Crew</Text>
            <ScrollView>
              {allCrew.map(emp => {
                const checked = selected_crew.has(emp.id);
                return (
                  <TouchableOpacity
                    key={emp.id}
                    style={styles.crewCheckRow}
                    onPress={() => {
                      setSelectedCrew(prev => {
                        const next = new Set(prev);
                        checked ? next.delete(emp.id) : next.add(emp.id);
                        return next;
                      });
                    }}
                  >
                    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                      {checked && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.crewCheckName}>{emp.name}</Text>
                      <Text style={styles.crewCheckRole}>{emp.role}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={[styles.modalActions, { marginTop: 16 }]}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setAssignJobId(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveAssignments} disabled={assigning}>
                {assigning ? <ActivityIndicator color="#000" /> : <Text style={styles.saveText}>Save</Text>}
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
  card: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#2a2a2a' },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  jobName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  jobAddress: { color: '#666', fontSize: 13, marginTop: 2 },
  stageBadge: { borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, marginLeft: 8 },
  stageText: { fontSize: 11, fontWeight: '700' },
  expanded: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#2a2a2a', paddingTop: 14 },
  sectionLabel: { color: '#888', fontSize: 11, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  pipelineRow: { flexDirection: 'row', gap: 8 },
  pipeChip: {
    borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14,
    borderWidth: 1, borderColor: '#2a2a2a', backgroundColor: '#111',
  },
  pipeChipText: { color: '#555', fontSize: 12, fontWeight: '600' },
  crewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  assignLink: { color: '#0ea5e9', fontSize: 13, fontWeight: '600' },
  noCrewText: { color: '#444', fontSize: 13 },
  crewRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#2a2a2a' },
  crewName: { color: '#ccc', fontSize: 14, flex: 1 },
  crewBadge: { borderRadius: 6, paddingVertical: 2, paddingHorizontal: 8 },
  onSiteBadge: { backgroundColor: '#052e16' },
  assignedBadge: { backgroundColor: '#0c1a2e' },
  crewBadgeText: { fontSize: 11, fontWeight: '700' },
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
  modalActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  cancelText: { color: '#888', fontWeight: '600' },
  saveBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center', backgroundColor: '#0ea5e9' },
  saveText: { color: '#000', fontWeight: '700' },
  crewCheckRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#444', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  checkmark: { color: '#000', fontSize: 13, fontWeight: '700' },
  crewCheckName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  crewCheckRole: { color: '#666', fontSize: 12, marginTop: 1, textTransform: 'capitalize' },
});
