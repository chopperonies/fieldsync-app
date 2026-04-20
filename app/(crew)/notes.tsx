import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl, Alert,
  KeyboardAvoidingView, Platform
} from 'react-native';
import { mobileGet, mobilePost } from '../../lib/mobileApi';
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
    try {
      const assignment = await mobileGet<{ job_id: string } | null>('/api/mobile/crew/assignment');
      if (assignment?.job_id) {
        const { job } = await mobileGet<{ job: { id: string; name: string } }>(`/api/mobile/crew/jobs/${assignment.job_id}`);
        setCurrentJob(job ? { id: job.id, name: job.name } : null);
      } else {
        setCurrentJob(null);
      }

      const notes = await mobileGet<Note[]>('/api/mobile/crew/my-updates?type=note&limit=20');
      setNotes(notes || []);
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function submitNote() {
    if (!text.trim()) return;
    if (!currentJob) return Alert.alert('Not checked in', 'Check in to a job site first.');
    setSaving(true);
    try {
      const saved = await mobilePost<any>(`/api/mobile/crew/jobs/${currentJob.id}/updates`, {
        type: 'note',
        message: text.trim(),
      });
      if (saved) {
        const enriched: Note = { ...saved, jobs: { name: currentJob.name } };
        setNotes(prev => [enriched, ...prev]);
      }
      setText('');
    } catch (e: any) {
      Alert.alert('Save failed', e.message || 'Could not save note.');
    } finally {
      setSaving(false);
    }
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
