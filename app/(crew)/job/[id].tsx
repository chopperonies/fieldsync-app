import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Linking, TextInput, Modal
} from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../../lib/supabase';
import { mobileGet, mobilePatch, mobilePost } from '../../../lib/mobileApi';

type Step = { order: number; label: string; required?: boolean };
type ActionButton = { label: string; action_type: string; style?: string; config?: any };
type WorkflowStatus = {
  id: string;
  workflow_id: string;
  order_index: number;
  name: string;
  color: string;
  icon?: string;
  steps: Step[];
  action_buttons: ActionButton[];
  legacy_status?: string | null;
};
type Workflow = { id: string; name: string; statuses: WorkflowStatus[] };
type Job = {
  id: string;
  name: string;
  address?: string;
  client_id?: string;
  workflow_id?: string | null;
  workflow_progress?: {
    current_status_id?: string;
    completed_steps?: Record<string, number[]>;
  };
};

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [clientPhone, setClientPhone] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const payload = await mobileGet<{ job: Job; client: { phone?: string } | null }>(`/api/mobile/crew/jobs/${id}`);
      setJob(payload.job);
      setClientPhone(payload.client?.phone || null);
      if (payload.job?.workflow_id) {
        const workflows: Workflow[] = await mobileGet('/api/mobile/crew/workflows');
        const matched = workflows.find(w => w.id === payload.job.workflow_id) || null;
        if (matched && matched.statuses) {
          matched.statuses = matched.statuses.slice().sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
        }
        setWorkflow(matched);
      } else {
        setWorkflow(null);
      }
    } catch (e: any) {
      Alert.alert('Failed to load', e.message || 'Could not load job detail.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const currentStatus = workflow?.statuses.find(s => s.id === job?.workflow_progress?.current_status_id)
    || workflow?.statuses[0]
    || null;
  const completedOrders: number[] = currentStatus && job?.workflow_progress?.completed_steps?.[currentStatus.id]
    || [];

  async function advance(statusId: string) {
    if (!job) return;
    setBusy(true);
    try {
      const updated = await mobilePatch<Job>(`/api/mobile/crew/jobs/${job.id}/workflow-progress`, {
        workflow_progress: { current_status_id: statusId },
      });
      setJob(updated);
    } catch (e: any) {
      Alert.alert('Update failed', e.message || 'Could not advance status.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleStep(statusId: string, order: number, checked: boolean) {
    if (!job) return;
    const set = new Set(completedOrders);
    if (checked) set.add(order); else set.delete(order);
    const next = Array.from(set).sort((a, b) => a - b);
    setJob({ ...job, workflow_progress: {
      ...(job.workflow_progress || {}),
      completed_steps: { ...(job.workflow_progress?.completed_steps || {}), [statusId]: next },
    }});
    try {
      const updated = await mobilePatch<Job>(`/api/mobile/crew/jobs/${job.id}/workflow-progress`, {
        workflow_progress: { completed_steps: { [statusId]: next } },
      });
      setJob(updated);
    } catch (e: any) {
      Alert.alert('Save failed', e.message || 'Could not save step progress.');
      load();
    }
  }

  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);

  async function uploadJobPhoto(base64: string): Promise<string | null> {
    if (!job) return null;
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fileName = `${job.id}/${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from('photos')
      .upload(fileName, bytes, { contentType: 'image/jpeg' });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('photos').getPublicUrl(fileName);
    return data.publicUrl;
  }

  async function handleOpenCamera() {
    if (!job) return;
    setCameraBusy(true);
    try {
      const result = await ImagePicker.launchCameraAsync({ quality: 0.8, base64: true });
      if (result.canceled || !result.assets[0].base64) return;
      const url = await uploadJobPhoto(result.assets[0].base64);
      if (!url) return;
      await mobilePost(`/api/mobile/crew/jobs/${job.id}/updates`, {
        type: 'photo',
        message: 'Site photo',
        photo_url: url,
      });
      Alert.alert('Uploaded', 'Photo saved to this job.');
    } catch (e: any) {
      Alert.alert('Failed', e.message || 'Could not save photo.');
    } finally {
      setCameraBusy(false);
    }
  }

  async function submitNoteFromModal() {
    if (!job || !noteText.trim()) return;
    setNoteSaving(true);
    try {
      await mobilePost(`/api/mobile/crew/jobs/${job.id}/updates`, {
        type: 'note',
        message: noteText.trim(),
      });
      setNoteText('');
      setNoteModalOpen(false);
      Alert.alert('Note saved');
    } catch (e: any) {
      Alert.alert('Failed', e.message || 'Could not save note.');
    } finally {
      setNoteSaving(false);
    }
  }

  function runAction(btn: ActionButton) {
    if (!job) return;
    switch (btn.action_type) {
      case 'navigate': {
        if (!job.address) return Alert.alert('No address', 'This job has no address on file.');
        const q = encodeURIComponent(job.address);
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
        break;
      }
      case 'call_customer': {
        if (!clientPhone) return Alert.alert('No phone', 'Client has no phone on file.');
        Linking.openURL(`tel:${String(clientPhone).replace(/[^\d+]/g, '')}`);
        break;
      }
      case 'open_camera': {
        handleOpenCamera();
        break;
      }
      case 'add_note': {
        setNoteModalOpen(true);
        break;
      }
      case 'create_po': {
        router.push('/(crew)/supplies' as any);
        break;
      }
      case 'generate_estimate': {
        Linking.openURL(`https://linkcrew.io/workorder?job_id=${encodeURIComponent(job.id)}`);
        break;
      }
      default:
        Alert.alert(btn.label, 'This action is available on the desktop dashboard for now.');
    }
  }

  if (loading) {
    return (
      <View style={styles.center}><ActivityIndicator size="large" color="#0ea5e9" /></View>
    );
  }
  if (!job) {
    return (
      <View style={styles.center}><Text style={styles.muted}>Job not found.</Text></View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: job.name, headerBackTitle: 'Back' }} />
      <View style={styles.backBar}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(crew)')} style={styles.backBtn}>
          <Text style={styles.backBtnText}>{'‹ Back to Jobs'}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 14 }}>
        <View>
          <Text style={styles.jobName}>{job.name}</Text>
          {job.address ? <Text style={styles.jobAddress}>{job.address}</Text> : null}
        </View>

        {!workflow ? (
          <View style={styles.card}>
            <Text style={styles.muted}>
              No workflow is attached to this job yet. Ask an owner to attach one from the desktop dashboard.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Workflow · {workflow.name}</Text>
              <View style={styles.pillRow}>
                {workflow.statuses.map(s => {
                  const active = s.id === currentStatus?.id;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      disabled={busy}
                      onPress={() => advance(s.id)}
                      style={[
                        styles.pill,
                        { borderColor: active ? s.color : '#2a2a2a', backgroundColor: active ? s.color : 'transparent' },
                        busy && { opacity: 0.6 },
                      ]}>
                      <Text style={[styles.pillText, { color: active ? '#fff' : '#bbb' }]}>
                        {s.order_index}. {s.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {currentStatus && currentStatus.action_buttons && currentStatus.action_buttons.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>Quick actions</Text>
                <View style={styles.actionRow}>
                  {currentStatus.action_buttons.map((btn, i) => (
                    <TouchableOpacity
                      key={`${btn.action_type}-${i}`}
                      style={[styles.actionBtn, btn.style === 'primary_solid' && styles.actionBtnSolid]}
                      onPress={() => runAction(btn)}>
                      <Text style={[styles.actionBtnText, btn.style === 'primary_solid' && { color: '#fff' }]}>{btn.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {currentStatus && currentStatus.steps && currentStatus.steps.length > 0 && (
              <View style={styles.card}>
                <View style={styles.checklistHeader}>
                  <Text style={styles.sectionLabel}>Checklist · {currentStatus.name}</Text>
                  <Text style={styles.muted}>
                    {completedOrders.length} / {currentStatus.steps.length}
                  </Text>
                </View>
                {currentStatus.steps
                  .slice()
                  .sort((a, b) => (a.order || 0) - (b.order || 0))
                  .map(step => {
                    const done = completedOrders.includes(step.order);
                    return (
                      <TouchableOpacity
                        key={step.order}
                        style={styles.stepRow}
                        onPress={() => toggleStep(currentStatus.id, step.order, !done)}>
                        <View style={[styles.checkbox, done && styles.checkboxDone]}>
                          {done ? <Text style={styles.check}>✓</Text> : null}
                        </View>
                        <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>
                          {step.label}{step.required === false ? ' (optional)' : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
              </View>
            )}
          </>
        )}
      </ScrollView>
      <Modal visible={noteModalOpen} transparent animationType="fade" onRequestClose={() => setNoteModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add a note</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="What's happening on site?"
              placeholderTextColor="#555"
              value={noteText}
              onChangeText={setNoteText}
              multiline
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => { setNoteText(''); setNoteModalOpen(false); }} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitNoteFromModal} style={styles.modalSave} disabled={noteSaving || !noteText.trim()}>
                {noteSaving ? <ActivityIndicator color="#000" /> : <Text style={styles.modalSaveText}>Save Note</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {cameraBusy && (
        <View style={styles.busyOverlay}>
          <ActivityIndicator size="large" color="#0ea5e9" />
          <Text style={styles.busyText}>Uploading photo…</Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  muted: { color: '#777', fontSize: 13 },
  jobName: { color: '#fff', fontSize: 22, fontWeight: '700' },
  jobAddress: { color: '#888', fontSize: 14, marginTop: 4 },
  card: {
    backgroundColor: '#1a1a1a', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#2a2a2a',
  },
  sectionLabel: {
    color: '#888', fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 10,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5 },
  pillText: { fontSize: 12, fontWeight: '700' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10,
    borderWidth: 1, borderColor: '#2a2a2a', backgroundColor: '#0f0f0f',
  },
  actionBtnSolid: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  actionBtnText: { color: '#ccc', fontSize: 13, fontWeight: '700' },
  checklistHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#3a3a3a',
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  checkboxDone: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  check: { color: '#fff', fontWeight: '800', fontSize: 14 },
  stepLabel: { color: '#e5e5e5', fontSize: 14, flex: 1 },
  stepLabelDone: { color: '#666', textDecorationLine: 'line-through' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 20,
  },
  modalCard: {
    backgroundColor: '#1a1a1a', borderRadius: 16, padding: 18, gap: 12,
    borderWidth: 1, borderColor: '#2a2a2a',
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  modalInput: {
    minHeight: 100, backgroundColor: '#0a0a0a', borderWidth: 1, borderColor: '#2a2a2a',
    borderRadius: 10, padding: 12, color: '#fff', fontSize: 15, textAlignVertical: 'top',
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  modalCancelText: { color: '#888', fontWeight: '600' },
  modalSave: {
    paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10, backgroundColor: '#0ea5e9',
    opacity: 1, minWidth: 100, alignItems: 'center',
  },
  modalSaveText: { color: '#000', fontWeight: '700' },
  busyOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', gap: 12,
  },
  busyText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  backBar: {
    backgroundColor: '#0a0a0a', borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
    paddingHorizontal: 14, paddingVertical: 10,
  },
  backBtn: { alignSelf: 'flex-start' },
  backBtnText: { color: '#0ea5e9', fontSize: 15, fontWeight: '600' },
});
