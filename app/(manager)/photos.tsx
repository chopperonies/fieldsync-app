import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mobileGet } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import { ScreenHeader } from '../../components/Flat';

interface PhotoUpdate {
  id: string;
  message: string;
  photo_url: string;
  created_at: string;
  jobs: { name: string };
  employees: { name: string };
}

export default function ManagerPhotos() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [photos, setPhotos] = useState<PhotoUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await mobileGet<PhotoUpdate[]>('/api/mobile/owner/photos');
      setPhotos(data || []);
    } catch {
      setPhotos([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.accent} /></View>;
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Photos" subtitle={`${photos.length} ${photos.length === 1 ? 'photo' : 'photos'} from the field`} showBack={false} />
      <FlatList
        data={photos}
        keyExtractor={p => p.id}
        numColumns={2}
        contentContainerStyle={{ padding: 10, gap: 10, paddingBottom: 140 }}
        columnWrapperStyle={{ gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={theme.accent} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="camera-outline" size={36} color={theme.textMuted} />
            <Text style={styles.emptyTitle}>No photos yet</Text>
            <Text style={styles.emptySub}>Crew photos from job sites land here.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => Linking.openURL(item.photo_url)}
            activeOpacity={0.85}
          >
            <Image source={{ uri: item.photo_url }} style={styles.photo} resizeMode="cover" />
            <View style={styles.meta}>
              <Text style={styles.jobName} numberOfLines={1}>{(item.jobs as any)?.name}</Text>
              <Text style={styles.info} numberOfLines={1}>{(item.employees as any)?.name}</Text>
              <Text style={styles.info}>
                {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {'  '}
                {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
              {item.message && item.message !== 'Site photo' ? (
                <Text style={styles.caption} numberOfLines={2}>{item.message}</Text>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: t.bg },
    empty: { alignItems: 'center', paddingHorizontal: 36, paddingVertical: 60 },
    emptyTitle: { color: t.textPrimary, fontSize: 16, fontWeight: '800', marginTop: 10 },
    emptySub: { color: t.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4 },
    card: {
      flex: 1, backgroundColor: t.surface, borderRadius: 12,
      overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    },
    photo: { width: '100%', aspectRatio: 4 / 3 },
    meta: { padding: 8 },
    jobName: { color: t.textPrimary, fontSize: 12, fontWeight: '700', marginBottom: 2 },
    info: { color: t.textSecondary, fontSize: 11, marginBottom: 1 },
    caption: { color: t.textMuted, fontSize: 11, marginTop: 4, lineHeight: 15 },
  });
}
