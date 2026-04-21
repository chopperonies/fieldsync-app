import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, FlatList, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { mobileGet } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';

type Client = { id: string; name: string; company?: string | null; email?: string | null; phone?: string | null };
type JobHit = {
  id: string;
  name: string;
  address?: string | null;
  status: string;
  invoice_amount?: number | null;
  payment_status?: string | null;
  clients?: { name: string } | null;
};
type InvoiceHit = JobHit & { updated_at?: string | null; clients?: { name: string; email?: string | null } | null };

type Kind = 'all' | 'clients' | 'jobs' | 'invoices';

export default function OwnerSearch() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [jobs, setJobs] = useState<JobHit[]>([]);
  const [invoices, setInvoices] = useState<InvoiceHit[]>([]);
  const [recentClients, setRecentClients] = useState<Client[]>([]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async (query: string, type: Kind) => {
    if (!query.trim()) {
      setClients([]); setJobs([]); setInvoices([]);
      return;
    }
    setLoading(true);
    try {
      const data = await mobileGet<{ clients: Client[]; jobs: JobHit[]; invoices: InvoiceHit[] }>(
        `/api/mobile/owner/search?q=${encodeURIComponent(query)}&type=${type}`
      );
      setClients(data?.clients || []);
      setJobs(data?.jobs || []);
      setInvoices(data?.invoices || []);
    } catch {
      setClients([]); setJobs([]); setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) { setClients([]); setJobs([]); setInvoices([]); return; }
    timer.current = setTimeout(() => run(q, kind), 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, kind, run]);

  // Recently active: fetch on mount.
  useEffect(() => {
    (async () => {
      try {
        const c = await mobileGet<Client[]>('/api/mobile/owner/clients');
        setRecentClients((c || []).slice(0, 6));
      } catch {
        setRecentClients([]);
      }
    })();
  }, []);

  const showEmpty = !q.trim();

  return (
    <View style={styles.container}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={theme.textSecondary} />
        <TextInput
          style={styles.input}
          placeholder="Search clients, jobs, invoices…"
          placeholderTextColor={theme.textMuted}
          value={q}
          onChangeText={setQ}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
        />
        {q.length > 0 && (
          <TouchableOpacity onPress={() => setQ('')}>
            <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.chips}>
        {(['all', 'clients', 'jobs', 'invoices'] as Kind[]).map(k => (
          <TouchableOpacity
            key={k}
            style={[styles.chip, kind === k && styles.chipActive]}
            onPress={() => setKind(k)}
          >
            <Text style={[styles.chipText, kind === k && styles.chipTextActive]}>
              {k === 'all' ? 'All' : k.charAt(0).toUpperCase() + k.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && <ActivityIndicator color={theme.accent} style={{ marginTop: 16 }} />}

      {showEmpty ? (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Text style={styles.sectionLabel}>Quick jump</Text>
          <View style={styles.shortcutGrid}>
            <Shortcut theme={theme} styles={styles} icon="calendar-outline" label="Today's schedule" color={theme.info}
              onPress={() => router.push(`/(owner)/jobs?day=${new Date().toISOString().slice(0, 10)}` as any)} />
            <Shortcut theme={theme} styles={styles} icon="cash-outline" label="Unpaid invoices" color={theme.warning}
              onPress={() => router.push('/(owner)/invoices?open=record_payment' as any)} />
            <Shortcut theme={theme} styles={styles} icon="location-outline" label="On-site crew" color={theme.success}
              onPress={() => router.push('/(owner)/crew' as any)} />
            <Shortcut theme={theme} styles={styles} icon="cube-outline" label="Pending supplies" color={theme.stagePurple}
              onPress={() => router.push('/(owner)/supplies' as any)} />
          </View>
          <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Recent clients</Text>
          {recentClients.length === 0 ? (
            <Text style={styles.empty}>Nothing yet. Clients you create show up here.</Text>
          ) : (
            recentClients.map(c => <ClientRow key={c.id} theme={theme} styles={styles} c={c} />)
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={[]}
          renderItem={null as any}
          ListHeaderComponent={
            <View style={{ padding: 16 }}>
              {(kind === 'all' || kind === 'clients') && clients.length > 0 && (
                <Section styles={styles} label="Clients">
                  {clients.map(c => <ClientRow key={c.id} theme={theme} styles={styles} c={c} />)}
                </Section>
              )}
              {(kind === 'all' || kind === 'jobs') && jobs.length > 0 && (
                <Section styles={styles} label="Jobs">
                  {jobs.map(j => <JobRow key={j.id} theme={theme} styles={styles} j={j} />)}
                </Section>
              )}
              {(kind === 'all' || kind === 'invoices') && invoices.length > 0 && (
                <Section styles={styles} label="Invoices">
                  {invoices.map(inv => <InvoiceRow key={inv.id} theme={theme} styles={styles} inv={inv} />)}
                </Section>
              )}
              {!loading && q.trim() && clients.length + jobs.length + invoices.length === 0 && (
                <Text style={styles.empty}>No matches for "{q}".</Text>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}

function Section({ styles, label, children }: { styles: any; label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Shortcut({ theme, styles, icon, label, color, onPress }: { theme: Theme; styles: any; icon: any; label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.shortcut} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.shortcutIcon, { backgroundColor: color + '22', borderColor: color + '55' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.shortcutLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function ClientRow({ theme, styles, c }: { theme: Theme; styles: any; c: Client }) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push('/(owner)/clients' as any)}
      activeOpacity={0.75}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{c.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{c.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {[c.company, c.email].filter(Boolean).join(' · ') || c.phone || 'Client'}
        </Text>
      </View>
      {c.phone && (
        <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); Linking.openURL(`tel:${c.phone}`); }} style={{ padding: 8 }}>
          <Ionicons name="call-outline" size={18} color={theme.accent} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

function JobRow({ theme, styles, j }: { theme: Theme; styles: any; j: JobHit }) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push('/(owner)/jobs' as any)}
      activeOpacity={0.75}
    >
      <View style={[styles.avatar, { backgroundColor: theme.accentMuted }]}>
        <Ionicons name="hammer-outline" size={18} color={theme.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{j.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {j.address || j.clients?.name || j.status}
        </Text>
      </View>
      {Number(j.invoice_amount || 0) > 0 && (
        <Text style={styles.rowMeta}>${Number(j.invoice_amount).toLocaleString()}</Text>
      )}
    </TouchableOpacity>
  );
}

function InvoiceRow({ theme, styles, inv }: { theme: Theme; styles: any; inv: InvoiceHit }) {
  const paid = String(inv.payment_status || '').toLowerCase() === 'paid';
  const statusColor = paid ? theme.success : theme.warning;
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push('/(owner)/invoices' as any)}
      activeOpacity={0.75}
    >
      <View style={[styles.avatar, { backgroundColor: statusColor + '22' }]}>
        <Ionicons name="document-text-outline" size={18} color={statusColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{inv.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {inv.clients?.name || 'Unknown client'} · {paid ? 'Paid' : 'Unpaid'}
        </Text>
      </View>
      <Text style={[styles.rowMeta, { color: statusColor }]}>
        ${Number(inv.invoice_amount || 0).toLocaleString()}
      </Text>
    </TouchableOpacity>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },

    searchBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      margin: 16, marginBottom: 8,
      backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8,
    },
    input: { flex: 1, color: t.textPrimary, fontSize: 15, paddingVertical: 4 },

    chips: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 10, flexWrap: 'wrap' },
    chip: {
      borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14,
      borderWidth: 1, borderColor: t.border, backgroundColor: t.surface,
    },
    chipActive: { backgroundColor: t.accentMuted, borderColor: t.accent },
    chipText: { color: t.textSecondary, fontSize: 12, fontWeight: '700' },
    chipTextActive: { color: t.accent },

    sectionLabel: { color: t.textPrimary, fontSize: 13, fontWeight: '800', marginBottom: 8, marginTop: 2 },
    empty: { color: t.textMuted, fontSize: 13, marginTop: 14 },

    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
      borderRadius: 12, padding: 12, marginBottom: 8,
    },
    avatar: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: t.stagePurple + '22', alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { color: t.stagePurple, fontSize: 14, fontWeight: '800' },
    rowTitle: { color: t.textPrimary, fontSize: 14, fontWeight: '700' },
    rowSub: { color: t.textSecondary, fontSize: 12, marginTop: 2 },
    rowMeta: { color: t.textPrimary, fontSize: 13, fontWeight: '700' },

    shortcutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    shortcut: {
      width: '48%',
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
      borderRadius: 12, padding: 12,
    },
    shortcutIcon: {
      width: 36, height: 36, borderRadius: 10, borderWidth: 1,
      alignItems: 'center', justifyContent: 'center',
    },
    shortcutLabel: { color: t.textPrimary, fontSize: 13, fontWeight: '700', flex: 1 },
  });
}

