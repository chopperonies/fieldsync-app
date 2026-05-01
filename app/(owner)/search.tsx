import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, BackHandler, ScrollView,
} from 'react-native';
import { callNumber, textNumber } from '../../lib/phone';
import { useRole, canCreateInvoices } from '../../lib/useRole';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { mobileGet } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import { Pill, PillRow, Row, RowAvatar, SectionHeader, Divider } from '../../components/Flat';

type Kind = 'clients' | 'estimates' | 'jobs' | 'invoices' | 'expenses';
type EstimateFilter = 'all' | 'unassigned' | 'awaiting' | 'changes';

type Client = { id: string; name: string; company?: string | null; email?: string | null; phone?: string | null };
type JobHit = {
  id: string; name: string; address?: string | null; status: string;
  invoice_amount?: number | null; payment_status?: string | null;
  scheduled_date?: string | null; clients?: { name: string } | null;
};
type ExpenseRow = {
  id: string; name: string; amount: number; category: string; date: string;
  details?: string | null;
  status?: string | null; receipt_url?: string | null;
  employees?: { name: string } | null; jobs?: { name: string } | null;
};

type SearchResponse = {
  clients: Client[];
  quotes: unknown[];
  estimates: JobHit[];
  jobs: JobHit[];
  invoices: JobHit[];
  expenses: ExpenseRow[];
};

