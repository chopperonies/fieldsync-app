import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator, Alert, ActionSheetIOS, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { mobileGet, mobilePatch } from '../lib/mobileApi';
import { getUser } from '../lib/storage';
import { useTheme } from '../lib/themeContext';
import { Theme } from '../lib/theme';

const API_BASE = 'https://linkcrew.io';

type Me = {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  avatar_url: string | null;
};

export default function MyProfile() {
  const theme = useTheme();
  const styles = makeStyles(theme);

  const [me, setMe] = useState<Me | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await mobileGet<Me>('/api/mobile/me');
      setMe(data);
      setNameDraft(data?.name || '');
    } catch {
      // Silent — user sees default empty state; pull-to-refresh will retry.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed || !me || trimmed === me.name) return;
    setSavingName(true);
    try {
      const updated = await mobilePatch<Me>('/api/mobile/me', { name: trimmed });
      setMe(updated);
      setNameDraft(updated.name);
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'Try again.');
    } finally {
      setSavingName(false);
    }
  }

  async function pickAndUpload(source: 'camera' | 'library') {
    try {
      const perm = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(source === 'camera' ? 'Camera permission needed' : 'Photo library permission needed');
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.75, allowsEditing: true, aspect: [1, 1] })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.75, allowsEditing: true, aspect: [1, 1], mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      await uploadAvatar(asset.uri, asset.mimeType || 'image/jpeg');
    } catch (e: any) {
      Alert.alert('Could not select photo', e?.message || 'Try again.');
    }
  }

  async function uploadAvatar(uri: string, mimeType: string) {
    setUploadingAvatar(true);
    try {
      const user = await getUser();
      const token = (user as any)?.mobile_session_token;
      if (!token) throw new Error('Not signed in');
      const form = new FormData();
      const filename = `avatar.${(mimeType.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`;
      form.append('avatar', {
        uri,
        name: filename,
        type: mimeType,
      } as any);
      const res = await fetch(`${API_BASE}/api/mobile/me/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed (${res.status})`);
      }
      const json = await res.json();
      setMe(prev => prev ? { ...prev, avatar_url: json.avatar_url } : prev);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message || 'Try again.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  function openAvatarMenu() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Pick from Library'], cancelButtonIndex: 0 },
        (idx) => {
          if (idx === 1) pickAndUpload('camera');
          if (idx === 2) pickAndUpload('library');
        },
      );
    } else {
      Alert.alert('Profile photo', 'Choose source', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take photo', onPress: () => pickAndUpload('camera') },
        { text: 'From library', onPress: () => pickAndUpload('library') },
      ]);
    }
  }

  if (loading) {
    return <ActivityIndicator color={theme.accent} style={{ marginVertical: 20 }} />;
  }

  const initial = (me?.name || '?').charAt(0).toUpperCase();
  const nameChanged = nameDraft.trim() !== (me?.name || '');

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TouchableOpacity style={styles.avatarWrap} onPress={openAvatarMenu} disabled={uploadingAvatar}>
          {me?.avatar_url ? (
            <Image source={{ uri: me.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarLetter}>{initial}</Text>
            </View>
          )}
          <View style={styles.avatarEdit}>
            {uploadingAvatar
              ? <ActivityIndicator size="small" color={theme.accentContrast} />
              : <Ionicons name="camera" size={14} color={theme.accentContrast} />}
          </View>
        </TouchableOpacity>

        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.nameInput}
            value={nameDraft}
            onChangeText={setNameDraft}
            onBlur={saveName}
            placeholder="Your name"
            placeholderTextColor={theme.textMuted}
            returnKeyType="done"
            onSubmitEditing={saveName}
          />
          {nameChanged ? (
            <TouchableOpacity onPress={saveName} disabled={savingName}>
              <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '800' }}>
                {savingName ? 'Saving…' : 'Save name'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Phone</Text>
          <Text style={styles.metaValue}>{me?.phone || '—'}</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Role</Text>
          <View style={[styles.rolePill, { backgroundColor: theme.accentMuted, borderColor: theme.accent + '55' }]}>
            <Text style={{ color: theme.accent, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {me?.role || '—'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    wrap: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      backgroundColor: t.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.border,
      gap: 14,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    avatarWrap: { position: 'relative' },
    avatar: { width: 64, height: 64, borderRadius: 32 },
    avatarFallback: { backgroundColor: t.accentMuted, alignItems: 'center', justifyContent: 'center' },
    avatarLetter: { color: t.accent, fontSize: 24, fontWeight: '800' },
    avatarEdit: {
      position: 'absolute', bottom: -2, right: -2,
      width: 24, height: 24, borderRadius: 12,
      backgroundColor: t.accent,
      borderWidth: 2, borderColor: t.surface,
      alignItems: 'center', justifyContent: 'center',
    },
    label: { color: t.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    nameInput: {
      color: t.textPrimary, fontSize: 17, fontWeight: '700',
      paddingVertical: 2, paddingHorizontal: 0,
      borderBottomWidth: 1, borderBottomColor: t.border,
    },

    metaRow: { flexDirection: 'row', gap: 24, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
    metaItem: { flex: 1, gap: 4 },
    metaLabel: { color: t.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    metaValue: { color: t.textPrimary, fontSize: 15, fontWeight: '700' },
    rolePill: {
      alignSelf: 'flex-start',
      paddingVertical: 3, paddingHorizontal: 10,
      borderRadius: 999, borderWidth: 1,
    },
  });
}
