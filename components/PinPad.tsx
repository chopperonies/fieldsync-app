import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Vibration } from 'react-native';

type Props = {
  title: string;
  subtitle?: string;
  confirm?: boolean;          // if true, collects PIN twice and returns when they match
  onSubmit: (pin: string) => Promise<boolean> | boolean; // return true to clear/close, false to show error
  error?: string | null;
  extra?: React.ReactNode;    // extra buttons below (e.g. "Use Face ID")
};

const DIGITS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
const PIN_LENGTH = 4;

export default function PinPad({ title, subtitle, confirm, onSubmit, error, extra }: Props) {
  const [pin, setPin] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [firstPin, setFirstPin] = useState('');
  const [localErr, setLocalErr] = useState<string | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => { setLocalErr(null); }, [pin]);

  const displayErr = error || localErr;

  async function commit(fullPin: string) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      if (confirm && !confirming) {
        setFirstPin(fullPin);
        setConfirming(true);
        setPin('');
      } else if (confirm && confirming) {
        if (fullPin !== firstPin) {
          setLocalErr('PINs don\'t match. Start over.');
          setConfirming(false);
          setFirstPin('');
          setPin('');
          Vibration.vibrate(120);
        } else {
          const ok = await onSubmit(fullPin);
          if (ok) { setPin(''); setFirstPin(''); setConfirming(false); }
        }
      } else {
        const ok = await onSubmit(fullPin);
        if (ok) { setPin(''); } else { Vibration.vibrate(120); setPin(''); }
      }
    } finally {
      submittingRef.current = false;
    }
  }

  function press(d: string) {
    if (d === '') return;
    if (d === '⌫') { setPin(p => p.slice(0, -1)); return; }
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + d;
    setPin(next);
    if (next.length === PIN_LENGTH) {
      // Give the UI a tick to show the last dot before committing.
      setTimeout(() => commit(next), 120);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {confirm && confirming ? <Text style={styles.subtitle}>Enter the PIN again to confirm.</Text> : null}

      <View style={styles.dots}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
        ))}
      </View>

      {displayErr ? <Text style={styles.err}>{displayErr}</Text> : null}

      <View style={styles.grid}>
        {DIGITS.map((d, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.key, !d && styles.keyGhost]}
            disabled={!d}
            onPress={() => press(d)}
            activeOpacity={0.6}
          >
            <Text style={styles.keyText}>{d}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {extra}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#888', fontSize: 14, marginTop: 8, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 16, marginTop: 36, marginBottom: 12 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#2a2a2a' },
  dotFilled: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  err: { color: '#ef4444', fontSize: 13, marginTop: 6, marginBottom: 6, textAlign: 'center' },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    marginTop: 18, gap: 10, width: 260,
  },
  key: {
    width: 76, height: 76, borderRadius: 38,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
  },
  keyGhost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  keyText: { color: '#fff', fontSize: 28, fontWeight: '600' },
});
