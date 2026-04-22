import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { router } from 'expo-router';
import { clearUser } from '../../lib/storage';
import { useTheme } from '../../lib/themeContext';
import LockSettings from '../../components/LockSettings';
import AppearanceSettings from '../../components/AppearanceSettings';

async function logout() {
  await clearUser();
  router.replace('/login');
}

export default function CrewSettings() {
  const theme = useTheme();
  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.bg }]} contentContainerStyle={{ padding: 20 }}>
      <Text style={[styles.sectionLabel, { color: theme.textPrimary }]}>Appearance</Text>
      <AppearanceSettings />

      <View style={[styles.divider, { backgroundColor: theme.borderStrong }]} />

      <Text style={[styles.sectionLabel, { color: theme.textPrimary }]}>Security</Text>
      <LockSettings />

      <View style={[styles.divider, { backgroundColor: theme.borderStrong }]} />

      <Text style={[styles.sectionLabel, { color: theme.textPrimary }]}>Support</Text>
      <TouchableOpacity
        style={[styles.supportBtn, { borderColor: theme.accent }]}
        onPress={() => Linking.openURL('mailto:support@linkcrew.io')}
      >
        <Text style={[styles.supportBtnText, { color: theme.accent }]}>Email support@linkcrew.io</Text>
      </TouchableOpacity>

      <View style={[styles.divider, { backgroundColor: theme.borderStrong }]} />

      <TouchableOpacity style={[styles.signOut, { borderColor: theme.danger }]} onPress={logout}>
        <Text style={[styles.signOutText, { color: theme.danger }]}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionLabel: { fontSize: 17, fontWeight: '700', marginBottom: 8, marginTop: 8 },
  divider: { height: 1, marginVertical: 24 },
  supportBtn: { borderWidth: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
  supportBtnText: { fontWeight: '700', fontSize: 15 },
  signOut: { borderWidth: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
  signOutText: { fontWeight: '700', fontSize: 15 },
});
