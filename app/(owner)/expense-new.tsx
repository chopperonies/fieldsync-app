import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Image, Platform, ActionSheetIOS,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { mobilePost } from '../../lib/mobileApi';
import { getUser } from '../../lib/storage';
import { useTheme } from '../../lib/themeContext';
import { Theme } from '../../lib/theme';

const API_BASE = 'https://linkcrew.io';

type Category = {
  key: string;
  label: string;
  icon: keyof typeof import('@expo/vector-icons/build/Ionicons').default.glyphMap;
  color: (t: Theme) => string;
};

const CATEGORIES: Category[] = [
  { key: 'fuel',          label: 'Fuel',         icon: 'car-outline',       color: (t) => t.stageBlue },
  { key: 'materials',     label: 'Materials',    icon: 'cube-outline',      color: (t) => t.stageGreen },
  { key: 'tools',         label: 'Tools',        icon: 'construct-outline', color: (t) => t.stageAmber },
  { key: 'meals',         label: 'Meals',        icon: 'restaurant-outline',color: (t) => t.stagePurple },
  { key: 'vehicle',       label: 'Vehicle',      icon: 'car-sport-outline', color: (t) => t.stageCyan },
  { key: 'lodging',       label: 'Lodging',      icon: 'bed-outline',       color: (t) => t.stageIndigo },
  { key: 'subcontractor', label: 'Sub',          icon: 'people-outline',    color: (t) => t.stagePurple },
  { key: 'other',         label: 'Other',        icon: 'ellipsis-horizontal-outline', color: (t) => t.textSecondary },
];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ExpenseNew() {
  const theme = useTheme();
  const styles = makeStyles(theme);

  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [details, setDetails] = useState('');
  const [category, setCategory] = useState<string>('other');
  const [date, setDate] = useState<string>(todayISO());
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [receiptMime, setReceiptMime] = useState<string>('image/jpeg');
  const [saving, setSaving] = useState(false);

  async function pickReceipt(source: 'camera' | 'library') {
    try {
      const perm = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(source === 'camera' ? 'Camera permission needed' : 'Photo library permission needed');
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.75 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.75, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setReceiptUri(asset.uri);
      setReceiptMime(asset.mimeType || 'image/jpeg');
    } catch (e: any) {
      Alert.alert('Could not pick photo', e?.message || 'Try again.');
    }
  }

  function openReceiptMenu() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Pick from Library'], cancelButtonIndex: 0 },
        (idx) => {
          if (idx === 1) pickReceipt('camera');
          if (idx === 2) pickReceipt('library');
        },
      );
    } else {
      Alert.alert('Receipt', 'Choose source', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take photo', onPress: () => pickReceipt('camera') },
        { text: 'From library', onPress: () => pickReceipt('library') },
      ]);
    }
  }

  async function save() {
    const amt = parseFloat(amount);
    if (!isFinite(amt) || amt <= 0) return Alert.alert('Amount required', 'Enter a dollar amount.');
    if (!name.trim()) return Alert.alert('Name required', 'What was this expense for?');
    setSaving(true);
    try {
      const created = await mobilePost<{ id: string }>('/api/mobile/expenses', {
        date,
        amount: amt,
        name: name.trim(),
        details: details.trim() || null,
        category,
      });

      if (receiptUri) {
        try {
          const user = await getUser();
          const token = (user as any)?.mobile_session_token;
          if (token) {
            const form = new FormData();
            const filename = `receipt.${(receiptMime.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`;
            form.append('receipt', { uri: receiptUri, name: filename, type: receiptMime } as any);
            await fetch(`${API_BASE}/api/mobile/expenses/${created.id}/receipt`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
              body: form,
            });
          }
        } catch {
          // Receipt upload is non-fatal — the expense is already saved.
        }
      }

      router.back();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: 140 }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{
          title: 'New expense',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={{ paddingHorizontal: 12 }}>
              <Ionicons name="close" size={24} color={theme.textPrimary} />
            </TouchableOpacity>
          ),
        }}
      />

      <Text style={styles.label}>Amount</Text>
      <View style={styles.amountRow}>
        <Text style={styles.dollar}>$</Text>
        <TextInput
          style={styles.amountInput}
          placeholder="0.00"
          placeholderTextColor={theme.textMuted}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          autoFocus
        />
      </View>

      <Text style={styles.label}>What for?</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 2x 90° elbows @ Ferguson"
        placeholderTextColor={theme.textMuted}
        value={name}
        onChangeText={setName}
      />

      <Text style={styles.label}>Category</Text>
      <View style={styles.catGrid}>
        {CATEGORIES.map(c => {
          const active = category === c.key;
          const tint = c.color(theme);
          return (
            <TouchableOpacity
              key={c.key}
              style={[
                styles.catChip,
                active
                  ? { backgroundColor: tint + '22', borderColor: tint + '66' }
                  : { backgroundColor: theme.surfaceInset, borderColor: 'transparent' },
              ]}
              onPress={() => setCategory(c.key)}
              activeOpacity={0.7}
            >
              <Ionicons name={c.icon} size={14} color={active ? tint : theme.textSecondary} />
              <Text style={[styles.catChipText, { color: active ? tint : theme.textSecondary }]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Date</Text>
      <TextInput
        style={styles.input}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={theme.textMuted}
        value={date}
        onChangeText={setDate}
      />

      <Text style={styles.label}>Notes (optional)</Text>
      <TextInput
        style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
        placeholder="Any extra context"
        placeholderTextColor={theme.textMuted}
        value={details}
        onChangeText={setDetails}
        multiline
      />

      <Text style={styles.label}>Receipt (optional)</Text>
      {receiptUri ? (
        <View style={styles.receiptWrap}>
          <Image source={{ uri: receiptUri }} style={styles.receipt} resizeMode="cover" />
          <TouchableOpacity
            style={[styles.receiptBtn, { backgroundColor: theme.accent }]}
            onPress={openReceiptMenu}
          >
            <Ionicons name="camera" size={14} color={theme.accentContrast} />
            <Text style={[styles.receiptBtnText, { color: theme.accentContrast }]}>Replace</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.receiptPicker} onPress={openReceiptMenu} activeOpacity={0.7}>
          <Ionicons name="camera-outline" size={20} color={theme.accent} />
          <Text style={[styles.receiptPickerText, { color: theme.accent }]}>Attach receipt photo</Text>
        </TouchableOpacity>
      )}

      <View style={styles.actionRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          disabled={saving}
          style={[styles.cancelBtn, { borderColor: theme.border }]}
        >
          <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={save}
          disabled={saving}
          style={[styles.saveBtn, { backgroundColor: theme.accent }]}
        >
          {saving
            ? <ActivityIndicator color={theme.accentContrast} />
            : <Text style={[styles.saveBtnText, { color: theme.accentContrast }]}>Save expense</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    label: { color: t.textSecondary, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 16 },

    amountRow: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: t.surfaceInset,
      borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    },
    dollar: { color: t.textMuted, fontSize: 28, fontWeight: '700' },
    amountInput: {
      flex: 1, color: t.textPrimary, fontSize: 32, fontWeight: '800',
      fontVariant: ['tabular-nums'],
      paddingVertical: 0, letterSpacing: -1,
    },

    input: {
      backgroundColor: t.surfaceInset,
      borderRadius: 12, padding: 14,
      color: t.textPrimary, fontSize: 15,
    },

    catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    catChip: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      height: 32, paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
    },
    catChipText: { fontSize: 13, fontWeight: '700' },

    receiptPicker: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingVertical: 14, paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1, borderColor: t.border, borderStyle: 'dashed',
      backgroundColor: t.surface,
    },
    receiptPickerText: { fontSize: 14, fontWeight: '700' },
    receiptWrap: { position: 'relative', borderRadius: 12, overflow: 'hidden' },
    receipt: { width: '100%', height: 220 },
    receiptBtn: {
      position: 'absolute', bottom: 8, right: 8,
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999,
    },
    receiptBtnText: { fontSize: 12, fontWeight: '800' },

    actionRow: {
      flexDirection: 'row', gap: 10, marginTop: 24,
    },
    cancelBtn: {
      flex: 1, borderRadius: 14, paddingVertical: 16,
      alignItems: 'center',
      borderWidth: 1,
    },
    cancelBtnText: { fontSize: 16, fontWeight: '700' },
    saveBtn: {
      flex: 2, borderRadius: 14,
      paddingVertical: 16, alignItems: 'center',
    },
    saveBtnText: { fontSize: 16, fontWeight: '800' },
  });
}
