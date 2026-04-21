import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, SectionList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Job } from '../../lib/supabase';
import { mobileGet } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import { statusMeta } from '../../lib/jobStatus';
import { prettyDate, fromDateString } from '../../components/CalendarPicker';

type Bucket = 'today' | 'tomorrow' | 'thisWeek' | 'later' | 'undated';

const BUCKET_LABEL: Record<Bucket, string> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  thisWeek: 'Later this week',
  later: 'Later',
  undated: 'No date picked',
};

function bucketFor(dateStr: string | null | undefined): Bucket {
  if (!dateStr) return 'undated';
  const d = fromDateString(dateStr);
  if (!d) return 'undated';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diffDays = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays <= 6) return 'thisWeek';
  return 'later';
}

export default function CrewSchedule() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await mobileGet<Job[]>('/api/mobile/crew/jobs');
      setJobs(data || []);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Group, preserve order: today -> tomorrow -> thisWeek -> later -> undated.
  const buckets: Record<Bucket, Job[]> = {
    today: [], tomorrow: [], thisWeek: [], later: [], undated: [],
  };
  for (const j of jobs) buckets[bucketFor(j.scheduled_date)].push(j);
  for (const k of Object.keys(buckets) as Bucket[]) {
    buckets[k].sort((a, b) => {
      const ad = a.scheduled_date || '';
      const bd = b.scheduled_date || '';
      if (ad !== bd) return ad.localeCompare(bd);
      return a.name.localeCompare(b.name);
    });
  }
  const sections = (['today', 'tomorrow', 'thisWeek', 'later', 'undated'] as Bucket[])
    .filter(k => buckets[k].length > 0)
    .map(k => ({ key: k, title: BUCKET_LABEL[k], data: buckets[k] }));

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.accent} /></View>;
  }

  const totalToday = buckets.today.length;

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>{totalToday > 0 ? "TODAY'S WORK" : 'UPCOMING'}</Text>
        <Text style={styles.heroTitle}>
          {totalToday === 0
            ? 'Nothing scheduled for today'
            : totalToday === 1
              ? '1 job on the books'
              : `${totalToday} jobs on the books`}
        </Text>
        <Text style={styles.heroBody}>
          {totalToday > 0
            ? 'Tap any card to open the workflow and check in.'
            : 'Check back later or swipe down to refresh.'}
        </Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={j => j.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.accent} />}
        ListEmptyComponent={
          <View style={{ padding: 32, alignItems: 'center' }}>
            <Text style={styles.empty}>No jobs assigned yet.</Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>{section.title}</Text>
            <Text style={styles.sectionCount}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const meta = statusMeta(item.status);
          const color = theme[meta.tone];
          return (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => router.push({ pathname: '/(crew)/job/[id]', params: { id: item.id } } as any)}
              style={styles.jobCard}
            >
              <View style={[styles.dateTag, { backgroundColor: color + '1f', borderColor: color + '55' }]}>
                <Ionicons name={meta.icon} size={13} color={color} />
                <Text style={[styles.dateTagText, { color }]}>{prettyDate(item.scheduled_date)}</Text>
              </View>
              <View style={{ marginTop: 6 }}>
                <Text style={styles.jobName} numberOfLines={1}>{item.name}</Text>
                {item.address ? <Text style={styles.jobAddress} numberOfLines={1}>{item.address}</Text> : null}
              </View>
              <View style={styles.jobFoot}>
                <Text style={[styles.statusTag, { color }]}>{meta.label}</Text>
                <Text style={styles.chev}>›</Text>
              </View>
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

    hero: {
      backgroundColor: t.surface, borderBottomWidth: 1, borderBottomColor: t.border,
      paddingHorizontal: 20, paddingVertical: 16,
    },
    heroLabel: { color: t.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
    heroTitle: { color: t.textPrimary, fontSize: 20, fontWeight: '800', marginTop: 4 },
    heroBody: { color: t.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 4 },

    sectionHeaderRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 10, marginTop: 4,
    },
    sectionHeader: { color: t.textPrimary, fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
    sectionCount: { color: t.textMuted, fontSize: 12, fontWeight: '700' },

    jobCard: {
      backgroundColor: t.surface, borderRadius: 14,
      borderWidth: 1, borderColor: t.border,
      padding: 14, marginBottom: 10,
    },
    dateTag: {
      alignSelf: 'flex-start',
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderWidth: 1, borderRadius: 10,
      paddingVertical: 4, paddingHorizontal: 8,
    },
    dateTagText: { fontSize: 12, fontWeight: '700' },
    jobName: { color: t.textPrimary, fontSize: 16, fontWeight: '700' },
    jobAddress: { color: t.textSecondary, fontSize: 13, marginTop: 2 },
    jobFoot: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginTop: 10,
    },
    statusTag: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
    chev: { color: t.textMuted, fontSize: 22 },

    empty: { color: t.textMuted, fontSize: 14, textAlign: 'center' },
  });
}
