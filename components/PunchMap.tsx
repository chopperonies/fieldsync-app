import { useEffect, useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet, Linking, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getUser } from '../lib/storage';
import { useTheme } from '../lib/themeContext';
import { Theme } from '../lib/theme';

const API_BASE = 'https://linkcrew.io';

export type MapPin = {
  lat: number;
  lng: number;
  kind: 'in' | 'out';
  label?: string;      // single letter shown on the pin
  name?: string;       // tooltip/detail
  at?: string | null;
  active?: boolean;
};

type Props = {
  pins: MapPin[];
  title?: string;
  subtitle?: string;
  height?: number;
  emptyLabel?: string;
};

function mapsDeepLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export default function PunchMap({
  pins, title, subtitle, height = 180, emptyLabel = 'No clock-ins yet today',
}: Props) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    getUser().then(u => setToken((u as any)?.mobile_session_token || null));
  }, []);

  if (pins.length === 0) {
    return (
      <View style={[styles.wrap, { height }]}>
        <View style={styles.empty}>
          <Ionicons name="map-outline" size={28} color={theme.textMuted} />
          <Text style={styles.emptyText}>{emptyLabel}</Text>
        </View>
      </View>
    );
  }

  // Build pin string: "lat,lng,color,label|..."
  const pinString = pins.slice(0, 30).map((p) => {
    const color = p.kind === 'in' ? 'green' : 'red';
    const label = (p.label || '').slice(0, 1).toUpperCase();
    return `${p.lat},${p.lng},${color}${label ? ',' + label : ''}`;
  }).join('|');

  const screenW = Math.round(Dimensions.get('window').width);
  const size = `${Math.min(640, screenW * 2)}x${height * 2}`; // physical px; scale=2 handles retina
  const uri = `${API_BASE}/api/mobile/map?size=${size}&scale=2&pins=${encodeURIComponent(pinString)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;

  const first = pins[0];

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => Linking.openURL(mapsDeepLink(first.lat, first.lng))}
      >
        <Image
          source={{ uri }}
          style={{ width: '100%', height, backgroundColor: theme.surfaceInset }}
          resizeMode="cover"
        />
        {title || subtitle ? (
          <View style={styles.overlay}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        ) : null}
        <View style={styles.openChip}>
          <Ionicons name="open-outline" size={12} color={theme.textPrimary} />
          <Text style={styles.openChipText}>Open</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    wrap: {
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
    },
    empty: {
      flex: 1,
      alignItems: 'center', justifyContent: 'center', gap: 6,
      backgroundColor: t.surfaceInset,
    },
    emptyText: { color: t.textMuted, fontSize: 13, fontWeight: '600' },
    overlay: {
      position: 'absolute', bottom: 8, left: 10, right: 10,
      padding: 8,
      borderRadius: 10,
      backgroundColor: t.isDark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.9)',
    },
    title: { color: t.textPrimary, fontSize: 13, fontWeight: '800' },
    subtitle: { color: t.textSecondary, fontSize: 11, fontWeight: '600', marginTop: 1 },
    openChip: {
      position: 'absolute', top: 8, right: 8,
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 8, paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: t.isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.92)',
    },
    openChipText: { color: t.textPrimary, fontSize: 11, fontWeight: '800' },
  });
}
