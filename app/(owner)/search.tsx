import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Linking, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { mobileGet } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import { Pill, PillRow, Row, RowAvatar, SectionHeader, Divider } from '../../components/Flat';

type Kind = 'clients' | 'quotes' | 'estimates' | 'jobs' | 'invoices';

type Client = { id: string; name: string; company?: string | null; email?: string | null; phone?: string | null };
type QuoteRow = {
  id: string; name: string; frequency?: string | null;
  price?: number | null; next_due?: string | null; status?: string | null;
  clients?: { name: string } | null;
};
type JobHit = {
  id: string; name: string; address?: string | null; status: string;
  invoice_amount?: number | null; payment_status?: string | null;
  scheduled_date?: string | null; clients?: { name: string } | null;
};

type SearchResponse = {
  clients: Client[];
  quotes: QuoteRow[];
  estimates: JobHit[];
  jobs: JobHit[];
  invoices: JobHit[];
};

const PILLS: Array<{ kind: Kind; label: string; icon: keyof typeof import('@expo/vector-icons/build/Ionicons').default.glyphMap; tintKey: keyof Theme; createLabel: string; createFn: () => void }> = [
  {
    kind: 'clients', label: 'Clients', icon: 'person-outline',
    tintKey: 'stagePurple', createLabel: 'Create client',
    createFn: () => router.push('/(owner)/clients?open=new' as any),
  },
  {
    kind: 'quotes', label: 'Quotes', icon: 'pricetag-outline',
    tintKey: 'stageIndigo', createLabel: 'Create quote',
    createFn: () => router.push('/(owner)/jobs?open=new_quote' as any),
  },
  {
    kind: 'estimates', label: 'Estimates', icon: 'document-text-outline',
    tintKey: 'stageCyan', createLabel: 'Create estimate',
    createFn: () => router.push('/(owner)/jobs?open=new_quote' as any),
  },
  {
    kind: 'jobs', label: 'Jobs', icon: 'hammer-outline',
    tintKey: 'stageGreen', createLabel: 'Create job',
    createFn: () => router.push('/(owner)/jobs?open=new' as any),
  },
  {
    kind: 'invoices', label: 'Invoices', icon: 'cash-outline',
    tintKey: 'stageAmber', createLabel: 'Create invoice',
    createFn: () => router.push('/(owner)/invoices?open=quick_invoice' as any),
  },
];

