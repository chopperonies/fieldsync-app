import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileGet } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import { Row, RowAvatar, Divider } from '../../components/Flat';
import { callNumber, textNumber } from '../../lib/phone';

type Client = { id: string; name: string; company?: string | null; email?: string | null; phone?: string | null };
type JobHit = {
  id: string; name: string; address?: string | null; status: string;
  invoice_amount?: number | null; payment_status?: string | null;
  scheduled_date?: string | null; updated_at?: string | null;
  clients?: { name: string } | null;
};
type ExpenseRow = {
  id: string; name: string; amount: number; category: string; date: string;
  details?: string | null; status?: string | null;
  employees?: { name: string } | null; jobs?: { name: string } | null;
};

type SearchResponse = {
  clients: Client[];
  estimates: JobHit[];
  jobs: JobHit[];
  invoices: JobHit[];
};

const GROUP_LIMIT = 5;

export default function OwnerSearch() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<SearchResponse>({ clients: [], estimates: [], jobs: [], invoices: [] });
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUniversal = useCallback(async (query: string) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await mobileGet<SearchResponse>(
        `/api/mobile/owner/search?q=${encodeURIComponent(query)}&type=all`,
      );
      setData({
        clients: res?.clients || [],
        estimates: res?.estimates || [],
        jobs: res?.jobs || [],
        invoices: res?.invoices || [],
      });
    } catch (e: any) {
      setData({ clients: [], estimates: [], jobs: [], invoices: [] });
      setErr(e?.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  }, []);

  // Expenses endpoint doesn't take a query; fetch once and filter locally.
  const fetchExpenses = useCallback(async () => {
    try {
      const rows = await mobileGet<ExpenseRow[]>('/api/mobile/expenses');
      setExpenses(rows || []);
    } catch {
      setExpenses([]);
    }
  }, []);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fetchUniversal(q), q ? 220 : 0);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, fetchUniversal]);

  const qTrim = q.trim().toLowerCase();
  const filteredExpenses = qTrim
    ? expenses.filter(e =>
        e.name.toLowerCase().includes(qTrim) ||
        (e.category || '').toLowerCase().includes(qTrim) ||
        (e.details || '').toLowerCase().includes(qTrim))
    : expenses;

  const showEmptyState = q.trim() === '';

  // Recent = jobs + invoices interleaved by updated_at (invoices in this
  // schema are jobs with invoice_amount > 0, so the same row can appear in
  // both buckets — dedupe by id).
  const recent: JobHit[] = (() => {
    const seen = new Set<string>();
    const merged: JobHit[] = [];
    for (const j of [...data.jobs, ...data.invoices]) {
      if (!seen.has(j.id)) { merged.push(j); seen.add(j.id); }
    }
    merged.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
    return merged.slice(0, 8);
  })();

  const totalHits =
    data.clients.length +
    data.estimates.length +
    data.jobs.length +
    data.invoices.length +
    filteredExpenses.length;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.headerTitle}>Search</Text>
      </View>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={theme.textSecondary} />
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="Clients, jobs, invoices, expenses"
          placeholderTextColor={theme.textMuted}
          value={q}
          onChangeText={setQ}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {q.length > 0 && (
          <TouchableOpacity onPress={() => { setQ(''); inputRef.current?.focus(); }} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 140 }}
      >
        {err ? (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={16} color={theme.danger} />
            <Text style={styles.errorText} numberOfLines={2}>{err}</Text>
          </View>
        ) : null}
        {showEmptyState ? (
          <>
            <SectionTitle theme={theme} label="Recent" />
            {recent.length === 0 ? (
              loading ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <ActivityIndicator color={theme.accent} />
                </View>
              ) : (
                <Text style={styles.emptyHint}>Anything you touch will show up here. Use the + button to add a client, estimate, job, or invoice.</Text>
              )
            ) : (
              recent.map((j, i) => (
                <View key={j.id}>
                  {i > 0 ? <Divider inset={64} /> : null}
                  <UniversalJobRow theme={theme} j={j} />
                </View>
              ))
            )}
          </>
        ) : loading && totalHits === 0 ? (
          <View style={{ paddingVertical: 36, alignItems: 'center' }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : totalHits === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No results for "{q}"</Text>
            <Text style={styles.emptySub}>Try a different keyword, or use the + button to add it.</Text>
          </View>
        ) : (
          <>
            <Group theme={theme} label="Clients" count={data.clients.length} seeAll={() => router.push('/(owner)/clients' as any)}>
              {data.clients.slice(0, GROUP_LIMIT).map((c, i) => (
                <View key={c.id}>{i > 0 ? <Divider inset={64} /> : null}<ClientRow theme={theme} c={c} /></View>
              ))}
            </Group>
            <Group theme={theme} label="Jobs" count={data.jobs.length} seeAll={() => router.push('/(owner)/jobs' as any)}>
              {data.jobs.slice(0, GROUP_LIMIT).map((j, i) => (
                <View key={j.id}>{i > 0 ? <Divider inset={64} /> : null}<JobRow theme={theme} j={j} /></View>
              ))}
            </Group>
            <Group theme={theme} label="Invoices" count={data.invoices.length} seeAll={() => router.push('/(owner)/invoices' as any)}>
              {data.invoices.slice(0, GROUP_LIMIT).map((inv, i) => (
                <View key={inv.id}>{i > 0 ? <Divider inset={64} /> : null}<InvoiceRow theme={theme} inv={inv} /></View>
              ))}
            </Group>
            <Group theme={theme} label="Estimates" count={data.estimates.length} seeAll={() => router.push('/(owner)/requests' as any)}>
              {data.estimates.slice(0, GROUP_LIMIT).map((j, i) => (
                <View key={j.id}>{i > 0 ? <Divider inset={64} /> : null}<EstimateRow theme={theme} j={j} /></View>
              ))}
            </Group>
            <Group theme={theme} label="Expenses" count={filteredExpenses.length}>
              {filteredExpenses.slice(0, GROUP_LIMIT).map((e, i) => (
                <View key={e.id}>{i > 0 ? <Divider inset={64} /> : null}<ExpenseRowView theme={theme} row={e} /></View>
              ))}
            </Group>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function SectionTitle({ theme, label }: { theme: Theme; label: string }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6 }}>
      <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' }}>
        {label}
      </Text>
    </View>
  );
}

