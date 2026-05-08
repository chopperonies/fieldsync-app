import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Image,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { mobileGet } from '../../lib/mobileApi';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';
import { getUser } from '../../lib/storage';
import { Row, RowAvatar, Divider, SectionHeader, ScreenHeader } from '../../components/Flat';

type Member = { employee_id: string; name: string; avatar_url: string | null };
type LastMessage = { id: string; body: string; sender_id: string | null; created_at: string; employees?: { name: string } | null };
type Thread = {
  id: string;
  name: string | null;
  created_by: string | null;
  created_at: string;
  last_message_at: string;
  members: Member[];
  last_message: LastMessage | null;
  unread_count: number;
};

function timeAgoShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Messages() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);

  useEffect(() => { getUser().then(u => setMeId(u?.id || null)); }, []);

  const load = useCallback(async () => {
    try {
      const data = await mobileGet<Thread[]>('/api/mobile/chat/threads');
      setThreads(data || []);
    } catch {
      setThreads([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function threadTitle(t: Thread): string {
    if (t.name) return t.name;
    const others = t.members.filter(m => m.employee_id !== meId);
    if (others.length === 0) return 'Me';
    return others.map(m => m.name).join(', ');
  }

  function threadAvatar(t: Thread) {
    const others = t.members.filter(m => m.employee_id !== meId);
    if (!t.name && others.length === 1) {
      const o = others[0];
      if (o.avatar_url) {
        return <Image source={{ uri: o.avatar_url }} style={{ width: 44, height: 44, borderRadius: 22 }} />;
      }
      return <RowAvatar letter={o.name.charAt(0).toUpperCase()} tint={theme.stagePurple} />;
    }
    // group: simple icon
    return <RowAvatar icon="people-outline" tint={theme.accent} />;
  }

  if (loading && threads.length === 0) {
    return <View style={styles.center}><ActivityIndicator color={theme.accent} /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScreenHeader
        title="Messages"
        subtitle={`${threads.length} ${threads.length === 1 ? 'conversation' : 'conversations'}`}
        right={(
          <TouchableOpacity
            onPress={() => router.push('/(owner)/message-new' as any)}
            activeOpacity={0.7}
            hitSlop={8}
            style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: theme.accent + '22' }}
          >
            <Ionicons name="create-outline" size={20} color={theme.accent} />
          </TouchableOpacity>
        )}
      />
      <FlatList
        data={threads}
        keyExtractor={t => t.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.accent} />}
        ItemSeparatorComponent={() => <Divider inset={72} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={36} color={theme.textMuted} />
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptySub}>Tap the compose icon to start one.</Text>
            <TouchableOpacity
              onPress={() => router.push('/(owner)/message-new' as any)}
              style={[styles.emptyCta, { backgroundColor: theme.accent }]}
            >
              <Text style={[styles.emptyCtaText, { color: theme.accentContrast }]}>+ New message</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          const last = item.last_message;
          const senderName = last?.sender_id === meId ? 'You' : (last?.employees?.name || '');
          const preview = last ? (senderName ? `${senderName}: ${last.body}` : last.body) : 'No messages yet';
          const unread = item.unread_count > 0;
          return (
            <Row
              leading={threadAvatar(item)}
              title={threadTitle(item)}
              subtitle={preview}
              trailing={
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={[styles.time, unread && { color: theme.accent, fontWeight: '800' }]}>
                    {timeAgoShort(item.last_message_at)}
                  </Text>
                  {unread ? (
                    <View style={[styles.badge, { backgroundColor: theme.accent }]}>
                      <Text style={[styles.badgeText, { color: theme.accentContrast }]}>
                        {item.unread_count > 9 ? '9+' : String(item.unread_count)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              }
              titleColor={unread ? theme.textPrimary : theme.textPrimary}
              onPress={() => router.push({ pathname: '/(owner)/message/[id]', params: { id: item.id } } as any)}
            />
          );
        }}
      />
    </View>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg },
    headerBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingRight: 16,
    },
    newBtn: {
      width: 40, height: 40, borderRadius: 20,
      alignItems: 'center', justifyContent: 'center',
    },
    time: { color: t.textMuted, fontSize: 11, fontWeight: '700' },
    badge: {
      minWidth: 20, height: 20, paddingHorizontal: 6,
      borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    },
    badgeText: { fontSize: 11, fontWeight: '800' },
    empty: { padding: 60, alignItems: 'center', gap: 8 },
    emptyTitle: { color: t.textPrimary, fontSize: 17, fontWeight: '700' },
    emptySub: { color: t.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 12 },
    emptyCta: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 999 },
    emptyCtaText: { fontSize: 14, fontWeight: '800' },
  });
}
