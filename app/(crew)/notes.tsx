import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, RefreshControl, Alert,
  KeyboardAvoidingView, Platform
} from 'react-native';
import { mobileGet, mobilePost } from '../../lib/mobileApi';
import { Job } from '../../lib/supabase';

interface Note {
  id: string;
  message: string;
  created_at: string;
  jobs: { name: string };
}

export default function CrewNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [text, setText] = useState('');
  const [selectedJob, setSelectedJob] = useState<{ id: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [jobsList, assignment, recent] = await Promise.all([
        mobileGet<Job[]>('/api/mobile/crew/jobs'),
        mobileGet<{ job_id: string } | null>('/api/mobile/crew/assignment').catch(() => null),
        mobileGet<Note[]>('/api/mobile/crew/my-updates?type=note&limit=20').catch(() => []),
      ]);
      setJobs(jobsList || []);
      setNotes(recent || []);
      // Preselect the currently checked-in job if there is one, otherwise the first job.
      setSelectedJob(prev => {
        if (prev) return prev;
        if (assignment?.job_id) {
          const match = (jobsList || []).find(j => j.id === assignment.job_id);
          if (match) return { id: match.id, name: match.name };
        }
        const first = (jobsList || [])[0];
        return first ? { id: first.id, name: first.name } : null;
      });
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
    if (!selectedJob) return Alert.alert('Pick a job', 'Select a job above to attach this note to.');
    setSaving(true);
    try {
      const saved = await mobilePost<any>(`/api/mobile/crew/jobs/${selectedJob.id}/updates`, {
        type: 'note',
        message: text.trim(),
      });
      if (saved) {
        const enriched: Note = { ...saved, jobs: { name: selectedJob.name } };
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <View style={styles.inputArea}>
        <Text style={styles.sectionLabel}>Job Site</Text>
        {jobs.length === 0 ? (
          <Text style={styles.notCheckedIn}>No active jobs found.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            {jobs.map(j => (
              <TouchableOpacity
                key={j.id}
                style={[styles.jobChip, selectedJob?.id === j.id && styles.jobChipActive]}
                onPress={() => setSelectedJob({ id: j.id, name: j.name })}
              >
                <Text style={[styles.jobChipText, selectedJob?.id === j.id && styles.jobChipTextActive]}>
                  {j.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <TextInput
          style={styles.input}
          placeholder="Add a field note..."
          placeholderTextColor="#555"
          value={text}
          onChangeText={setText}
          multiline
        />
        <TouchableOpacity
          style={[styles.submitBtn, (!selectedJob || !text.trim()) && styles.submitDisabled]}
          onPress={submitNote}
          disabled={!selectedJob || !text.trim() || saving}
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
  sectionLabel: { color: '#888', fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },
  jobChip: {
    borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14,
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', marginRight: 8,
  },
  jobChipActive: { borderColor: '#0ea5e9', backgroundColor: '#0ea5e91a' },
  jobChipText: { color: '#888', fontSize: 13 },
  jobChipTextActive: { color: '#0ea5e9', fontWeight: '600' },
  notCheckedIn: { color: '#555', fontSize: 13, marginBottom: 10 },
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