export default function OwnerSearch() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('clients');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchResponse>({ clients: [], quotes: [], estimates: [], jobs: [], invoices: [] });

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async (query: string, type: Kind) => {
    setLoading(true);
    try {
      const res = await mobileGet<SearchResponse>(
        `/api/mobile/owner/search?q=${encodeURIComponent(query)}&type=${type}`
      );
      setData({
        clients: res?.clients || [],
        quotes: res?.quotes || [],
        estimates: res?.estimates || [],
        jobs: res?.jobs || [],
        invoices: res?.invoices || [],
      });
    } catch {
      setData({ clients: [], quotes: [], estimates: [], jobs: [], invoices: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => run(q, kind), q ? 250 : 0);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, kind, run]);

  const active = PILLS.find(p => p.kind === kind)!;
  const activeTint = (theme as any)[active.tintKey] as string;

  const placeholder = (() => {
    switch (kind) {
      case 'clients':   return 'Search clients';
      case 'quotes':    return 'Search quotes';
      case 'estimates': return 'Search estimates';
      case 'jobs':      return 'Search jobs';
      case 'invoices':  return 'Search invoices';
    }
  })();

  const list = data[kind];
  const total = list.length;

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
        {PILLS.map(p => (
          <Pill
            key={p.kind}
            label={p.label}
            active={kind === p.kind}
            onPress={() => setKind(p.kind)}
            icon={p.icon}
            showIcon="active-only"
            tint={(theme as any)[p.tintKey]}
          />
        ))}
      </PillRow>

      <TouchableOpacity style={styles.createBar} onPress={active.createFn} activeOpacity={0.7}>
        <View style={[styles.createIcon, { backgroundColor: activeTint + '22' }]}>
          <Ionicons name="add" size={18} color={activeTint} />
        </View>
        <Text style={[styles.createText, { color: activeTint }]}>{active.createLabel}</Text>
      </TouchableOpacity>

      {loading && total === 0 ? (
        <View style={{ paddingVertical: 30, alignItems: 'center' }}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : null}

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {total > 0 ? (
          <SectionHeader
            label={active.label}
            hint={`${total}${total === 50 ? '+' : ''}`}
          />
        ) : null}

        {kind === 'clients' && data.clients.map((c, i) => (
          <View key={c.id}>
            {i > 0 ? <Divider inset={64} /> : null}
            <ClientRow theme={theme} c={c} />
          </View>
        ))}
        {kind === 'quotes' && data.quotes.map((r, i) => (
          <View key={r.id}>
            {i > 0 ? <Divider inset={64} /> : null}
            <QuoteRowView theme={theme} r={r} />
          </View>
        ))}
        {kind === 'estimates' && data.estimates.map((j, i) => (
          <View key={j.id}>
            {i > 0 ? <Divider inset={64} /> : null}
            <EstimateRow theme={theme} j={j} />
          </View>
        ))}
        {kind === 'jobs' && data.jobs.map((j, i) => (
          <View key={j.id}>
            {i > 0 ? <Divider inset={64} /> : null}
            <JobRow theme={theme} j={j} />
          </View>
        ))}
        {kind === 'invoices' && data.invoices.map((inv, i) => (
          <View key={inv.id}>
            {i > 0 ? <Divider inset={64} /> : null}
            <InvoiceRow theme={theme} inv={inv} />
          </View>
        ))}

        {!loading && total === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>
              {q.trim() ? `No ${active.label.toLowerCase()} for "${q}"` : `No ${active.label.toLowerCase()} yet`}
            </Text>
            <Text style={styles.emptySub}>Tap "{active.createLabel}" above to add the first one.</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function ClientRow({ theme, c }: { theme: Theme; c: Client }) {
  return (
    <Row
      leading={<RowAvatar letter={c.name.charAt(0).toUpperCase()} tint={theme.stagePurple} />}
      title={c.name}
      subtitle={[(c as any).company, c.email].filter(Boolean).join(' · ') || c.phone || 'Client'}
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

function QuoteRowView({ theme, r }: { theme: Theme; r: QuoteRow }) {
  return (
    <Row
      leading={<RowAvatar icon="pricetag-outline" tint={theme.stageIndigo} />}
      title={r.name}
      subtitle={[
        r.clients?.name,
        r.frequency ? `every ${r.frequency}` : null,
        r.next_due ? `next ${r.next_due}` : null,
      ].filter(Boolean).join(' · ') || 'Service agreement'}
      trailing={Number(r.price || 0) > 0 ? (
        <Text style={{ color: theme.textPrimary, fontSize: 13, fontWeight: '700' }}>
          ${Number(r.price).toLocaleString()}
        </Text>
      ) : null}
      onPress={() => Alert.alert('Service agreement', 'Mobile edit is on the roadmap.')}
    />
  );
}

function EstimateRow({ theme, j }: { theme: Theme; j: JobHit }) {
  return (
    <Row
      leading={<RowAvatar icon="document-text-outline" tint={theme.stageCyan} />}
      title={j.name}
      subtitle={[j.clients?.name, j.address].filter(Boolean).join(' · ') || j.status}
      trailing={Number(j.invoice_amount || 0) > 0 ? (
        <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700' }}>
          ${Number(j.invoice_amount).toLocaleString()}
        </Text>
      ) : null}
      onPress={() => router.push({ pathname: '/(owner)/job/[id]', params: { id: j.id } } as any)}
    />
  );
}

function JobRow({ theme, j }: { theme: Theme; j: JobHit }) {
  return (
    <Row
      leading={<RowAvatar icon="hammer-outline" tint={theme.stageGreen} />}
      title={j.name}
      subtitle={[j.clients?.name, j.address || j.status].filter(Boolean).join(' · ')}
      trailing={j.scheduled_date ? (
        <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700' }}>{j.scheduled_date}</Text>
      ) : null}
      onPress={() => router.push({ pathname: '/(owner)/job/[id]', params: { id: j.id } } as any)}
    />
  );
}

function InvoiceRow({ theme, inv }: { theme: Theme; inv: JobHit }) {
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

    createBar: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 16, paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border,
    },
    createIcon: {
      width: 28, height: 28, borderRadius: 14,
      alignItems: 'center', justifyContent: 'center',
    },
    createText: { fontSize: 14, fontWeight: '800' },

    emptyWrap: { paddingTop: 60, paddingHorizontal: 32, alignItems: 'center' },
    emptyTitle: { color: t.textPrimary, fontSize: 16, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
    emptySub: { color: t.textMuted, fontSize: 13, textAlign: 'center' },
  });
}
