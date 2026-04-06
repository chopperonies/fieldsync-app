import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator
} from 'react-native';
import { supabase, Job } from '../../lib/supabase';
import { getUser } from '../../lib/storage';

export default function Bottleneck() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getUser().then(user => {
      let q = supabase.from('jobs').select('*').eq('status', 'active').order('name');
      if (user?.tenant_id) q = q.eq('tenant_id', user.tenant_id);
      q.then(({ data }) => setJobs(data || []));
    });
  }, []);

  async function handleSubmit() {
    if (!selectedJob) return Alert.alert('Select a job site first');
    if (!description.trim()) return Alert.alert('Describe the issue');
    const user = await getUser();
    if (!user) return;

    setLoading(true);
    try {
      await supabase.from('job_updates').insert({
        job_id: selectedJob.id,
        employee_id: user.id,
        tenant_id: user.tenant_id,
        type: 'bottleneck',
        message: description.trim(),
      });

      Alert.alert('Reported', 'Manager has been notified of the bottleneck.');
      setDescription('');
      setSelectedJob(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.banner}>
        <Text style={styles.bannerIcon}>🚧</Text>
        <Text style={styles.bannerText}>Flag something blocking your work — waiting on materials, inspection hold, safety issue, etc.</Text>
      </View>

      <Text style={styles.sectionLabel}>Job Site</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
        {jobs.map(j => (
          <TouchableOpacity
            key={j.id}
            style={[styles.jobChip, selectedJob?.id === j.id && styles.jobChipActive]}
            onPress={() => setSelectedJob(j)}
          >
            <Text style={[styles.jobChipText, selectedJob?.id === j.id && styles.jobChipTextActive]}>
              {j.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.sectionLabel}>Describe the Issue</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Waiting on permit approval before we can continue framing"
        placeholderTextColor="#555"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={5}
      />

      <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={loading}>
        {loading
          ? <ActivityIndicator color="#000" />
          : <Text style={styles.submitText}>Flag Bottleneck</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 16, gap: 8 },
  banner: {
    backgroundColor: '#1a1200', borderWidth: 1, borderColor: '#f59e0b',
    borderRadius: 12, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 8,
  },
  bannerIcon: { fontSize: 20 },
  bannerText: { color: '#f59e0b', fontSize: 13, flex: 1, lineHeight: 18 },
  sectionLabel: { color: '#888', fontSize: 13, fontWeight: '600', marginTop: 12, marginBottom: 4 },
  jobChip: {
    borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16,
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', marginRight: 8,
  },
  jobChipActive: { borderColor: '#0ea5e9', backgroundColor: '#e8f0fd' },
  jobChipText: { color: '#888', fontSize: 14 },
  jobChipTextActive: { color: '#0ea5e9' },
  input: {
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
    borderRadius: 12, padding: 14, color: '#fff', fontSize: 15, textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: '#f59e0b', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 16,
  },
  submitText: { color: '#000', fontWeight: '700', fontSize: 16 },
});
