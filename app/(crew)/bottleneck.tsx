import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Job } from '../../lib/supabase';
import { mobileGet, mobilePost } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import { ScreenHeader } from '../../components/Flat';

export default function Bottleneck() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    mobileGet<Job[]>('/api/mobile/crew/jobs').then(data => setJobs(data || [])).catch(() => setJobs([]));
  }, []);

  async function handleSubmit() {
    if (!selectedJob) return Alert.alert('Select a job site first');
    if (!description.trim()) return Alert.alert('Describe the issue');
    setLoading(true);
    try {
      await mobilePost(`/api/mobile/crew/jobs/${selectedJob.id}/updates`, {
        type: 'bottleneck',
        message: description.trim(),
      });
      Alert.alert('Reported', 'Manager has been notified of the bottleneck.');
      setDescription('');
      setSelectedJob(null);
    } catch (e: any) {
      Alert.alert('Failed', e.message || 'Could not flag bottleneck.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Bottleneck" subtitle="Flag what's blocking your work" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 120 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.banner}>
            <Ionicons name="warning-outline" size={18} color={theme.warning} />
            <Text style={styles.bannerText}>
              Use this for waiting on materials, inspection holds, safety issues — anything stopping the work.
            </Text>
          </View>

          <Text style={styles.sectionLabel}>Job site</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
            {jobs.map(j => {
              const active = selectedJob?.id === j.id;
              return (
                <TouchableOpacity
                  key={j.id}
                  style={[styles.jobChip, active && styles.jobChipActive]}
                  onPress={() => setSelectedJob(j)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.jobChipText, active && styles.jobChipTextActive]}>{j.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={styles.sectionLabel}>Describe the issue</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Waiting on permit approval before we can continue framing"
            placeholderTextColor={theme.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={5}
          />

          <TouchableOpacity
            style={[styles.submitBtn, (loading || !selectedJob || !description.trim()) && { opacity: 0.4 }]}
            onPress={handleSubmit}
            disabled={loading || !selectedJob || !description.trim()}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color={theme.accentContrast} />
              : <Text style={styles.submitText}>Flag bottleneck</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    content: { padding: 16, gap: 8 },
    banner: {
      backgroundColor: t.warning + '14',
      borderWidth: 1, borderColor: t.warning + '55',
      borderRadius: 12, padding: 14,
      flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 8,
    },
    bannerText: { color: t.warning, fontSize: 13, flex: 1, lineHeight: 18, fontWeight: '600' },
    sectionLabel: { color: t.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 12, marginBottom: 4 },
    jobChip: {
      borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14,
      backgroundColor: t.surfaceInset,
      borderWidth: 1, borderColor: 'transparent',
      marginRight: 8,
    },
    jobChipActive: { borderColor: t.accent + '66', backgroundColor: t.accent + '18' },
    jobChipText: { color: t.textSecondary, fontSize: 14, fontWeight: '600' },
    jobChipTextActive: { color: t.accent, fontWeight: '800' },
    input: {
      backgroundColor: t.surfaceInset,
      borderRadius: 12, padding: 14, color: t.textPrimary, fontSize: 15, textAlignVertical: 'top',
      minHeight: 100,
    },
    submitBtn: {
      backgroundColor: t.warning, borderRadius: 12, padding: 16,
      alignItems: 'center', marginTop: 16,
    },
    submitText: { color: t.accentContrast, fontWeight: '800', fontSize: 16 },
  });
}
