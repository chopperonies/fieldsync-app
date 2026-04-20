import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import PinPad from './PinPad';
import { isBiometricAvailable, authenticate } from '../lib/biometric';
import { setLockMethod, setPin } from '../lib/storage';

type Props = { onDone: () => void };
type Step = 'choose' | 'pin-create';

export default function LockSetup({ onDone }: Props) {
  const [step, setStep] = useState<Step>('choose');
  const [bioAvailable, setBioAvailable] = useState(false);

  useEffect(() => {
    isBiometricAvailable().then(setBioAvailable);
  }, []);

  async function pickBiometric() {
    const ok = await authenticate('Confirm to enable biometric lock');
    if (!ok) return;
    await setLockMethod('biometric');
    onDone();
  }

  async function pickNone() {
    await setLockMethod('none');
    onDone();
  }

  if (step === 'pin-create') {
    return (
      <View style={styles.container}>
        <PinPad
          title="Create a PIN"
          subtitle="Pick a 4-digit PIN to unlock the app."
          confirm
          onSubmit={async (pin) => {
            await setPin(pin);
            await setLockMethod('pin');
            onDone();
            return true;
          }}
          extra={
            <TouchableOpacity onPress={() => setStep('choose')} style={styles.backBtn}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.title}>Secure your app</Text>
        <Text style={styles.sub}>Pick how you'd like to unlock LinkCrew when you reopen it. You can change this anytime in Settings.</Text>

        {bioAvailable && (
          <TouchableOpacity style={styles.card} onPress={pickBiometric}>
            <Text style={styles.cardTitle}>Face / Fingerprint</Text>
            <Text style={styles.cardBody}>Fastest. Uses your device's biometric sensor.</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.card} onPress={() => setStep('pin-create')}>
          <Text style={styles.cardTitle}>4-digit PIN</Text>
          <Text style={styles.cardBody}>Works with gloves and in dusty conditions. Recommended for crew.</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.ghost} onPress={pickNone}>
          <Text style={styles.ghostText}>Not now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0a0a0a',
    zIndex: 9998,
  },
  inner: { flex: 1, justifyContent: 'center', padding: 28 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800', marginBottom: 10 },
  sub: { color: '#888', fontSize: 14, lineHeight: 20, marginBottom: 28 },
  card: {
    backgroundColor: '#111', borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: '#1e1e1e', marginBottom: 12,
  },
  cardTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cardBody: { color: '#888', fontSize: 13, marginTop: 4 },
  ghost: { marginTop: 14, padding: 14, alignItems: 'center' },
  ghostText: { color: '#666', fontSize: 14 },
  backBtn: { marginTop: 22, padding: 12 },
  backText: { color: '#0ea5e9', fontSize: 14 },
});
