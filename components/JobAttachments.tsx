import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, Modal, Switch, Linking, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { mobileGet, mobilePost } from '../lib/mobileApi';
import { useTheme } from '../lib/themeContext';
import { Theme } from '../lib/theme';
import { getUser } from '../lib/storage';
import { Role } from '../lib/supabase';

type Attachment = {
  id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  label: string | null;
  require_acknowledgment: boolean;
  url: string | null;
  viewed_at: string | null;
  acknowledged_at: string | null;
  uploaded_at: string;
};

type WorkOrderRequest = {
  id: string;
  requested_at: string;
  note: string | null;
  resolved_at: string | null;
};

type Props = {
  jobId: string;
  hasWorkflow?: boolean;   // pass in if job has service_pro_workflow_id
  onAttachmentsChange?: (count: number, allAcked: boolean) => void;
};

const APPROVER_ROLES: Role[] = ['owner', 'manager', 'supervisor'];

// Icon for a mime-type. Broad buckets, no try-too-hard.
function iconFor(mime?: string | null) {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image-outline';
  if (m === 'application/pdf') return 'document-text-outline';
  if (m.includes('word') || m.includes('msword')) return 'document-outline';
  if (m.includes('sheet') || m.includes('excel')) return 'stats-chart-outline';
  return 'document-attach-outline';
}

