import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl, ScrollView, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { mobileGet } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import { ScreenHeader } from '../../components/Flat';

interface JobWithCrew {
  id: string;
  name: string;
  address: string;
  status: string;
  crew: { name: string }[];
  pendingSupplies: number;
  recentUpdates: { type: string; message: string; employees: { name: string }; created_at: string; photo_url?: string }[];
}

const UPDATE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  checkin: 'location-outline',
  checkout: 'log-out-outline',
  supply_request: 'cube-outline',
  bottleneck: 'warning-outline',
  photo: 'camera-outline',
};

export default function ManagerDashboard() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [jobs, setJobs] = useState<JobWithCrew[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const data = await mobileGet<JobWithCrew[]>('/api/mobile/owner/dashboard');
      setJobs(data || []);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.accent} /></View>;
  }

  const activeCount = jobs.filter(j => j.status === 'active').length;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Dashboard"
        subtitle={`${activeCount} active ${activeCount === 1 ? 'job' : 'jobs'}, ${jobs.length} total`}
        showBack={false}
        right={(
          <TouchableOpacity
            onPress={() => router.push('/(manager)/settings' as any)}
            hitSlop={8}
            style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="settings-outline" size={22} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      />
      <FlatList
        data={jobs}
        keyExtractor={j => j.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={theme.accent} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="briefcase-outline" size={36} color={theme.textMuted} />
            <Text style={styles.emptyTitle}>No jobs to track yet</Text>
            <Text style={styles.emptySub}>Jobs created by an owner will show up here.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isOpen = selected === item.id;
          const crewActive = item.crew.length > 0;
          return (
            <TouchableOpacity
              style={[styles.card, item.status !== 'active' && styles.cardInactive]}
              onPress={() => setSelected(isOpen ? null : item.id)}
              activeOpacity={0.8}
            >
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.jobName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.jobAddress} numberOfLines={1}>{item.address}</Text>
                </View>
                <View style={styles.badges}>
                  <View style={[styles.badge, { backgroundColor: (crewActive ? theme.success : theme.textMuted) + '22' }]}>
                    <Ionicons name="people-outline" size={12} color={crewActive ? theme.success : theme.textMuted} />
                    <Text style={[styles.badgeText, { color: crewActive ? theme.success : theme.textMuted }]}>{item.crew.length}</Text>
                  </View>
                  {item.pendingSupplies > 0 ? (
                    <View style={[styles.badge, { backgroundColor: theme.accent + '22' }]}>
                      <Ionicons name="cube-outline" size={12} color={theme.accent} />
                      <Text style={[styles.badgeText, { color: theme.accent }]}>{item.pendingSupplies}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {crewActive ? (
                <Text style={styles.crewList} numberOfLines={1}>On site: {item.crew.map(c => c.name).join(', ')}</Text>
              ) : null}

              {isOpen ? (
                <ScrollView style={styles.updates}>
                  {item.recentUpdates.length === 0
                    ? <Text style={styles.noUpdates}>No recent activity</Text>
                    : item.recentUpdates.map((u, i) => (
                      <View key={i} style={styles.updateRow}>
                        <Ionicons
                          name={UPDATE_ICON[u.type] || 'ellipse-outline'}
                          size={14}
                          color={theme.textSecondary}
                          style={{ marginTop: 2 }}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.updateText}>{u.message}</Text>
                          <Text style={styles.updateMeta}>{u.employees?.name} · {new Date(u.created_at).toLocaleTimeString()}</Text>
                          {u.photo_url ? <Image source={{ uri: u.photo_url }} style={styles.updatePhoto} /> : null}
                        </View>
                      </View>
                    ))
                  }
                </ScrollView>
              ) : null}
            </TouchableOpacity>
          );
        }}
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
      backgroundColor: t.surface, borderRadius: 14,
      padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    },
    cardInactive: { opacity: 0.55 },
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
    jobName: { color: t.textPrimary, fontSize: 16, fontWeight: '700' },
    jobAddress: { color: t.textSecondary, fontSize: 13, marginTop: 2 },
    badges: { flexDirection: 'row', gap: 6, marginLeft: 8 },
    badge: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8,
    },
    badgeText: { fontSize: 12, fontWeight: '800' },
    crewList: { color: t.success, fontSize: 13, marginTop: 8 },
    updates: { marginTop: 12, maxHeight: 300 },
    noUpdates: { color: t.textMuted, fontSize: 13, textAlign: 'center', padding: 8 },
    updateRow: {
      flexDirection: 'row', gap: 8, paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border,
    },
    updateText: { color: t.textPrimary, fontSize: 13 },
    updateMeta: { color: t.textMuted, fontSize: 11, marginTop: 2 },
    updatePhoto: { width: '100%', height: 140, borderRadius: 8, marginTop: 6 },
  });
}
