import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import PinPad from './PinPad';
import { authenticate } from '../lib/biometric';
import { verifyPin, LockMethod } from '../lib/storage';

type Props = {
  method: Exclude<LockMethod, 'none'>;
  onUnlocked: () => void;
};

export default function LockScreen({ method, onUnlocked }: Props) {
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
    // Intentionally only on mount — if user cancels, they tap to retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (method === 'biometric') {
    return (
      <View style={styles.container}>
        <Text style={styles.logo}>Link<Text style={styles.accent}>Crew</Text></Text>
        <Text style={styles.sub}>App is locked</Text>
        {bioBusy
          ? <ActivityIndicator size="large" color="#0ea5e9" style={{ marginTop: 40 }} />
          : (
            <>
              {bioError ? <Text style={styles.err}>{bioError}</Text> : null}
              <TouchableOpacity style={styles.primaryBtn} onPress={tryBiometric}>
                <Text style={styles.primaryBtnText}>Unlock with Face / Fingerprint</Text>
              </TouchableOpacity>
            </>
          )}
      </View>
    );
  }

  // PIN mode
  return (
    <View style={styles.container}>
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
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    zIndex: 9999,
  },
  logo: { fontSize: 38, fontWeight: '800', color: '#fff', marginTop: 100 },
  accent: { color: '#0ea5e9' },
  sub: { color: '#555', fontSize: 15, marginTop: 8 },
  err: { color: '#ef4444', fontSize: 13, marginTop: 28 },
  primaryBtn: {
    marginTop: 40, backgroundColor: '#0ea5e9', borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 28,
  },
  primaryBtnText: { color: '#000', fontWeight: '700', fontSize: 15 },
});
