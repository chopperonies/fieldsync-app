import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import PinPad from './PinPad';
import { authenticate } from '../lib/biometric';
import { verifyPin, LockMethod } from '../lib/storage';
import { useTheme } from '../lib/themeContext';

type Props = {
  method: Exclude<LockMethod, 'none'>;
  onUnlocked: () => void;
};

export default function LockScreen({ method, onUnlocked }: Props) {
  const theme = useTheme();
  const [bioBusy, setBioBusy] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  async function tryBiometric() {
    setBioBusy(true);
    setBioError(null);
    const ok = await authenticate();
    setBioBusy(false);
    if (ok) onUnlocked();
    else setBioError('Authentication cancelled.');
  }

  useEffect(() => {
    if (method === 'biometric') tryBiometric();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (method === 'biometric') {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <Text style={[styles.logo, { color: theme.textPrimary }]}>Link<Text style={{ color: theme.accent }}>Crew</Text></Text>
        <Text style={[styles.sub, { color: theme.textSecondary }]}>App is locked</Text>
        {bioBusy
          ? <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} />
          : (
            <>
              {bioError ? <Text style={[styles.err, { color: theme.danger }]}>{bioError}</Text> : null}
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
                onPress={tryBiometric}
              >
                <Text style={[styles.primaryBtnText, { color: theme.accentContrast }]}>Unlock with Face / Fingerprint</Text>
              </TouchableOpacity>
            </>
          )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <PinPad
        title="Enter PIN"
        subtitle="Your 4-digit app PIN."
        onSubmit={async (pin) => {
          const ok = await verifyPin(pin);
          if (ok) { onUnlocked(); return true; }
          setAttempts(n => n + 1);
          return false;
        }}
        error={attempts > 0 ? `Incorrect PIN — try again (${attempts})` : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    zIndex: 9999,
  },
  logo: { fontSize: 38, fontWeight: '800', marginTop: 100 },
  sub: { fontSize: 15, marginTop: 8 },
  err: { fontSize: 13, marginTop: 28 },
  primaryBtn: {
    marginTop: 40, borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 28,
  },
  primaryBtnText: { fontWeight: '700', fontSize: 15 },
});
