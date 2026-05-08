import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, Alert,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { mobileGet, mobilePost } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import { Row, RowAvatar, Divider, ScreenHeader } from '../../components/Flat';

type Employee = {
  id: string;
  name: string;
  role: string;
  phone?: string | null;
  avatar_url?: string | null;
};

export default function NewMessage() {
  const theme = useTheme();
  const styles = makeStyles(theme);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await mobileGet<Employee[]>('/api/mobile/chat/employees');
      setEmployees(data || []);
    } catch {
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function create() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setCreating(true);
    try {
      const body: any = { employee_ids: ids };
      if (ids.length > 1 && groupName.trim()) body.name = groupName.trim();
      const thread = await mobilePost<{ id: string }>('/api/mobile/chat/threads', body);
      router.replace({ pathname: '/(owner)/message/[id]', params: { id: thread.id } } as any);
    } catch (e: any) {
      Alert.alert('Could not start', e?.message || 'Try again.');
    } finally {
      setCreating(false);
    }
  }

  const filtered = employees.filter(e =>
    e.name.toLowerCase().includes(query.trim().toLowerCase()) ||
    (e.phone || '').includes(query.trim())
  );

  const isGroup = selected.size > 1;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScreenHeader title="New message" subtitle="Pick teammates to chat with" />

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={theme.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search teammates"
          placeholderTextColor={theme.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {isGroup ? (
        <View style={styles.groupNameRow}>
          <Ionicons name="people-outline" size={16} color={theme.textSecondary} />
          <TextInput
            style={styles.groupNameInput}
            placeholder="Group name (optional)"
            placeholderTextColor={theme.textMuted}
            value={groupName}
            onChangeText={setGroupName}
          />
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={e => e.id}
          ItemSeparatorComponent={() => <Divider inset={64} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {employees.length === 0 ? 'No teammates yet' : 'No match'}
              </Text>
              <Text style={styles.emptySub}>
                {employees.length === 0
                  ? 'Ask your owner to add crew members.'
                  : 'Try a different name or number.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isSelected = selected.has(item.id);
            return (
              <Row
                leading={<RowAvatar letter={item.name.charAt(0).toUpperCase()} tint={theme.stagePurple} />}
                title={item.name}
                subtitle={[item.role, item.phone].filter(Boolean).join(' · ')}
                trailing={
                  isSelected ? (
                    <View style={[styles.check, { backgroundColor: theme.accent }]}>
                      <Ionicons name="checkmark" size={14} color={theme.accentContrast} />
                    </View>
                  ) : (
                    <View style={[styles.check, { borderWidth: 1.5, borderColor: theme.border }]} />
                  )
                }
                onPress={() => toggle(item.id)}
              />
            );
          }}
        />
      )}

      {selected.size > 0 ? (
        <View style={styles.footer}>
          <TouchableOpacity
            onPress={create}
            disabled={creating}
            style={[styles.startBtn, { backgroundColor: theme.accent }]}
          >
            {creating
              ? <ActivityIndicator color={theme.accentContrast} />
              : (
                <Text style={[styles.startBtnText, { color: theme.accentContrast }]}>
                  {isGroup ? `Start group · ${selected.size}` : 'Start chat'}
                </Text>
              )}
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    searchBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 16, marginTop: 12,
      backgroundColor: t.surfaceInset,
      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    },
    searchInput: { flex: 1, color: t.textPrimary, fontSize: 15, paddingVertical: 0 },

    groupNameRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 16, marginTop: 10,
      backgroundColor: t.surface,
      borderWidth: 1, borderColor: t.border,
      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    },
    groupNameInput: { flex: 1, color: t.textPrimary, fontSize: 15, paddingVertical: 0 },

    check: {
      width: 26, height: 26, borderRadius: 13,
      alignItems: 'center', justifyContent: 'center',
    },

    empty: { padding: 60, alignItems: 'center', gap: 6 },
    emptyTitle: { color: t.textPrimary, fontSize: 16, fontWeight: '700' },
    emptySub: { color: t.textMuted, fontSize: 13, textAlign: 'center' },

    footer: {
      padding: 16,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border,
      backgroundColor: t.bg,
    },
    startBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    startBtnText: { fontSize: 15, fontWeight: '800' },
  });
}
