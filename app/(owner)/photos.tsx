import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl, Linking
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { getUser } from '../../lib/storage';

interface PhotoUpdate {
  id: string;
  message: string;
  photo_url: string;
  created_at: string;
  jobs: { name: string };
  employees: { name: string };
}

export default function OwnerPhotos() {
  const [photos, setPhotos] = useState<PhotoUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const user = await getUser();
    let q = supabase.from('job_updates')
      .select('id, message, photo_url, created_at, jobs(name), employees(name)')
      .eq('type', 'photo').not('photo_url', 'is', null)
      .order('created_at', { ascending: false }).limit(40);
    if (user?.tenant_id) q = q.eq('tenant_id', user.tenant_id);
    const { data } = await q;
    setPhotos((data || []) as PhotoUpdate[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#0265dc" /></View>;
  }

  return (
    <FlatList
      data={photos}
      keyExtractor={p => p.id}
      numColumns={2}
      style={styles.container}
      contentContainerStyle={{ padding: 10, gap: 10 }}
      columnWrapperStyle={{ gap: 10 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#0265dc" />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📸</Text>
          <Text style={styles.emptyText}>No photos yet</Text>
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
            <Text style={styles.info} numberOfLines={1}>👷 {(item.employees as any)?.name}</Text>
            <Text style={styles.info}>
              {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {'  '}
              {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {item.message && item.message !== 'Site photo' && (
              <Text style={styles.caption} numberOfLines={2}>{item.message}</Text>
            )}
          </View>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  empty: { flex: 1, alignItems: 'center', marginTop: 80 },
  emptyIcon: { fontSize: 40, marginBottom: 10 },
  emptyText: { color: '#444', fontSize: 15 },
  card: {
    flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12,
    overflow: 'hidden', borderWidth: 1, borderColor: '#2a2a2a',
  },
  photo: { width: '100%', aspectRatio: 4 / 3 },
  meta: { padding: 8 },
  jobName: { color: '#38bdf8', fontSize: 11, fontWeight: '600', marginBottom: 2 },
  info: { color: '#555', fontSize: 10, marginBottom: 1 },
  caption: { color: '#888', fontSize: 11, marginTop: 3, lineHeight: 15 },
});
