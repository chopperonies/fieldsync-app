import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Linking
} from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { mobileGet, mobilePatch } from '../../../lib/mobileApi';

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
});
