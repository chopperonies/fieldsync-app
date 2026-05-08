import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, RefreshControl, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { mobileGet, mobilePost } from '../../lib/mobileApi';
import { Job } from '../../lib/supabase';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import { ScreenHeader } from '../../components/Flat';

interface Note {
  id: string;
  message: string;
  created_at: string;
  jobs: { name: string };
}

export default function CrewNotes() {
  const theme = useTheme();
  const styles = makeStyles(theme);
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
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.accent} /></View>;
  }

  const canSubmit = !!selectedJob && !!text.trim() && !saving;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Notes" subtitle="Log what happened on site" showBack={false} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <View style={styles.inputArea}>
          <Text style={styles.sectionLabel}>Job site</Text>
          {jobs.length === 0 ? (
            <Text style={styles.notCheckedIn}>No active jobs found.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {jobs.map(j => {
                const active = selectedJob?.id === j.id;
                return (
                  <TouchableOpacity
                    key={j.id}
                    style={[styles.jobChip, active && styles.jobChipActive]}
                    onPress={() => setSelectedJob({ id: j.id, name: j.name })}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.jobChipText, active && styles.jobChipTextActive]}>{j.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
          <TextInput
            style={styles.input}
            placeholder="Add a field note…"
            placeholderTextColor={theme.textMuted}
            value={text}
            onChangeText={setText}
            multiline
          />
          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && styles.submitDisabled]}
            onPress={submitNote}
            disabled={!canSubmit}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator color={theme.accentContrast} size="small" />
              : <Text style={styles.submitText}>Add note</Text>
            }
          </TouchableOpacity>
        </View>

        <FlatList
          data={notes}
          keyExtractor={n => n.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 140 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={theme.accent} />}
          ListEmptyComponent={<Text style={styles.empty}>No notes yet. Log your first field note above.</Text>}
          renderItem={({ item }) => (
            <View style={styles.noteCard}>
              <View style={styles.noteHeader}>
                <Text style={styles.noteJob} numberOfLines={1}>{(item.jobs as any)?.name}</Text>
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
    </View>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: t.bg },
    inputArea: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
    sectionLabel: {
      color: t.textSecondary, fontSize: 12, fontWeight: '700',
      letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8,
    },
    jobChip: {
      borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14,
      backgroundColor: t.surfaceInset,
      borderWidth: 1, borderColor: 'transparent',
      marginRight: 8,
    },
    jobChipActive: { borderColor: t.accent + '66', backgroundColor: t.accent + '18' },
    jobChipText: { color: t.textSecondary, fontSize: 13, fontWeight: '600' },
    jobChipTextActive: { color: t.accent, fontWeight: '800' },
    notCheckedIn: { color: t.textMuted, fontSize: 13, marginBottom: 10 },
    input: {
      backgroundColor: t.surfaceInset,
      borderRadius: 10, padding: 12, color: t.textPrimary, fontSize: 14,
      minHeight: 80, textAlignVertical: 'top', marginBottom: 10,
    },
    submitBtn: {
      backgroundColor: t.accent, borderRadius: 10, padding: 12,
      alignItems: 'center', justifyContent: 'center',
    },
    submitDisabled: { opacity: 0.4 },
    submitText: { color: t.accentContrast, fontWeight: '800', fontSize: 14 },
    empty: { color: t.textMuted, textAlign: 'center', marginTop: 40, fontSize: 14 },
    noteCard: {
      backgroundColor: t.surface, borderRadius: 14, padding: 14,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    },
    noteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12 },
    noteJob: { color: t.textPrimary, fontSize: 13, fontWeight: '700', flex: 1 },
    noteDate: { color: t.textMuted, fontSize: 12 },
    noteText: { color: t.textSecondary, fontSize: 14, lineHeight: 20 },
  });
}
