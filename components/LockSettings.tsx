import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import PinPad from './PinPad';
import { isBiometricAvailable, authenticate } from '../lib/biometric';
import {
  getLockMethod, setLockMethod, setPin, clearPin, LockMethod,
} from '../lib/storage';
import { useTheme } from '../lib/themeContext';
import { Theme } from '../lib/theme';

// Shared "App lock" settings section — drop into owner / crew / manager
// settings screens so every role can pick biometric / PIN / none.
export default function LockSettings() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [method, setMethod] = useState<LockMethod | null>(null);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPinCreate, setShowPinCreate] = useState(false);

  const refresh = useCallback(async () => {
    const [m, avail] = await Promise.all([getLockMethod(), isBiometricAvailable()]);
    setMethod(m);
    setBioAvailable(avail);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function selectNone() {
    setBusy(true);
    try {
      await clearPin();
      await setLockMethod('none');
      await refresh();
    } finally { setBusy(false); }
  }

  async function selectBiometric() {
    setBusy(true);
    try {
      const ok = await authenticate('Confirm to enable biometric lock');
      if (!ok) return;
      await clearPin();
      await setLockMethod('biometric');
      await refresh();
    } finally { setBusy(false); }
  }

  function startPinChange() {
    setShowPinCreate(true);
  }

  if (method === null) return <ActivityIndicator color={theme.accent} style={{ marginVertical: 12 }} />;

  return (
    <View>
      <Text style={styles.hint}>Lock the app when you reopen it. Crew in gloves — PIN. Indoor owner — biometric is fastest.</Text>

      <OptionRow
        theme={theme}
        styles={styles}
        label="Face / Fingerprint"
        detail={bioAvailable ? 'Uses your device sensor.' : 'Not available on this device.'}
        selected={method === 'biometric'}
        disabled={!bioAvailable || busy}
        onPress={selectBiometric}
      />
      <OptionRow
        theme={theme}
        styles={styles}
        label="4-digit PIN"
        detail={method === 'pin' ? 'Tap to change your PIN.' : 'Works with gloves or wet hands.'}
        selected={method === 'pin'}
        disabled={busy}
        onPress={startPinChange}
      />
      <OptionRow
        theme={theme}
        styles={styles}
        label="Off"
        detail="No lock on reopen."
        selected={method === 'none'}
        disabled={busy}
        onPress={selectNone}
      />

      {showPinCreate && (
        <View style={styles.overlay}>
          <PinPad
            title={method === 'pin' ? 'Change your PIN' : 'Create a PIN'}
            subtitle="Pick a 4-digit PIN you'll remember."
            confirm
            onSubmit={async (pin) => {
              await setPin(pin);
              await setLockMethod('pin');
              setShowPinCreate(false);
              await refresh();
              return true;
            }}
            extra={
              <TouchableOpacity onPress={() => setShowPinCreate(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            }
          />
        </View>
      )}
    </View>
  );
}

function OptionRow({
  theme, styles, label, detail, selected, disabled, onPress,
}: {
  theme: Theme;
  styles: any;
  label: string; detail: string; selected: boolean; disabled?: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, selected && styles.rowSelected, disabled && { opacity: 0.4 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, selected && { color: theme.accent }]}>{label}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected && <View style={styles.radioInner} />}
      </View>
    </TouchableOpacity>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    hint: { color: t.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 14 },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: t.surface, borderRadius: 12, padding: 14,
      marginBottom: 8, borderWidth: 1, borderColor: t.border,
    },
    rowSelected: { borderColor: t.accent, backgroundColor: t.accentSoft },
    rowLabel: { color: t.textPrimary, fontSize: 15, fontWeight: '600' },
    rowDetail: { color: t.textSecondary, fontSize: 12, marginTop: 2 },
    radio: {
      width: 20, height: 20, borderRadius: 10,
      borderWidth: 2, borderColor: t.textMuted,
      alignItems: 'center', justifyContent: 'center',
    },
    radioSelected: { borderColor: t.accent },
    radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: t.accent },
    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: t.bg, zIndex: 9999 },
    cancelBtn: { marginTop: 22, padding: 12 },
    cancelText: { color: t.textSecondary, fontSize: 14 },
  });
}