function formatBytes(n?: number | null) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function JobAttachments({ jobId, hasWorkflow, onAttachmentsChange }: Props) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [role, setRole] = useState<Role | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [openRequest, setOpenRequest] = useState<WorkOrderRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadRequireAck, setUploadRequireAck] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [noteModal, setNoteModal] = useState(false);
  const [requestNote, setRequestNote] = useState('');
  const [ackModal, setAckModal] = useState<Attachment | null>(null);
  const [ackConfirmed, setAckConfirmed] = useState(false);

  useEffect(() => {
    getUser().then(u => setRole((u?.role as Role) || null));
  }, []);

  const isApprover = !!role && APPROVER_ROLES.includes(role);

  const load = useCallback(async () => {
    try {
      const res = await mobileGet<{ attachments: Attachment[] }>(`/api/mobile/jobs/${jobId}/attachments`);
      setAttachments(res.attachments || []);
      // Also check for open work-order request by this employee (crew).
      // Approvers fetch the tenant-wide open list from a different endpoint —
      // that's on the work-order requests tab; here we just render the
      // banner for crew who may be waiting.
      if (!isApprover) {
        try {
          // Piggyback on tenant-open list if crew is allowed to see own;
          // safe to fail silently otherwise.
          const reqs = await mobileGet<{ requests: any[] }>(`/api/mobile/owner/work-order-requests`).catch(() => ({ requests: [] }));
          const mine = (reqs.requests || []).find((r: any) => r.job_id === jobId);
          setOpenRequest(mine || null);
        } catch {
          setOpenRequest(null);
        }
      }
    } catch (e: any) {
      // Silent — component is a section, not a whole screen.
    } finally {
      setLoading(false);
    }
  }, [jobId, isApprover]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!onAttachmentsChange) return;
    const required = attachments.filter(a => a.require_acknowledgment);
    const allAcked = required.every(a => !!a.acknowledged_at);
    onAttachmentsChange(attachments.length, allAcked);
  }, [attachments, onAttachmentsChange]);

  async function pickAndUpload() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'application/msword',
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
               'application/vnd.ms-excel',
               'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
               'text/plain'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      setUploading(true);
      const user = await getUser();
      const token = (user as any)?.mobile_session_token;
      const form = new FormData();
      form.append('file', {
        uri: asset.uri,
        name: asset.name || 'upload',
        type: asset.mimeType || 'application/octet-stream',
      } as any);
      form.append('require_acknowledgment', uploadRequireAck ? 'true' : 'false');
      const resp = await fetch(`https://linkcrew.io/api/mobile/jobs/${jobId}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'Upload failed');
      }
      setUploadRequireAck(false);
      await load();
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message || 'Try again');
    } finally {
      setUploading(false);
    }
  }

  async function openAttachment(a: Attachment) {
    if (!a.url) {
      Alert.alert('Cannot open', 'No file URL available yet. Pull to refresh.');
      return;
    }
    // Mark viewed first so the UI updates; then open.
    try {
      await mobilePost(`/api/mobile/jobs/${jobId}/attachments/${a.id}/view`, {});
      setAttachments(prev => prev.map(x =>
        x.id === a.id ? { ...x, viewed_at: x.viewed_at || new Date().toISOString() } : x,
      ));
    } catch {}
    Linking.openURL(a.url).catch(() => Alert.alert('Cannot open file'));
    // If require_acknowledgment, open the ack modal after user returns.
    if (a.require_acknowledgment && !a.acknowledged_at) {
      // Crew will come back; surface the confirmation switch.
      setTimeout(() => {
        setAckModal(a);
        setAckConfirmed(false);
      }, 800);
    }
  }

  async function confirmAck() {
    if (!ackModal || !ackConfirmed) return;
    try {
      await mobilePost(`/api/mobile/jobs/${jobId}/attachments/${ackModal.id}/ack`, {});
      setAttachments(prev => prev.map(x =>
        x.id === ackModal.id ? { ...x, acknowledged_at: new Date().toISOString() } : x,
      ));
      setAckModal(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save');
    }
  }

  async function requestWorkOrder() {
    setRequesting(true);
    try {
      await mobilePost(`/api/mobile/jobs/${jobId}/request-work-order`, { note: requestNote.trim() || null });
      setNoteModal(false);
      setRequestNote('');
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not send');
    } finally {
      setRequesting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const jobIsEmpty = attachments.length === 0 && !hasWorkflow;

  return (
    <View>
      {/* Work-order request banner — shows only when the job is truly empty. */}
      {jobIsEmpty && !isApprover && !openRequest && (
        <TouchableOpacity
          style={[styles.banner, { backgroundColor: theme.stageAmber + '18', borderColor: theme.stageAmber + '55' }]}
          onPress={() => setNoteModal(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="warning-outline" size={18} color={theme.stageAmber} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: theme.stageAmber }]}>No work order attached</Text>
            <Text style={styles.bannerBody}>Tap to request plans / schematics from the office.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.stageAmber} />
        </TouchableOpacity>
      )}

      {/* Pending request pill (crew). */}
      {openRequest && !isApprover && (
        <View style={[styles.banner, { backgroundColor: theme.stageCyan + '14', borderColor: theme.stageCyan + '44' }]}>
          <Ionicons name="time-outline" size={18} color={theme.stageCyan} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: theme.stageCyan }]}>Work order requested</Text>
            <Text style={styles.bannerBody}>Office notified. You'll get a push when plans are attached.</Text>
          </View>
        </View>
      )}

      {/* Attachments card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Plans & Documents</Text>
          {isApprover && (
            <TouchableOpacity onPress={pickAndUpload} disabled={uploading} style={styles.addBtn}>
              {uploading
                ? <ActivityIndicator size="small" color={theme.accent} />
                : <Text style={styles.addBtnText}>+ Upload</Text>}
            </TouchableOpacity>
          )}
        </View>

        {isApprover && (
          <View style={styles.requireAckRow}>
            <Switch
              value={uploadRequireAck}
              onValueChange={setUploadRequireAck}
              trackColor={{ false: '#444', true: theme.accent + '88' }}
              thumbColor={uploadRequireAck ? theme.accent : '#888'}
            />
            <Text style={styles.requireAckLabel}>
              Require crew to confirm they've read before completion
            </Text>
          </View>
        )}

        {attachments.length === 0 ? (
          <Text style={styles.emptyHint}>
            {isApprover
              ? 'No plans yet. Upload PDFs, photos, or schematics for the crew.'
              : 'No plans attached yet.'}
          </Text>
        ) : (
          <View style={{ gap: 8 }}>
            {attachments.map(a => {
              const needsAck = a.require_acknowledgment && !a.acknowledged_at;
              const acked = !!a.acknowledged_at;
              const viewed = !!a.viewed_at;
              const pill = acked
                ? { bg: theme.success + '22', fg: theme.success, text: 'Reviewed ✓✓' }
                : needsAck && viewed
                  ? { bg: theme.stageAmber + '22', fg: theme.stageAmber, text: 'Ack required' }
                  : viewed
                    ? { bg: theme.success + '22', fg: theme.success, text: 'Viewed' }
                    : { bg: theme.textMuted + '22', fg: theme.textMuted, text: 'Tap to open' };
              return (
                <TouchableOpacity
                  key={a.id}
                  style={styles.attachRow}
                  onPress={() => openAttachment(a)}
                  activeOpacity={0.75}
                >
                  <Ionicons name={iconFor(a.mime_type) as any} size={22} color={theme.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.attachName} numberOfLines={1}>{a.filename}</Text>
                    <Text style={styles.attachMeta}>
                      {formatBytes(a.size_bytes)}
                      {a.require_acknowledgment ? ' · ack required' : ''}
                    </Text>
                  </View>
                  <View style={[styles.attachPill, { backgroundColor: pill.bg }]}>
                    <Text style={[styles.attachPillText, { color: pill.fg }]}>{pill.text}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* "Need more info?" for crew even when attachments exist. */}
        {!isApprover && !openRequest && !jobIsEmpty && (
          <TouchableOpacity style={styles.moreInfoBtn} onPress={() => setNoteModal(true)}>
            <Ionicons name="help-circle-outline" size={14} color={theme.textMuted} />
            <Text style={styles.moreInfoText}>Need more info? Request the office</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Request work order modal */}
      <Modal visible={noteModal} transparent animationType="slide" onRequestClose={() => setNoteModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Request work order</Text>
            <Text style={styles.modalBody}>
              What do you need? (Optional — leave blank to just ask for plans.)
            </Text>
            <TextInput
              style={styles.modalInput}
              value={requestNote}
              onChangeText={setRequestNote}
              placeholder="Schematic, dimensions, client spec, etc."
              placeholderTextColor={theme.textMuted}
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.textMuted + '22' }]}
                onPress={() => setNoteModal(false)}
              >
                <Text style={[styles.modalBtnText, { color: theme.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.accent }]}
                onPress={requestWorkOrder}
                disabled={requesting}
              >
                {requesting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={[styles.modalBtnText, { color: '#fff' }]}>Send request</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Ack modal — "I have read and understand the work order" */}
      <Modal visible={!!ackModal} transparent animationType="fade" onRequestClose={() => setAckModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirm review</Text>
            <Text style={styles.modalBody}>
              This document requires your acknowledgment. Flip the switch below once you've read it.
            </Text>
            {ackModal && (
              <Text style={[styles.modalBody, { fontWeight: '600', marginTop: 4 }]}>{ackModal.filename}</Text>
            )}
            <View style={styles.ackSwitchRow}>
              <Switch
                value={ackConfirmed}
                onValueChange={setAckConfirmed}
                trackColor={{ false: '#444', true: theme.success + '88' }}
                thumbColor={ackConfirmed ? theme.success : '#888'}
              />
              <Text style={styles.ackSwitchLabel}>
                I have read the plans/schematics and I understand the work order.
              </Text>
            </View>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.textMuted + '22' }]}
                onPress={() => setAckModal(null)}
              >
                <Text style={[styles.modalBtnText, { color: theme.textMuted }]}>Later</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: ackConfirmed ? theme.success : theme.textMuted + '44' }]}
                onPress={confirmAck}
                disabled={!ackConfirmed}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle: { color: theme.textPrimary, fontWeight: '700', fontSize: 15 },
  addBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: theme.accent + '22',
  },
  addBtnText: { color: theme.accent, fontSize: 12, fontWeight: '700' },
  emptyHint: { color: theme.textMuted, fontSize: 12, fontStyle: 'italic' },
  attachRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingHorizontal: 4,
  },
  attachName: { color: theme.textPrimary, fontSize: 14, fontWeight: '600' },
  attachMeta: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
  attachPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  attachPillText: { fontSize: 10, fontWeight: '700' },
  requireAckRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  requireAckLabel: { color: theme.textMuted, fontSize: 11, flex: 1 },
  moreInfoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'flex-end' },
  moreInfoText: { color: theme.textMuted, fontSize: 12 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 12,
  },
  bannerTitle: { fontSize: 13, fontWeight: '700' },
  bannerBody: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', padding: 20,
  },
  modalCard: {
    backgroundColor: theme.surface, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: theme.border,
  },
  modalTitle: { color: theme.textPrimary, fontSize: 17, fontWeight: '800', marginBottom: 6 },
  modalBody: { color: theme.textMuted, fontSize: 13, lineHeight: 18 },
  modalInput: {
    marginTop: 10, backgroundColor: theme.bg, color: theme.textPrimary,
    borderWidth: 1, borderColor: theme.border, borderRadius: 8,
    padding: 10, minHeight: 70, textAlignVertical: 'top', fontSize: 13,
  },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 14, justifyContent: 'flex-end' },
  modalBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  modalBtnText: { fontSize: 13, fontWeight: '700' },
  ackSwitchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  ackSwitchLabel: { color: theme.textPrimary, fontSize: 13, flex: 1, lineHeight: 18 },
});
