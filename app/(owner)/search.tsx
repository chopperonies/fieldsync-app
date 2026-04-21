import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { mobileGet } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import { Pill, PillRow, Row, RowAvatar, SectionHeader, Divider } from '../../components/Flat';

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

  const placeholder = (() => {
    switch (kind) {
      case 'clients':  return 'Search clients';
      case 'jobs':     return 'Search jobs';
      case 'invoices': return 'Search invoices';
      default:         return 'Search';
    }
  })();

  const showEmpty = !q.trim();
  const totalHits = clients.length + jobs.length + invoices.length;

  return (
    <View style={styles.container}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={theme.textSecondary} />
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          value={q}
          onChangeText={setQ}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {q.length > 0 && (
          <TouchableOpacity onPress={() => setQ('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <PillRow>
        <Pill label="All"      active={kind === 'all'}      onPress={() => setKind('all')} />
        <Pill label="Clients"  active={kind === 'clients'}  onPress={() => setKind('clients')}  icon="person-outline"         showIcon="active-only" tint={theme.stagePurple} />
        <Pill label="Jobs"     active={kind === 'jobs'}     onPress={() => setKind('jobs')}     icon="hammer-outline"         showIcon="active-only" tint={theme.accent} />
        <Pill label="Invoices" active={kind === 'invoices'} onPress={() => setKind('invoices')} icon="document-text-outline"  showIcon="active-only" tint={theme.warning} />
      </PillRow>

      {loading && <ActivityIndicator color={theme.accent} style={{ marginTop: 16 }} />}

      {showEmpty ? (
        <ScrollView>
          {recentClients.length > 0 && (
            <>
              <SectionHeader label="Recently active" />
              {recentClients.map((c, i) => (
                <View key={c.id}>
                  {i > 0 ? <Divider inset={64} /> : null}
                  <ClientRow theme={theme} c={c} />
                </View>
              ))}
            </>
          )}
          {recentClients.length === 0 && (
            <View style={{ alignItems: 'center', marginTop: 80, paddingHorizontal: 32 }}>
              <Text style={styles.emptyTitle}>Find anything</Text>
              <Text style={styles.emptySub}>Search clients, jobs, and invoices.</Text>
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
          {(kind === 'all' || kind === 'clients') && clients.length > 0 && (
            <>
              <SectionHeader label="Clients" hint={`${clients.length}`} />
              {clients.map((c, i) => (
                <View key={c.id}>
                  {i > 0 ? <Divider inset={64} /> : null}
                  <ClientRow theme={theme} c={c} />
                </View>
              ))}
            </>
          )}
          {(kind === 'all' || kind === 'jobs') && jobs.length > 0 && (
            <>
              <SectionHeader label="Jobs" hint={`${jobs.length}`} />
              {jobs.map((j, i) => (
                <View key={j.id}>
                  {i > 0 ? <Divider inset={64} /> : null}
                  <JobRow theme={theme} j={j} />
                </View>
              ))}
            </>
          )}
          {(kind === 'all' || kind === 'invoices') && invoices.length > 0 && (
            <>
              <SectionHeader label="Invoices" hint={`${invoices.length}`} />
              {invoices.map((inv, i) => (
                <View key={inv.id}>
                  {i > 0 ? <Divider inset={64} /> : null}
                  <InvoiceRow theme={theme} inv={inv} />
                </View>
              ))}
            </>
          )}
          {!loading && q.trim() && totalHits === 0 && (
            <View style={{ alignItems: 'center', marginTop: 80, paddingHorizontal: 32 }}>
              <Text style={styles.emptyTitle}>No matches</Text>
              <Text style={styles.emptySub}>Nothing found for "{q}".</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function ClientRow({ theme, c }: { theme: Theme; c: Client }) {
  return (
    <Row
      leading={<RowAvatar letter={c.name.charAt(0).toUpperCase()} tint={theme.stagePurple} />}
      title={c.name}
      subtitle={[c.company, c.email].filter(Boolean).join(' · ') || c.phone || 'Client'}
      trailing={
        c.phone ? (
          <TouchableOpacity onPress={() => Linking.openURL(`tel:${c.phone}`)} hitSlop={8}>
            <Ionicons name="call-outline" size={18} color={theme.accent} />
          </TouchableOpacity>
        ) : null
      }
      onPress={() => router.push('/(owner)/clients' as any)}
    />
  );
}

function JobRow({ theme, j }: { theme: Theme; j: JobHit }) {
  return (
    <Row
      leading={<RowAvatar icon="hammer-outline" tint={theme.accent} />}
      title={j.name}
      subtitle={j.address || j.clients?.name || j.status}
      trailing={Number(j.invoice_amount || 0) > 0 ? (
        <Text style={{ color: theme.textPrimary, fontSize: 13, fontWeight: '700' }}>
          ${Number(j.invoice_amount).toLocaleString()}
        </Text>
      ) : null}
      onPress={() => router.push({ pathname: '/(owner)/job/[id]', params: { id: j.id } } as any)}
    />
  );
}

function InvoiceRow({ theme, inv }: { theme: Theme; inv: InvoiceHit }) {
  const paid = String(inv.payment_status || '').toLowerCase() === 'paid';
  const statusColor = paid ? theme.success : theme.warning;
  return (
    <Row
      leading={<RowAvatar icon="document-text-outline" tint={statusColor} />}
      title={inv.name}
      subtitle={`${inv.clients?.name || 'Unknown client'} · ${paid ? 'Paid' : 'Unpaid'}`}
      trailing={
        <Text style={{ color: statusColor, fontSize: 13, fontWeight: '700' }}>
          ${Number(inv.invoice_amount || 0).toLocaleString()}
        </Text>
      }
      onPress={() => router.push('/(owner)/invoices' as any)}
    />
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },

    searchBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 16, marginTop: 12,
      backgroundColor: t.surfaceInset,
      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    },
    input: { flex: 1, color: t.textPrimary, fontSize: 15, paddingVertical: 0 },

    emptyTitle: { color: t.textPrimary, fontSize: 18, fontWeight: '800', marginBottom: 6 },
    emptySub: { color: t.textMuted, fontSize: 14, textAlign: 'center' },
  });
}
