import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { clearUser } from '../../lib/storage';
import LockSettings from '../../components/LockSettings';

async function logout() {
  await clearUser();
  router.replace('/login');
}

export default function CrewSettings() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.sectionLabel}>Security</Text>
      <LockSettings />

      <View style={styles.divider} />

      <TouchableOpacity style={styles.signOut} onPress={logout}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  sectionLabel: { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 4, marginTop: 8 },
  divider: { height: 1, backgroundColor: '#2a2a2a', marginVertical: 24 },
  signOut: {
    borderWidth: 1, borderColor: '#ef4444', borderRadius: 12,
    padding: 14, alignItems: 'center',
  },
  signOutText: { color: '#ef4444', fontWeight: '700', fontSize: 15 },
});
