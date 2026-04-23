import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/themeContext';

// First-launch chooser. Everyone hits this before login/signup so the
// two paths are obvious: owners create a new business account; crew go
// to phone login.
export default function Landing() {
  const theme = useTheme();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={{ marginBottom: 40 }}>
          <Text style={[styles.brand, { color: theme.accent }]}>LinkCrew</Text>
          <Text style={[styles.tagline, { color: theme.textMuted }]}>Field crew management</Text>
        </View>

        <Text style={[styles.prompt, { color: theme.textPrimary }]}>
          Are you starting a new business or joining an existing team?
        </Text>

        <TouchableOpacity
          style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.accent + '55' }]}
          activeOpacity={0.8}
          onPress={() => router.push('/signup' as any)}
        >
          <View style={[styles.iconWrap, { backgroundColor: theme.accent + '18' }]}>
            <Ionicons name="rocket-outline" size={26} color={theme.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Start a new business</Text>
            <Text style={[styles.cardBody, { color: theme.textMuted }]}>
              Create your company account. 14-day free trial. No card required.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.accent} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
          activeOpacity={0.8}
          onPress={() => router.push('/login')}
        >
          <View style={[styles.iconWrap, { backgroundColor: theme.textMuted + '18' }]}>
            <Ionicons name="people-outline" size={26} color={theme.textSecondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Join my team</Text>
            <Text style={[styles.cardBody, { color: theme.textMuted }]}>
              Your manager added you by phone number. Sign in with that phone.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </TouchableOpacity>

        <Text style={[styles.foot, { color: theme.textMuted }]}>
          By continuing you agree to the Terms of Service and Privacy Policy.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 28, paddingBottom: 60 },
  brand: { fontSize: 40, fontWeight: '800', letterSpacing: -0.5 },
  tagline: { fontSize: 15, marginTop: 4 },
  prompt: { fontSize: 18, fontWeight: '700', marginBottom: 20, lineHeight: 25 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1, borderRadius: 16, padding: 18, marginBottom: 14,
  },
  iconWrap: {
    width: 52, height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  cardBody: { fontSize: 13, lineHeight: 18 },
  foot: { fontSize: 11, textAlign: 'center', marginTop: 24, lineHeight: 16 },
});
