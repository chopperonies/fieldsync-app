import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Image
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase, Job } from '../../lib/supabase';
import { getUser } from '../../lib/storage';

export default function Photo() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [caption, setCaption] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('jobs').select('*').eq('status', 'active').order('name')
      .then(({ data }) => setJobs(data || []));
  }, []);

  async function takePhoto() {
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  }

  async function pickFromGallery() {
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  }

  async function handleSubmit() {
    if (!selectedJob) return Alert.alert('Select a job site first');
    if (!photoUri) return Alert.alert('Take or select a photo first');
    const user = await getUser();
    if (!user) return;

    setLoading(true);
    try {
      const response = await fetch(photoUri);
      const blob = await response.blob();
      const fileName = `${user.id}/${Date.now()}.jpg`;
      await supabase.storage.from('photos').upload(fileName, blob, {
        contentType: 'image/jpeg', upsert: true,
      });
      const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(fileName);

      await supabase.from('job_updates').insert({
        job_id: selectedJob.id,
        employee_id: user.id,
        type: 'photo',
        message: caption.trim() || 'Site photo',
        photo_url: publicUrl,
      });

      Alert.alert('Uploaded!', 'Photo saved to job site.');
      setPhotoUri(null);
      setCaption('');
      setSelectedJob(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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

      <View style={styles.photoArea}>
        {photoUri
          ? <Image source={{ uri: photoUri }} style={styles.preview} />
          : <Text style={styles.photoPlaceholder}>No photo selected</Text>
        }
      </View>

      <View style={styles.row}>
        <TouchableOpacity style={[styles.photoBtn, { flex: 1 }]} onPress={takePhoto}>
          <Text style={styles.photoBtnText}>📷 Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.photoBtn, { flex: 1 }]} onPress={pickFromGallery}>
          <Text style={styles.photoBtnText}>🖼️ Gallery</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Caption (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Framing complete on east wall"
        placeholderTextColor="#555"
        value={caption}
        onChangeText={setCaption}
      />

      <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={loading}>
        {loading
          ? <ActivityIndicator color="#000" />
          : <Text style={styles.submitText}>Send Photo</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 16, gap: 8 },
  sectionLabel: { color: '#888', fontSize: 13, fontWeight: '600', marginTop: 12, marginBottom: 4 },
  jobChip: {
    borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16,
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', marginRight: 8,
  },
  jobChipActive: { borderColor: '#f97316', backgroundColor: '#2a1a0a' },
  jobChipText: { color: '#888', fontSize: 14 },
  jobChipTextActive: { color: '#f97316' },
  photoArea: {
    height: 220, backgroundColor: '#1a1a1a', borderRadius: 14,
    borderWidth: 1, borderColor: '#2a2a2a', overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center', marginTop: 8,
  },
  preview: { width: '100%', height: '100%' },
  photoPlaceholder: { color: '#444', fontSize: 14 },
  row: { flexDirection: 'row', gap: 10, marginTop: 10 },
  photoBtn: {
    borderRadius: 10, padding: 12, alignItems: 'center',
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
  },
  photoBtnText: { color: '#ccc', fontSize: 14, fontWeight: '600' },
  input: {
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
    borderRadius: 12, padding: 14, color: '#fff', fontSize: 15,
  },
  submitBtn: {
    backgroundColor: '#f97316', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 16,
  },
  submitText: { color: '#000', fontWeight: '700', fontSize: 16 },
});