const PILLS: Array<{ kind: Kind; label: string; icon: keyof typeof import('@expo/vector-icons/build/Ionicons').default.glyphMap; tintKey: keyof Theme; createLabel: string; createFn: () => void }> = [
  {
    kind: 'clients', label: 'Clients', icon: 'person-outline',
    tintKey: 'stagePurple', createLabel: 'Create client',
    createFn: () => router.push('/(owner)/clients?open=new' as any),
  },
  {
    kind: 'estimates', label: 'Estimates', icon: 'document-text-outline',
    tintKey: 'stageCyan', createLabel: 'Create estimate',
    createFn: () => router.push('/(owner)/jobs?open=new_estimate' as any),
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
  {
    kind: 'expenses', label: 'Expenses', icon: 'receipt-outline',
    tintKey: 'stageGreen', createLabel: 'Log expense',
    createFn: () => router.push({ pathname: '/(owner)/expense-new', params: { ts: String(Date.now()) } } as any),
  },
];

const ESTIMATE_FILTERS: Array<{ key: EstimateFilter; label: string; icon: keyof typeof import('@expo/vector-icons/build/Ionicons').default.glyphMap }> = [
  { key: 'all', label: 'All', icon: 'albums-outline' },
  { key: 'unassigned', label: 'Unassigned', icon: 'person-add-outline' },
  { key: 'awaiting', label: 'Awaiting response', icon: 'hourglass-outline' },
  { key: 'changes', label: 'Change requested', icon: 'repeat-outline' },
];

export default function OwnerSearch() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const role = useRole();
  const canCreateFinancials = canCreateInvoices(role); // manager+ (invoices)
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('clients');
  const [focusedKind, setFocusedKind] = useState<Kind | null>(null);
  const [estimateFilter, setEstimateFilter] = useState<EstimateFilter>('all');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchResponse>({ clients: [], quotes: [], estimates: [], jobs: [], invoices: [], expenses: [] });

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async (query: string, type: Kind) => {
    setLoading(true);
    try {
      if (type === 'expenses') {
        // Expenses hit their own endpoint (crew sees own, manager sees all).
        const rows = await mobileGet<ExpenseRow[]>('/api/mobile/expenses');
        const q = query.trim().toLowerCase();
        const filtered = q
          ? (rows || []).filter(r =>
              r.name.toLowerCase().includes(q) ||
              (r.category || '').toLowerCase().includes(q) ||
              (r.details || '').toLowerCase().includes(q)
            )
          : (rows || []);
        setData(prev => ({ ...prev, expenses: filtered }));
      } else {
        const res = await mobileGet<SearchResponse>(
          `/api/mobile/owner/search?q=${encodeURIComponent(query)}&type=${type}`
        );
        setData(prev => ({
          ...prev,
          clients: res?.clients || [],
          quotes: res?.quotes || [],
          estimates: res?.estimates || [],
          jobs: res?.jobs || [],
          invoices: res?.invoices || [],
        }));
      }
    } catch {
      setData(prev => ({ ...prev, [type]: [] } as SearchResponse));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => run(q, kind), q ? 250 : 0);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, kind, run]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (focusedKind === 'estimates') {
        setFocusedKind(null);
        setEstimateFilter('all');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [focusedKind]);

  const active = PILLS.find(p => p.kind === kind)!;
  const activeTint = (theme as any)[active.tintKey] as string;

  const placeholder = (() => {
    switch (kind) {
      case 'clients':   return 'Search clients';
      case 'estimates': return 'Search estimates';
      case 'jobs':      return 'Search jobs';
      case 'invoices':  return 'Search invoices';
      case 'expenses':  return 'Search expenses';
    }
  })();

  const list = data[kind];
  const displayList = kind === 'estimates'
    ? data.estimates.filter((item) => {
        const status = String(item.status || '').toLowerCase();
        if (estimateFilter === 'all') return true;
        if (estimateFilter === 'unassigned') return !item.clients?.name;
        if (estimateFilter === 'awaiting') return status === 'quoted' || status === 'quote' || status === 'estimate';
        if (estimateFilter === 'changes') return status.includes('change') || status.includes('revision');
        return true;
      })
    : list;
  const total = displayList.length;

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

      {focusedKind === 'estimates' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.focusPills}>
          <TouchableOpacity
            style={[styles.focusRoot, { backgroundColor: activeTint + '18', borderColor: activeTint + '55' }]}
            onPress={() => {
              setFocusedKind(null);
              setEstimateFilter('all');
            }}
            activeOpacity={0.75}
          >
            <Ionicons name="document-text-outline" size={15} color={activeTint} />
            <Text style={[styles.focusRootText, { color: activeTint }]} numberOfLines={1} allowFontScaling={false}>Estimates</Text>
            <Ionicons name="close" size={14} color={activeTint} />
          </TouchableOpacity>
          {ESTIMATE_FILTERS.map(filter => {
            const selected = estimateFilter === filter.key;
            return (
              <TouchableOpacity
                key={filter.key}
                style={[
                  styles.filterPill,
                  selected
                    ? { backgroundColor: activeTint + '18', borderColor: activeTint + '55' }
                    : { backgroundColor: theme.surfaceInset, borderColor: theme.border },
                ]}
                onPress={() => setEstimateFilter(filter.key)}
                activeOpacity={0.75}
              >
                <Ionicons name={filter.icon} size={14} color={selected ? activeTint : theme.textSecondary} />
                <Text
                  style={[styles.filterPillText, { color: selected ? activeTint : theme.textSecondary }]}
                  numberOfLines={1}
                  allowFontScaling={false}
                >
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : (
        <PillRow>
          {PILLS.map(p => (
            <Pill
              key={p.kind}
              label={p.label}
              active={kind === p.kind}
              onPress={() => {
                setKind(p.kind);
                if (p.kind === 'estimates') setFocusedKind('estimates');
                else setFocusedKind(null);
              }}
              icon={p.icon}
              showIcon="active-only"
              tint={(theme as any)[p.tintKey]}
            />
          ))}
        </PillRow>
      )}

      {(kind !== 'invoices' || canCreateFinancials || !role) ? (
        <TouchableOpacity style={styles.createBar} onPress={active.createFn} activeOpacity={0.7}>
          <View style={[styles.createIcon, { backgroundColor: activeTint + '22' }]}>
            <Ionicons name="add" size={18} color={activeTint} />
          </View>
          <Text style={[styles.createText, { color: activeTint }]}>{active.createLabel}</Text>
        </TouchableOpacity>
      ) : null}

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
        {kind === 'estimates' && (displayList as JobHit[]).map((j, i) => (
          <View key={j.id}>
            {i > 0 ? <Divider inset={64} /> : null}
            <EstimateRow theme={theme} j={j} />
          </View>
        ))}
        {kind === 'jobs' && (displayList as JobHit[]).map((j, i) => (
          <View key={j.id}>
            {i > 0 ? <Divider inset={64} /> : null}
            <JobRow theme={theme} j={j} />
          </View>
        ))}
        {kind === 'invoices' && (displayList as JobHit[]).map((inv, i) => (
          <View key={inv.id}>
            {i > 0 ? <Divider inset={64} /> : null}
            <InvoiceRow theme={theme} inv={inv} />
          </View>
        ))}
        {kind === 'expenses' && (displayList as ExpenseRow[]).map((e, i) => (
          <View key={e.id}>
            {i > 0 ? <Divider inset={64} /> : null}
            <ExpenseRowView theme={theme} row={e} />
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
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <TouchableOpacity onPress={() => textNumber(c.phone)} hitSlop={8}>
              <Ionicons name="chatbubble-outline" size={18} color={theme.accent} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => callNumber(c.phone)} hitSlop={8}>
              <Ionicons name="call-outline" size={18} color={theme.accent} />
            </TouchableOpacity>
          </View>
        ) : null
      }
      onPress={() => router.push('/(owner)/clients' as any)}
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

function ExpenseRowView({ theme, row }: { theme: Theme; row: ExpenseRow }) {
  const catIcon: Record<string, keyof typeof import('@expo/vector-icons/build/Ionicons').default.glyphMap> = {
    fuel: 'car-outline',
    materials: 'cube-outline',
    tools: 'construct-outline',
    meals: 'restaurant-outline',
    vehicle: 'car-sport-outline',
    lodging: 'bed-outline',
    subcontractor: 'people-outline',
    other: 'receipt-outline',
  };
  const icon = catIcon[row.category] || 'receipt-outline';
  const statusColor = row.status === 'approved' ? theme.success
    : row.status === 'rejected' ? theme.danger
    : theme.warning;
  const sub = [
    row.category,
    row.date,
    row.employees?.name,
    row.jobs?.name,
  ].filter(Boolean).join(' · ');
  return (
    <Row
      leading={<RowAvatar icon={icon} tint={theme.stageGreen} />}
      title={row.name}
      subtitle={sub}
      trailing={
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text style={{ color: theme.textPrimary, fontSize: 14, fontWeight: '800' }}>
            ${Number(row.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </Text>
          <Text style={{ color: statusColor, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 }}>
            {row.status || 'pending'}
          </Text>
        </View>
      }
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
    focusPills: {
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 6,
      gap: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border,
    },
    focusRoot: {
      height: 30,
      maxHeight: 30,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexShrink: 0,
    },
    focusRootText: { fontSize: 13, fontWeight: '900' },
    filterPill: {
      height: 30,
      maxHeight: 30,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexShrink: 0,
    },
    filterPillText: { fontSize: 13, fontWeight: '800' },

    emptyWrap: { paddingTop: 60, paddingHorizontal: 32, alignItems: 'center' },
    emptyTitle: { color: t.textPrimary, fontSize: 16, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
    emptySub: { color: t.textMuted, fontSize: 13, textAlign: 'center' },
  });
}
