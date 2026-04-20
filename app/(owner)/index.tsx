import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl, TouchableOpacity
} from 'react-native';
import { mobileGet } from '../../lib/mobileApi';
import { router } from 'expo-router';

interface Stats {
  activeJobs: number;
  crewOnSite: number;
  pendingSupplies: number;
  bottlenecksToday: number;
  jobBreakdown: { id: string; name: string; crew: number; pendingSupplies: number }[];
}

interface Financials {
  revenueMtd: number;
  outstanding: number;
  collected: number;
  paidThisWeek: number;
}

export default function OwnerOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [financials, setFinancials] = useState<Financials | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  useEffect(() => { loadData(); }, [loadData]);

  const safe: Stats = stats || { activeJobs: 0, crewOnSite: 0, pendingSupplies: 0, bottlenecksToday: 0, jobBreakdown: [] };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading || refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#0ea5e9" />}
    >
      <Text style={styles.sectionLabel}>Today's Summary</Text>
      <View style={styles.statsGrid}>
        <StatCard value={safe.activeJobs} label="Active Jobs" color="#3b82f6" onPress={() => router.push('/(owner)/dashboard' as any)} />
        <StatCard value={safe.crewOnSite} label="Crew On Site" color="#4ade80" onPress={() => router.push('/(owner)/dashboard' as any)} />
        <StatCard value={safe.pendingSupplies} label="Pending Supplies" color="#0ea5e9" onPress={() => router.push('/(owner)/supplies' as any)} />
        <StatCard value={safe.bottlenecksToday} label="Bottlenecks Today" color="#ef4444" onPress={() => router.push('/(owner)/dashboard' as any)} />
      </View>

      {financials && (
        <>
          <Text style={styles.sectionLabel}>Financials</Text>
          <View style={styles.statsGrid}>
            <MoneyCard value={financials.revenueMtd} label="Revenue MTD" color="#4ade80" onPress={() => router.push('/(owner)/invoices' as any)} />
            <MoneyCard value={financials.outstanding} label="Outstanding" color="#facc15" onPress={() => router.push('/(owner)/invoices' as any)} />
            <MoneyCard value={financials.paidThisWeek} label="Paid 7d" color="#0ea5e9" onPress={() => router.push('/(owner)/invoices' as any)} />
            <MoneyCard value={financials.collected} label="Lifetime" color="#8b5cf6" onPress={() => router.push('/(owner)/invoices' as any)} />
          </View>
        </>
      )}

      <Text style={styles.sectionLabel}>Job Breakdown</Text>
      {safe.jobBreakdown.length === 0 && !loading ? (
        <Text style={{ color: '#555', paddingVertical: 12 }}>No active jobs.</Text>
      ) : (
        safe.jobBreakdown.map((job, i) => (
          <TouchableOpacity key={job.id || i} style={styles.jobRow} onPress={() => router.push('/(owner)/dashboard' as any)}>
            <Text style={styles.jobName}>{job.name}</Text>
            <View style={styles.jobBadges}>
              <Text style={styles.crewBadge}>👷 {job.crew}</Text>
              {job.pendingSupplies > 0 && <Text style={styles.supplyBadge}>📦 {job.pendingSupplies}</Text>}
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

function StatCard({ value, label, color, onPress }: { value: number; label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.statCard, { borderColor: color + '44' }]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function MoneyCard({ value, label, color, onPress }: { value: number; label: string; color: string; onPress: () => void }) {
  const short = value >= 1_000_000
    ? `$${(value / 1_000_000).toFixed(1)}M`
    : value >= 10_000
      ? `$${(value / 1000).toFixed(0)}k`
      : value >= 1000
        ? `$${(value / 1000).toFixed(1)}k`
        : `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return (
    <TouchableOpacity style={[styles.statCard, { borderColor: color + '44' }]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.moneyValue, { color }]}>{short}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  content: { padding: 16, gap: 10 },
  sectionLabel: { color: '#888', fontSize: 13, fontWeight: '600', marginTop: 8 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    flex: 1, minWidth: '45%', backgroundColor: '#1a1a1a',
    borderRadius: 14, padding: 16, borderWidth: 1, alignItems: 'center',
  },
  statValue: { fontSize: 36, fontWeight: '800' },
  moneyValue: { fontSize: 26, fontWeight: '800' },
  statLabel: { color: '#666', fontSize: 12, marginTop: 4, textAlign: 'center' },
  jobRow: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a',
  },
  jobName: { color: '#fff', fontSize: 14, fontWeight: '600', flex: 1 },
  jobBadges: { flexDirection: 'row', gap: 8 },
  crewBadge: { color: '#4ade80', fontSize: 13, fontWeight: '600' },
  supplyBadge: { color: '#0ea5e9', fontSize: 13, fontWeight: '600' },
});
