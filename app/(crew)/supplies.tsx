import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Image
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase, Job } from '../../lib/supabase';
import { getUser } from '../../lib/storage';

export default function Supplies() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [items, setItems] = useState('');
  const [urgency, setUrgency] = useState<'same_day' | 'next_day'>('next_day');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getUser().then(user => {
      let q = supabase.from('jobs').select('*').eq('status', 'active').order('name');
      if (user?.tenant_id) q = q.eq('tenant_id', user.tenant_id);
      q.then(({ data }) => setJobs(data || []));
    });
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

      await supabase.from('supply_requests').insert({
        job_id: selectedJob.id,
        employee_id: user.id,
        tenant_id: user.tenant_id,
        items: items.trim(),
        urgency,
        photo_url: photoUrl,
      });

      await supabase.from('job_updates').insert({
        job_id: selectedJob.id,
        employee_id: user.id,
        tenant_id: user.tenant_id,
        type: 'supply_request',
        message: `Missing supplies: ${items.trim()} (${urgency.replace('_', ' ')})`,
      });

      Alert.alert('Submitted!', 'Manager has been notified.');
      setItems('');
      setPhotoUri(null);
      setSelectedJob(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionLabel}>Job Site</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.jobScroll}>
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

      <Text style={styles.sectionLabel}>Missing Items</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 10x 1/2 inch conduit, 4x junction boxes"
        placeholderTextColor="#555"
        value={items}
        onChangeText={setItems}
        multiline
        numberOfLines={3}
      />

      <Text style={styles.sectionLabel}>Urgency</Text>
      <View style={styles.row}>
        {(['same_day', 'next_day'] as const).map(u => (
          <TouchableOpacity
            key={u}
            style={[styles.urgencyBtn, urgency === u && styles.urgencyBtnActive]}
            onPress={() => setUrgency(u)}
          >
            <Text style={[styles.urgencyText, urgency === u && styles.urgencyTextActive]}>
              {u === 'same_day' ? '🔴 Same Day' : '🟡 Next Day'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.photoBtn} onPress={pickPhoto}>
        <Text style={styles.photoBtnText}>{photoUri ? '📸 Photo attached' : '📷 Attach photo (optional)'}</Text>
      </TouchableOpacity>
      {photoUri && <Image source={{ uri: photoUri }} style={styles.preview} />}

      <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={loading}>
        {loading
          ? <ActivityIndicator color="#000" />
          : <Text style={styles.submitText}>Submit Request</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 16, gap: 8 },
  sectionLabel: { color: '#888', fontSize: 13, fontWeight: '600', marginTop: 12, marginBottom: 4 },
  jobScroll: { marginBottom: 4 },
  jobChip: {
    borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16,
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', marginRight: 8,
  },
  jobChipActive: { borderColor: '#0265dc', backgroundColor: '#e8f0fd' },
  jobChipText: { color: '#888', fontSize: 14 },
  jobChipTextActive: { color: '#0265dc' },
  input: {
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
    borderRadius: 12, padding: 14, color: '#fff', fontSize: 15, textAlignVertical: 'top',
  },
  row: { flexDirection: 'row', gap: 10 },
  urgencyBtn: {
    flex: 1, borderRadius: 10, padding: 12, alignItems: 'center',
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
  },
  urgencyBtnActive: { borderColor: '#0265dc', backgroundColor: '#e8f0fd' },
  urgencyText: { color: '#888', fontWeight: '600' },
  urgencyTextActive: { color: '#0265dc' },
  photoBtn: {
    borderRadius: 10, padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#2a2a2a', borderStyle: 'dashed',
  },
  photoBtnText: { color: '#888', fontSize: 14 },
  preview: { width: '100%', height: 180, borderRadius: 10, marginTop: 8 },
  submitBtn: {
    backgroundColor: '#0265dc', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 16,
  },
  submitText: { color: '#000', fontWeight: '700', fontSize: 16 },
});