function Group({
  theme, label, count, children, seeAll,
}: { theme: Theme; label: string; count: number; children: React.ReactNode; seeAll?: () => void }) {
  if (count === 0) return null;
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6 }}>
        <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' }}>
          {label}{' '}<Text style={{ color: theme.textMuted }}>{count}</Text>
        </Text>
        {seeAll && count > GROUP_LIMIT ? (
          <TouchableOpacity onPress={seeAll} hitSlop={6}>
            <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '800' }}>See all</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {children}
    </>
  );
}

// Recent rows pick their icon + tint from the row's status so estimate vs
// job vs paid/unpaid invoice is legible at a glance.
function UniversalJobRow({ theme, j }: { theme: Theme; j: JobHit }) {
  const status = String(j.status || '').toLowerCase();
  const paid = String(j.payment_status || '').toLowerCase() === 'paid';
  const isInvoice = Number(j.invoice_amount || 0) > 0 || status === 'invoiced';
  const isEstimate = ['quoted', 'lead', 'draft'].includes(status);
  const tint = isInvoice ? (paid ? theme.success : theme.warning)
    : isEstimate ? theme.stageCyan
    : theme.stageGreen;
  const icon = (isInvoice ? 'cash-outline' : isEstimate ? 'document-text-outline' : 'hammer-outline') as any;
  const typeLabel = isInvoice ? (paid ? 'Paid' : 'Unpaid') : isEstimate ? 'Estimate' : 'Job';
  const sub = [j.clients?.name, typeLabel, j.address].filter(Boolean).join(' · ');
  return (
    <Row
      leading={<RowAvatar icon={icon} tint={tint} />}
      title={j.name}
      subtitle={sub}
      trailing={isInvoice && j.invoice_amount ? (
        <Text style={{ color: tint, fontSize: 13, fontWeight: '700' }}>
          ${Number(j.invoice_amount).toLocaleString()}
        </Text>
      ) : null}
      onPress={() => router.push({ pathname: '/(owner)/job/[id]', params: { id: j.id } } as any)}
    />
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

function InvoiceRow({ theme, inv }: { theme: Theme; inv: JobHit }) {
  const paid = String(inv.payment_status || '').toLowerCase() === 'paid';
  const statusColor = paid ? theme.success : theme.warning;
  return (
    <Row
      leading={<RowAvatar icon="cash-outline" tint={statusColor} />}
      title={inv.name}
      subtitle={`${inv.clients?.name || 'Unknown client'} · ${paid ? 'Paid' : 'Unpaid'}`}
      trailing={
        <Text style={{ color: statusColor, fontSize: 13, fontWeight: '700' }}>
          ${Number(inv.invoice_amount || 0).toLocaleString()}
        </Text>
      }
      onPress={() => router.push({ pathname: '/(owner)/job/[id]', params: { id: inv.id } } as any)}
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
  const sub = [row.category, row.date, row.employees?.name, row.jobs?.name].filter(Boolean).join(' · ');
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

function makeStyles(t: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    header: { paddingHorizontal: 16, paddingBottom: 6 },
    headerTitle: { color: t.textPrimary, fontSize: 22, fontWeight: '800' },
    searchBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 16, marginTop: 4,
      backgroundColor: t.surfaceInset,
      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    },
    input: { flex: 1, color: t.textPrimary, fontSize: 15, paddingVertical: 0 },
    emptyHint: { color: t.textMuted, fontSize: 13, paddingHorizontal: 16, paddingVertical: 8 },
    errorBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 16, marginTop: 8,
      backgroundColor: t.dangerMuted,
      borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    },
    errorText: { color: t.danger, fontSize: 12, fontWeight: '700', flexShrink: 1 },
    emptyWrap: { paddingTop: 36, paddingHorizontal: 16, alignItems: 'center' },
    emptyTitle: { color: t.textPrimary, fontSize: 16, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
    emptySub: { color: t.textMuted, fontSize: 13, textAlign: 'center' },
  });
}
