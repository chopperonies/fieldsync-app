import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl, TouchableOpacity
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mobileGet } from '../../lib/mobileApi';
import { router } from 'expo-router';
import { getUser } from '../../lib/storage';

type HomeJob = {
  id: string;
  name: string;
  address?: string | null;
  status: string;
  updated_at?: string | null;
  client_name?: string | null;
  crew: string[];
  pendingSupplies: number;
  stage_name?: string | null;
  stage_color?: string | null;
};

interface Stats {
  activeJobs: number;
  crewOnSite: number;
  pendingSupplies: number;
  bottlenecksToday: number;
  todayJobs?: HomeJob[];
  stuckJobs?: HomeJob[];
  jobBreakdown: { id: string; name: string; crew: number; pendingSupplies: number }[];
}

interface Financials {
  revenueMtd: number;
  outstanding: number;
  collected: number;
  paidThisWeek: number;
}

function shortMoney(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `$${(value / 1000).toFixed(0)}k`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function OwnerOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [financials, setFinancials] = useState<Financials | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [s, f] = await Promise.all([
        mobileGet<Stats>('/api/mobile/owner/home'),
        mobileGet<Financials>('/api/mobile/owner/financials').catch(() => null),
      ]);
      setStats(s);
      if (f) setFinancials(f);
    } catch (e) {
      // Keep last-good on failure
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    getUser().then(u => {
      if (u?.name) setFirstName(String(u.name).split(' ')[0] || null);
    });
  }, [loadData]);

  const safe: Stats = stats || {
    activeJobs: 0, crewOnSite: 0, pendingSupplies: 0, bottlenecksToday: 0,
    jobBreakdown: [], todayJobs: [], stuckJobs: [],
  };
  const today = new Date();
  const todayLabel = today.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const greeting = (() => {
    const h = today.getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading || refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#0ea5e9" />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.greeting}>{greeting}{firstName ? `, ${firstName}` : ''}</Text>
        <Text style={styles.date}>{todayLabel}</Text>
      </View>

      {/* Compact KPI strip — 4 across, small */}
      <View style={styles.kpiStrip}>
        <KpiCell
          value={String(safe.activeJobs)}
          label="Active"
          color="#3b82f6"
          onPress={() => router.push('/(owner)/jobs' as any)}
        />
        <KpiCell
          value={String(safe.crewOnSite)}
          label="On site"
          color="#4ade80"
          onPress={() => router.push('/(owner)/crew' as any)}
        />
        <KpiCell
          value={financials ? shortMoney(financials.revenueMtd) : '—'}
          label="MTD"
          color="#4ade80"
          onPress={() => router.push('/(owner)/invoices' as any)}
        />
        <KpiCell
          value={financials ? shortMoney(financials.outstanding) : '—'}
          label="Unpaid"
          color="#facc15"
          onPress={() => router.push('/(owner)/invoices?open=record_payment' as any)}
        />
      </View>

      {/* Needs attention — stuck jobs */}
      {safe.stuckJobs && safe.stuckJobs.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>
            <Ionicons name="warning-outline" size={14} color="#f59e0b" /> Needs attention
          </Text>
          {safe.stuckJobs.slice(0, 4).map(j => (
            <TouchableOpacity
              key={j.id}
              style={[styles.stuckRow]}
              onPress={() => router.push('/(owner)/jobs' as any)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.jobName}>{j.name}</Text>
                <Text style={styles.stuckMeta}>
                  No activity in {j.updated_at ? timeAgo(j.updated_at) : '24h+'}
                  {j.stage_name ? ` · ${j.stage_name}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#555" />
            </TouchableOpacity>
          ))}
        </>
      )}

      {/* Today — active jobs */}
      <Text style={styles.sectionLabel}>Today</Text>
      {(safe.todayJobs?.length ?? 0) === 0 && !loading ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No active jobs right now.</Text>
          <TouchableOpacity onPress={() => router.push('/(owner)/jobs?open=new' as any)}>
            <Text style={styles.emptyAction}>Create a job →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        safe.todayJobs!.map(j => (
          <TouchableOpacity
            key={j.id}
            style={styles.jobCard}
            onPress={() => router.push('/(owner)/jobs' as any)}
            activeOpacity={0.75}
          >
            <View style={styles.jobTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.jobName}>{j.name}</Text>
                {j.client_name ? <Text style={styles.clientLine}>{j.client_name}</Text> : null}
              </View>
              {j.stage_name && (
                <View style={[styles.stagePill, { borderColor: (j.stage_color || '#0ea5e9') + '55', backgroundColor: (j.stage_color || '#0ea5e9') + '22' }]}>
                  <Text style={[styles.stagePillText, { color: j.stage_color || '#0ea5e9' }]}>{j.stage_name}</Text>
                </View>
              )}
            </View>
            <View style={styles.jobMeta}>
              <View style={styles.metaChip}>
                <Ionicons name="people-outline" size={12} color="#888" />
                <Text style={styles.metaChipText}>
                  {j.crew.length > 0 ? j.crew.slice(0, 2).join(', ') + (j.crew.length > 2 ? ` +${j.crew.length - 2}` : '') : 'Unassigned'}
                </Text>
              </View>
              {j.pendingSupplies > 0 && (
                <View style={styles.metaChip}>
                  <Ionicons name="cube-outline" size={12} color="#0ea5e9" />
                  <Text style={[styles.metaChipText, { color: '#0ea5e9' }]}>{j.pendingSupplies} supplies</Text>
                </View>
              )}
              {j.updated_at && (
                <Text style={styles.metaTime}>{timeAgo(j.updated_at)} ago</Text>
              )}
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

function KpiCell({ value, label, color, onPress }: { value: string; label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.kpiCell} activeOpacity={0.7} onPress={onPress}>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 16, gap: 12, paddingBottom: 120 },

  header: { marginBottom: 2 },
  greeting: { color: '#fff', fontSize: 22, fontWeight: '800' },
  date: { color: '#666', fontSize: 13, marginTop: 2 },

  kpiStrip: {
    flexDirection: 'row', gap: 8, marginBottom: 4,
  },
  kpiCell: {
    flex: 1, backgroundColor: '#111', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 8,
    alignItems: 'center', borderWidth: 1, borderColor: '#1e1e1e',
  },
  kpiValue: { fontSize: 18, fontWeight: '800', lineHeight: 22 },
  kpiLabel: { color: '#777', fontSize: 11, marginTop: 4, fontWeight: '600' },

  sectionLabel: { color: '#bbb', fontSize: 13, fontWeight: '700', marginTop: 10, marginBottom: 2 },

  stuckRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#1a1006', borderWidth: 1, borderColor: '#f59e0b55',
    borderRadius: 12, padding: 12,
  },
  stuckMeta: { color: '#fbbf24', fontSize: 12, marginTop: 2 },

  jobCard: {
    backgroundColor: '#111', borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: '#1e1e1e',
  },
  jobTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  jobName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  clientLine: { color: '#888', fontSize: 12, marginTop: 2 },
  stagePill: {
    borderWidth: 1, borderRadius: 14, paddingVertical: 3, paddingHorizontal: 10,
  },
  stagePillText: { fontSize: 11, fontWeight: '700' },
  jobMeta: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10,
    flexWrap: 'wrap',
  },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaChipText: { color: '#888', fontSize: 12, fontWeight: '600' },
  metaTime: { color: '#555', fontSize: 11, marginLeft: 'auto' },

  emptyCard: {
    backgroundColor: '#111', borderRadius: 12, borderWidth: 1, borderColor: '#1e1e1e',
    padding: 18, alignItems: 'center',
  },
  emptyText: { color: '#555', fontSize: 14, marginBottom: 8 },
  emptyAction: { color: '#0ea5e9', fontSize: 13, fontWeight: '700' },
});
