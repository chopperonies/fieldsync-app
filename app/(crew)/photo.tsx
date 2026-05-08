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

export default function Photo() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [caption, setCaption] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    mobileGet<Job[]>('/api/mobile/crew/jobs').then(data => setJobs(data || [])).catch(() => setJobs([]));
  }, []);

  async function takePhoto() {
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8, base64: true });
    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
      setPhotoBase64(result.assets[0].base64 ?? null);
    }
  }

  async function pickFromGallery() {
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, base64: true });
    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
      setPhotoBase64(result.assets[0].base64 ?? null);
    }
  }

  async function handleSubmit() {
    if (!selectedJob) return Alert.alert('Select a job site first');
    if (!photoUri || !photoBase64) return Alert.alert('Take or select a photo first');
    const user = await getUser();
    if (!user) return;

    setLoading(true);
    try {
      const binaryString = atob(photoBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const fileName = `${user.id}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(fileName, bytes, { contentType: 'image/jpeg' });

      if (uploadError) {
        Alert.alert('Upload failed', uploadError.message);
        return;
      }

      const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(fileName);

      try {
        await mobilePost(`/api/mobile/crew/jobs/${selectedJob.id}/updates`, {
          type: 'photo',
          message: caption.trim() || 'Site photo',
          photo_url: publicUrl,
        });
      } catch (e: any) {
        Alert.alert('Save failed', e.message || 'Could not save photo record.');
        return;
      }

      Alert.alert('Uploaded', 'Photo saved to job site.');
      setPhotoUri(null);
      setPhotoBase64(null);
      setCaption('');
      setSelectedJob(null);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Photo" subtitle="Snap a site photo with caption" />
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

          <View style={styles.photoArea}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="cover" />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Ionicons name="image-outline" size={36} color={theme.textMuted} />
                <Text style={styles.photoPlaceholderText}>No photo selected</Text>
              </View>
            )}
          </View>

          <View style={styles.row}>
            <TouchableOpacity style={[styles.photoBtn, { flex: 1 }]} onPress={takePhoto} activeOpacity={0.8}>
              <Ionicons name="camera-outline" size={18} color={theme.textPrimary} />
              <Text style={styles.photoBtnText}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.photoBtn, { flex: 1 }]} onPress={pickFromGallery} activeOpacity={0.8}>
              <Ionicons name="images-outline" size={18} color={theme.textPrimary} />
              <Text style={styles.photoBtnText}>Gallery</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>Caption (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Framing complete on east wall"
            placeholderTextColor={theme.textMuted}
            value={caption}
            onChangeText={setCaption}
          />

          <TouchableOpacity
            style={[styles.submitBtn, (loading || !selectedJob || !photoUri) && { opacity: 0.4 }]}
            onPress={handleSubmit}
            disabled={loading || !selectedJob || !photoUri}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color={theme.accentContrast} />
              : <Text style={styles.submitText}>Send photo</Text>
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
    photoArea: {
      height: 220, backgroundColor: t.surfaceInset, borderRadius: 14,
      overflow: 'hidden', justifyContent: 'center', alignItems: 'center', marginTop: 8,
    },
    preview: { width: '100%', height: '100%' },
    photoPlaceholder: { alignItems: 'center', gap: 6 },
    photoPlaceholderText: { color: t.textMuted, fontSize: 13 },
    row: { flexDirection: 'row', gap: 10, marginTop: 10 },
    photoBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      borderRadius: 10, padding: 12,
      backgroundColor: t.surfaceInset,
    },
    photoBtnText: { color: t.textPrimary, fontSize: 14, fontWeight: '700' },
    input: {
      backgroundColor: t.surfaceInset,
      borderRadius: 12, padding: 14, color: t.textPrimary, fontSize: 15,
    },
    submitBtn: {
      backgroundColor: t.accent, borderRadius: 12, padding: 16,
      alignItems: 'center', marginTop: 16,
    },
    submitText: { color: t.accentContrast, fontWeight: '800', fontSize: 16 },
  });
}
