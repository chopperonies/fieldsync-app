import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Image,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase, Job } from '../../lib/supabase';
import { getUser } from '../../lib/storage';
import { mobileGet, mobilePost } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import { ScreenHeader } from '../../components/Flat';

export default function Supplies() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [items, setItems] = useState('');
  const [urgency, setUrgency] = useState<'same_day' | 'next_day'>('next_day');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    mobileGet<Job[]>('/api/mobile/crew/jobs').then(data => setJobs(data || [])).catch(() => setJobs([]));
  }, []);

  async function pickPhoto() {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  }

  async function uploadPhoto(uri: string, employeeId: string): Promise<string | null> {
    const response = await fetch(uri);
    const blob = await response.blob();
    const fileName = `${employeeId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('photos').upload(fileName, blob, {
      contentType: 'image/jpeg', upsert: true,
    });
    if (error) return null;
    const { data } = supabase.storage.from('photos').getPublicUrl(fileName);
    return data.publicUrl;
  }

  async function handleSubmit() {
    if (!selectedJob) return Alert.alert('Select a job site first');
    if (!items.trim()) return Alert.alert('Describe the missing items');
    const user = await getUser();
    if (!user) return;

    setLoading(true);
    try {
      let photoUrl: string | null = null;
      if (photoUri) photoUrl = await uploadPhoto(photoUri, user.id);

      await mobilePost(`/api/mobile/crew/jobs/${selectedJob.id}/supply-request`, {
        items: items.trim(),
        urgency,
        photo_url: photoUrl,
      });

      await mobilePost(`/api/mobile/crew/jobs/${selectedJob.id}/updates`, {
        type: 'supply_request',
        message: `Missing supplies: ${items.trim()} (${urgency.replace('_', ' ')})`,
      });

      Alert.alert('Submitted', 'Manager has been notified.');
      setItems('');
      setPhotoUri(null);
      setSelectedJob(null);
    } catch (e: any) {
      Alert.alert('Failed', e.message || 'Could not submit request.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Supplies" subtitle="Request what you need on site" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 120 }]}
          keyboardShouldPersistTaps="handled"
        >
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

          <Text style={styles.sectionLabel}>Missing items</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 10x 1/2 inch conduit, 4x junction boxes"
            placeholderTextColor={theme.textMuted}
            value={items}
            onChangeText={setItems}
            multiline
            numberOfLines={3}
          />

          <Text style={styles.sectionLabel}>Urgency</Text>
          <View style={styles.row}>
            {(['same_day', 'next_day'] as const).map(u => {
              const active = urgency === u;
              const tint = u === 'same_day' ? theme.danger : theme.warning;
              return (
                <TouchableOpacity
                  key={u}
                  style={[
                    styles.urgencyBtn,
                    active && { borderColor: tint + '66', backgroundColor: tint + '18' },
                  ]}
                  onPress={() => setUrgency(u)}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name={u === 'same_day' ? 'flash-outline' : 'time-outline'}
                    size={16}
                    color={active ? tint : theme.textSecondary}
                  />
                  <Text style={[styles.urgencyText, active && { color: tint, fontWeight: '800' }]}>
                    {u === 'same_day' ? 'Same day' : 'Next day'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={styles.photoBtn} onPress={pickPhoto} activeOpacity={0.8}>
            <Ionicons name={photoUri ? 'checkmark-circle' : 'camera-outline'} size={18} color={photoUri ? theme.success : theme.textSecondary} />
            <Text style={styles.photoBtnText}>{photoUri ? 'Photo attached' : 'Attach photo (optional)'}</Text>
          </TouchableOpacity>
          {photoUri ? <Image source={{ uri: photoUri }} style={styles.preview} /> : null}

          <TouchableOpacity
            style={[styles.submitBtn, (loading || !selectedJob || !items.trim()) && { opacity: 0.4 }]}
            onPress={handleSubmit}
            disabled={loading || !selectedJob || !items.trim()}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color={theme.accentContrast} />
              : <Text style={styles.submitText}>Submit request</Text>
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
    },
    row: { flexDirection: 'row', gap: 10 },
    urgencyBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      borderRadius: 10, padding: 12,
      backgroundColor: t.surfaceInset,
      borderWidth: 1, borderColor: 'transparent',
    },
    urgencyText: { color: t.textSecondary, fontWeight: '600' },
    photoBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      borderRadius: 10, padding: 14,
      borderWidth: 1, borderColor: t.border, borderStyle: 'dashed',
    },
    photoBtnText: { color: t.textSecondary, fontSize: 14, fontWeight: '600' },
    preview: { width: '100%', height: 180, borderRadius: 10, marginTop: 8 },
    submitBtn: {
      backgroundColor: t.accent, borderRadius: 12, padding: 16,
      alignItems: 'center', marginTop: 16,
    },
    submitText: { color: t.accentContrast, fontWeight: '800', fontSize: 16 },
  });
}
