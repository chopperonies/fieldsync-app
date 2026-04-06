import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl, Alert,
  KeyboardAvoidingView, Platform
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { getUser } from '../../lib/storage';

interface Note {
  id: string;
  message: string;
  created_at: string;
  jobs: { name: string };
}

export default function CrewNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [text, setText] = useState('');
  const [currentJob, setCurrentJob] = useState<{ id: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    const user = await getUser();
    if (!user) return;

    const { data: assignments } = await supabase
      .from('job_assignments')
      .select('job_id')
      .eq('employee_id', user.id)
      .not('checked_in_at', 'is', null)
      .is('checked_out_at', null)
      .limit(1);

    const jobId = assignments?.[0]?.job_id ?? null;
    if (jobId) {
      const { data: job } = await supabase.from('jobs').select('id, name').eq('id', jobId).single();
      setCurrentJob(job ? { id: job.id, name: job.name } : null);
    } else {
      setCurrentJob(null);
    }

    const { data } = await supabase
      .from('job_updates')
      .select('id, message, created_at, jobs(name)')
      .eq('employee_id', user.id)
      .eq('type', 'note')
      .order('created_at', { ascending: false })
      .limit(20);

    setNotes((data || []) as Note[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function submitNote() {
    if (!text.trim()) return;
    if (!currentJob) return Alert.alert('Not checked in', 'Check in to a job site first.');
    const user = await getUser();
    if (!user) return;

    setSaving(true);
    const { data } = await supabase
      .from('job_updates')
      .insert({ job_id: currentJob.id, employee_id: user.id, tenant_id: user.tenant_id, type: 'note', message: text.trim() })
      .select('id, message, created_at, jobs(name)')
      .single();

    if (data) setNotes(prev => [data as Note, ...prev]);
    setText('');
    setSaving(false);
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#0ea5e9" /></View>;
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.inputArea}>
        {currentJob
          ? <Text style={styles.currentJob}>📍 {currentJob.name}</Text>
          : <Text style={styles.notCheckedIn}>Check in to a job to add notes</Text>
        }
        <TextInput
          style={styles.input}
          placeholder="Add a field note..."
          placeholderTextColor="#555"
          value={text}
          onChangeText={setText}
          multiline
          editable={!!currentJob}
        />
        <TouchableOpacity
          style={[styles.submitBtn, (!currentJob || !text.trim()) && styles.submitDisabled]}
          onPress={submitNote}
          disabled={!currentJob || !text.trim() || saving}
        >
          {saving
            ? <ActivityIndicator color="#000" size="small" />
            : <Text style={styles.submitText}>Add Note</Text>
          }
        </TouchableOpacity>
      </View>

      <FlatList
        data={notes}
        keyExtractor={n => n.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#0ea5e9" />}
        ListEmptyComponent={<Text style={styles.empty}>No notes yet. Log your first field note above.</Text>}
        renderItem={({ item }) => (
          <View style={styles.noteCard}>
            <View style={styles.noteHeader}>
              <Text style={styles.noteJob}>{(item.jobs as any)?.name}</Text>
              <Text style={styles.noteDate}>
                {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {'  '}
                {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <Text style={styles.noteText}>{item.message}</Text>
          </View>
        )}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  inputArea: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  currentJob: { color: '#0ea5e9', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  notCheckedIn: { color: '#555', fontSize: 13, marginBottom: 8 },
  input: {
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
    borderRadius: 10, padding: 12, color: '#fff', fontSize: 14,
    minHeight: 80, textAlignVertical: 'top', marginBottom: 10,
  },
  submitBtn: { backgroundColor: '#0ea5e9', borderRadius: 10, padding: 12, alignItems: 'center' },
  submitDisabled: { backgroundColor: '#3a2010', opacity: 0.6 },
  submitText: { color: '#000', fontWeight: '700', fontSize: 14 },
  empty: { color: '#444', textAlign: 'center', marginTop: 40, fontSize: 14 },
  noteCard: {
    backgroundColor: '#1a1a1a', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#2a2a2a',
  },
  noteHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  noteJob: { color: '#888', fontSize: 12, fontWeight: '600' },
  noteDate: { color: '#555', fontSize: 12 },
  noteText: { color: '#ddd', fontSize: 14, lineHeight: 20 },
});
