import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Alert, Linking,
} from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { mobileGet, mobilePost } from '../../../lib/mobileApi';
import { getUser } from '../../../lib/storage';
import { useTheme } from '../../../lib/themeContext';
import { Theme } from '../../../lib/theme';
import { ScreenHeader } from '../../../components/Flat';

// Live updates = server-side polling. 4s interval while the thread is
// open — cheap at the tenant sizes LinkCrew has today. Realtime via
// Supabase Realtime is a later upgrade (requires Supabase Auth sign-in
// so RLS doesn't block anon subscriptions).
const POLL_MS = 4000;

type Msg = {
  id: string;
  sender_id: string | null;
  body: string;
  created_at: string;
  employees?: { name: string; avatar_url?: string | null } | null;
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function sameDay(a: string, b: string): boolean {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

// Pull image URLs out of a chat body so we can render them inline as
// thumbnails. The mirror function on the server appends photo URLs to
// system messages, so detecting these covers both job-update mirrors
// and any future case where someone pastes a photo link in chat.
const IMAGE_URL_RE = /https?:\/\/\S+?\.(?:jpg|jpeg|png|gif|webp|heic)(?:\?[^\s]*)?/gi;
const SUPABASE_PHOTO_RE = /https?:\/\/[^\s]+\/storage\/v1\/object\/public\/photos\/[^\s]+/gi;
function extractImages(body: string): { text: string; urls: string[] } {
  if (!body) return { text: '', urls: [] };
  const matched = new Set<string>();
  body.replace(IMAGE_URL_RE, (m) => { matched.add(m); return m; });
  body.replace(SUPABASE_PHOTO_RE, (m) => { matched.add(m); return m; });
  const urls = Array.from(matched);
  let text = body;
  for (const u of urls) text = text.split(u).join('');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return { text, urls };
}

export default function MessageThread() {
  const { id: threadId } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const styles = makeStyles(theme);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [title, setTitle] = useState<string>('Message');
  const [subtitle, setSubtitle] = useState<string>('');
  const [linkedJobId, setLinkedJobId] = useState<string | null>(null);
  const listRef = useRef<FlatList<Msg>>(null);

  useEffect(() => { getUser().then(u => setMeId(u?.id || null)); }, []);

  const load = useCallback(async () => {
    if (!threadId) return;
    try {
      const [msgs, threads] = await Promise.all([
        mobileGet<Msg[]>(`/api/mobile/chat/threads/${threadId}/messages?limit=100`),
        mobileGet<Array<{
          id: string; name: string | null;
          members: Array<{ employee_id: string; name: string }>;
          job_id?: string | null;
          job?: { id: string; name: string; address?: string | null } | null;
        }>>('/api/mobile/chat/threads'),
      ]);
      setMessages(msgs || []);
      const t = (threads || []).find(t => t.id === threadId);
      if (t) {
        if (t.job?.name) {
          setTitle(t.job.name);
          setSubtitle(t.job.address || '');
          setLinkedJobId(t.job.id);
        } else if (t.name) {
          setTitle(t.name);
          setSubtitle('');
          setLinkedJobId(null);
        } else {
          const me = await getUser();
          const others = (t.members || []).filter(m => m.employee_id !== me?.id);
          setTitle(others.map(m => m.name).join(', ') || 'Message');
          setSubtitle('');
          setLinkedJobId(null);
        }
      }
      // Mark read on entry
      mobilePost(`/api/mobile/chat/threads/${threadId}/read`, {}).catch(() => {});
    } catch (e: any) {
      Alert.alert('Could not load', e?.message || 'Try again.');
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => { load(); }, [load]);

  // Poll for new messages while the thread is open.
  useEffect(() => {
    if (!threadId) return;
    const id = setInterval(async () => {
      try {
        const fresh = await mobileGet<Msg[]>(`/api/mobile/chat/threads/${threadId}/messages?limit=100`);
        setMessages(prev => {
          if (!fresh || fresh.length === prev.length) return prev;
          // Only replace when there are new rows at the end.
          const existingIds = new Set(prev.map(m => m.id));
          const added = fresh.filter(m => !existingIds.has(m.id));
          if (added.length === 0) return prev;
          return [...prev, ...added];
        });
        mobilePost(`/api/mobile/chat/threads/${threadId}/read`, {}).catch(() => {});
      } catch {
        /* swallow */
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [threadId]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body || !threadId || sending) return;
    setSending(true);
    try {
      const sent = await mobilePost<Msg>(`/api/mobile/chat/threads/${threadId}/messages`, { body });
      setMessages(prev => prev.some(x => x.id === sent.id) ? prev : [...prev, sent]);
      setDraft('');
    } catch (e: any) {
      Alert.alert('Could not send', e?.message || 'Try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ScreenHeader
        title={title}
        subtitle={subtitle || undefined}
        right={linkedJobId ? (
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/(owner)/job/[id]', params: { id: linkedJobId } } as any)}
            hitSlop={8}
            style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: theme.accent + '22' }}
          >
            <Ionicons name="open-outline" size={18} color={theme.accent} />
          </TouchableOpacity>
        ) : undefined}
      />
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} /></View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 12, gap: 4 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item, index }) => {
            const prev = messages[index - 1];
            const showDay = !prev || !sameDay(prev.created_at, item.created_at);
            const isMe = item.sender_id === meId;
            const showAuthor = !isMe && (!prev || prev.sender_id !== item.sender_id || showDay);
            return (
              <View>
                {showDay ? (
                  <View style={styles.daySep}>
                    <Text style={styles.daySepText}>
                      {new Date(item.created_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                ) : null}
                <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowThem]}>
                  {!isMe ? (
                    <View style={styles.avatarCol}>
                      {showAuthor && item.employees?.avatar_url ? (
                        <Image source={{ uri: item.employees.avatar_url }} style={styles.avatar} />
                      ) : showAuthor ? (
                        <View style={[styles.avatar, styles.avatarFallback]}>
                          <Text style={styles.avatarLetter}>
                            {(item.employees?.name || '?').charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      ) : <View style={styles.avatar} />}
                    </View>
                  ) : null}
                  <View style={{ flexShrink: 1 }}>
                    {showAuthor ? (
                      <Text style={styles.author}>{item.employees?.name || 'Crew'}</Text>
                    ) : null}
                    {(() => {
                      const { text, urls } = extractImages(item.body);
                      return (
                        <View style={[
                          styles.bubble,
                          isMe
                            ? { backgroundColor: theme.accent, borderBottomRightRadius: 4, alignSelf: 'flex-end' }
                            : { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderBottomLeftRadius: 4 },
                          urls.length > 0 ? styles.bubbleWithMedia : null,
                        ]}>
                          {urls.map(u => (
                            <TouchableOpacity
                              key={u}
                              activeOpacity={0.85}
                              onPress={() => Linking.openURL(u)}
                            >
                              <Image
                                source={{ uri: u }}
                                style={styles.bubbleImage}
                                resizeMode="cover"
                              />
                            </TouchableOpacity>
                          ))}
                          {text ? (
                            <Text style={[styles.bubbleText, { color: isMe ? theme.accentContrast : theme.textPrimary }, urls.length > 0 ? { paddingHorizontal: 12, paddingVertical: 10 } : null]}>
                              {text}
                            </Text>
                          ) : null}
                        </View>
                      );
                    })()}
                    <Text style={[styles.time, { textAlign: isMe ? 'right' : 'left' }]}>
                      {formatTime(item.created_at)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Say hi 👋</Text>
            </View>
          }
        />
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Type a message"
          placeholderTextColor={theme.textMuted}
          multiline
          maxLength={4000}
        />
        <TouchableOpacity
          onPress={send}
          disabled={sending || !draft.trim()}
          style={[styles.sendBtn, { backgroundColor: draft.trim() ? theme.accent : theme.surfaceInset }]}
          hitSlop={8}
        >
          {sending
            ? <ActivityIndicator color={theme.accentContrast} />
            : <Ionicons name="send" size={18} color={draft.trim() ? theme.accentContrast : theme.textMuted} />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    daySep: { alignItems: 'center', paddingVertical: 10 },
    daySepText: { color: t.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },

    bubbleRow: { flexDirection: 'row', marginVertical: 2, gap: 8 },
    bubbleRowMe: { justifyContent: 'flex-end' },
    bubbleRowThem: { justifyContent: 'flex-start' },

    avatarCol: { width: 32 },
    avatar: { width: 28, height: 28, borderRadius: 14 },
    avatarFallback: { backgroundColor: t.accentMuted, alignItems: 'center', justifyContent: 'center' },
    avatarLetter: { color: t.accent, fontSize: 12, fontWeight: '800' },

    author: { color: t.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 2, marginLeft: 10 },

    bubble: {
      maxWidth: 280,
      paddingVertical: 8, paddingHorizontal: 12,
      borderRadius: 16,
    },
    bubbleWithMedia: {
      paddingVertical: 0, paddingHorizontal: 0,
      overflow: 'hidden',
    },
    bubbleImage: {
      width: 240, height: 180,
      backgroundColor: t.surfaceInset,
    },
    bubbleText: { fontSize: 15, lineHeight: 20 },
    time: { color: t.textMuted, fontSize: 10, marginTop: 2, marginHorizontal: 4 },

    empty: { alignItems: 'center', paddingTop: 60 },
    emptyText: { color: t.textMuted, fontSize: 14, fontWeight: '600' },

    inputRow: {
      flexDirection: 'row', alignItems: 'flex-end', gap: 8,
      paddingHorizontal: 12, paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border,
      backgroundColor: t.bg,
    },
    input: {
      flex: 1, minHeight: 40, maxHeight: 120,
      color: t.textPrimary, fontSize: 15,
      backgroundColor: t.surfaceInset,
      borderRadius: 20,
      paddingHorizontal: 14, paddingVertical: 10,
    },
    sendBtn: {
      width: 40, height: 40, borderRadius: 20,
      alignItems: 'center', justifyContent: 'center',
    },
  });
}
