import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView, TextInput, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard, ToastAndroid,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mobileGet } from '../lib/mobileApi';
import { useTheme } from '../lib/themeContext';
import { Theme } from '../lib/theme';
import { Divider } from './Flat';

export type LineItem = {
  id: string;
  catalogId?: string;
  name: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
};

type CatalogItem = {
  id: string;
  name: string;
  description?: string | null;
  unit_price?: number | string | null;
  category?: string | null;
};

export function lineItemsTotal(items: LineItem[]) {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

export function lineItemsSummary(items: LineItem[]) {
  return items
    .map(item => {
      const total = item.quantity * item.unitPrice;
      const desc = item.description ? ` - ${item.description}` : '';
      return `${item.quantity} x ${item.name}${desc}: $${total.toFixed(2)}`;
    })
    .join('\n');
}

function money(value: number) {
  return `$${value.toFixed(2)}`;
}

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function LineItemsPicker({
  items,
  onChange,
  label = 'Line items',
  emptyLabel = 'No line items yet',
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  label?: string;
  emptyLabel?: string;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [tip, setTip] = useState<string | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = lineItemsTotal(items);

  function showTip(message: string) {
    if (tipTimer.current) clearTimeout(tipTimer.current);
    setTip(message);
    if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
    tipTimer.current = setTimeout(() => setTip(null), 2200);
  }

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await mobileGet<CatalogItem[]>('/api/mobile/owner/service-catalog');
      setCatalog(rows || []);
    } catch {
      setCatalog([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadCatalog();
  }, [open, loadCatalog]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(item =>
      item.name.toLowerCase().includes(q) ||
      (item.description || '').toLowerCase().includes(q) ||
      (item.category || '').toLowerCase().includes(q)
    );
  }, [catalog, query]);

  function addCatalogItem(item: CatalogItem) {
    const unitPrice = Number(item.unit_price) || 0;
    const existing = items.find(line => line.catalogId === item.id);
    if (existing) {
      onChange(items.map(line =>
        line.id === existing.id ? { ...line, quantity: line.quantity + 1 } : line
      ));
      showTip('Service quantity updated');
      return;
    }

    onChange([...items, {
      id: newId(),
      catalogId: item.id,
      name: item.name,
      description: item.description || null,
      quantity: 1,
      unitPrice,
    }]);
    showTip('Service added');
  }

  function addCustom() {
    const name = customName.trim();
    if (!name) return;
    const price = Number(customPrice) || 0;
    const existing = items.find(item =>
      !item.catalogId && item.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      onChange(items.map(item =>
        item.id === existing.id
          ? { ...item, quantity: item.quantity + 1, unitPrice: price || item.unitPrice }
          : item
      ));
      setCustomName('');
      setCustomPrice('');
      showTip('Custom item quantity updated');
      return;
    }

    onChange([...items, { id: newId(), name, quantity: 1, unitPrice: price }]);
    setCustomName('');
    setCustomPrice('');
    showTip('Custom item added');
  }

  function updateQuantity(id: string, delta: number) {
    onChange(items.map(item =>
      item.id === id ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
    ));
  }

  function remove(id: string) {
    onChange(items.filter(item => item.id !== id));
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.total}>{money(total)}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setOpen(true)} activeOpacity={0.75}>
          <Ionicons name="add" size={18} color={theme.success} />
          <Text style={styles.addText}>Add</Text>
        </TouchableOpacity>
      </View>

      {items.length === 0 ? (
        <Text style={styles.empty}>{emptyLabel}</Text>
      ) : items.map((item, index) => (
        <View key={item.id}>
          {index > 0 ? <Divider inset={0} /> : null}
          <View style={styles.itemRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
              {item.description ? <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text> : null}
              <Text style={styles.itemMath}>{item.quantity} x {money(item.unitPrice)}</Text>
            </View>
            <View style={styles.qtyControls}>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQuantity(item.id, -1)}>
                <Ionicons name="remove" size={15} color={theme.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.qtyText}>{item.quantity}</Text>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQuantity(item.id, 1)}>
                <Ionicons name="add" size={15} color={theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.lineTotal}>{money(item.quantity * item.unitPrice)}</Text>
            <TouchableOpacity onPress={() => remove(item.id)} hitSlop={8}>
              <Ionicons name="trash-outline" size={18} color={theme.danger} />
            </TouchableOpacity>
          </View>
        </View>
      ))}

      <Modal visible={open} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.grabber} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Add line item</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {tip ? (
              <View style={styles.tip}>
                <Ionicons name="checkmark-circle" size={18} color={theme.success} />
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ) : null}

            <View style={styles.searchBox}>
              <Ionicons name="search" size={17} color={theme.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search line items"
                placeholderTextColor={theme.textMuted}
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
            </View>

            <View style={styles.customBox}>
              <Text style={styles.customTitle}>Custom item</Text>
              <View style={styles.customRow}>
                <TextInput
                  style={[styles.customInput, { flex: 1.4 }]}
                  placeholder="Name"
                  placeholderTextColor={theme.textMuted}
                  value={customName}
                  onChangeText={setCustomName}
                />
                <TextInput
                  style={styles.customInput}
                  placeholder="Price"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  value={customPrice}
                  onChangeText={setCustomPrice}
                />
                <TouchableOpacity style={styles.customAdd} onPress={addCustom}>
                  <Ionicons name="add" size={20} color={theme.accentContrast} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              style={styles.catalogList}
              contentContainerStyle={styles.catalogContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              {loading ? (
                <View style={styles.loadingCatalog}>
                  <ActivityIndicator color={theme.accent} />
                  <Text style={styles.emptyCatalog}>Loading catalog...</Text>
                </View>
              ) : filtered.length === 0 ? (
                <Text style={styles.emptyCatalog}>No catalog items found.</Text>
              ) : filtered.map((item, index) => (
                <View key={item.id}>
                  {index > 0 ? <Divider inset={0} /> : null}
                  <TouchableOpacity style={styles.catalogRow} onPress={() => addCatalogItem(item)} activeOpacity={0.72}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.catalogName} numberOfLines={1}>{item.name}</Text>
                      {item.description ? <Text style={styles.catalogDesc} numberOfLines={1}>{item.description}</Text> : null}
                    </View>
                    <Text style={styles.catalogPrice}>{money(Number(item.unit_price) || 0)}</Text>
                    <Ionicons name="add-circle-outline" size={20} color={theme.success} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    wrap: {
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: t.border,
      paddingVertical: 12,
      gap: 8,
    },
    headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    label: { color: t.textPrimary, fontSize: 15, fontWeight: '800' },
    total: { color: t.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 2 },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 7,
      paddingHorizontal: 11,
      borderRadius: 999,
      backgroundColor: t.successMuted,
    },
    addText: { color: t.success, fontSize: 13, fontWeight: '800' },
    empty: { color: t.textMuted, fontSize: 13, paddingVertical: 4 },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    itemName: { color: t.textPrimary, fontSize: 14, fontWeight: '800' },
    itemDesc: { color: t.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
    itemMath: { color: t.textMuted, fontSize: 12, marginTop: 4 },
    qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    qtyBtn: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: t.surfaceInset,
      alignItems: 'center',
      justifyContent: 'center',
    },
    qtyText: { color: t.textPrimary, fontSize: 13, fontWeight: '800', minWidth: 14, textAlign: 'center' },
    lineTotal: { color: t.textPrimary, fontSize: 13, fontWeight: '800', minWidth: 64, textAlign: 'right' },
    modalBackdrop: { flex: 1, backgroundColor: t.overlay, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: t.surfaceElevated,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 14,
      maxHeight: '94%',
    },
    grabber: {
      alignSelf: 'center',
      width: 38,
      height: 4,
      borderRadius: 999,
      backgroundColor: t.borderStrong,
      marginBottom: 14,
    },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    sheetTitle: { color: t.textPrimary, fontSize: 20, fontWeight: '800' },
    tip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: t.success + '55',
      backgroundColor: t.successMuted,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginBottom: 12,
    },
    tipText: { color: t.success, fontSize: 14, fontWeight: '900' },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surfaceInset,
      borderRadius: 10,
      paddingHorizontal: 12,
      marginBottom: 12,
    },
    searchInput: { flex: 1, color: t.textPrimary, fontSize: 15, paddingVertical: 11 },
    catalogList: { maxHeight: 260, borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.border },
    catalogContent: { paddingBottom: 8 },
    catalogRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
    catalogName: { color: t.textPrimary, fontSize: 14, fontWeight: '800' },
    catalogDesc: { color: t.textSecondary, fontSize: 12, marginTop: 2 },
    catalogPrice: { color: t.textPrimary, fontSize: 13, fontWeight: '800' },
    emptyCatalog: { color: t.textMuted, textAlign: 'center', paddingVertical: 22, fontSize: 13 },
    loadingCatalog: { alignItems: 'center', paddingVertical: 18 },
    customBox: { paddingBottom: 14 },
    customTitle: { color: t.textPrimary, fontSize: 14, fontWeight: '800', marginBottom: 8 },
    customRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    customInput: {
      backgroundColor: t.surfaceInset,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 10,
      color: t.textPrimary,
      fontSize: 14,
      paddingHorizontal: 11,
      paddingVertical: 10,
    },
    customAdd: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: t.success,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
