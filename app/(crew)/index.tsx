import { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator
} from 'react-native';
import { supabase, Job } from '../../lib/supabase';
import { getUser } from '../../lib/storage';

export default function CheckIn() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [checkedInJob, setCheckedInJob] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadJobs();
    loadCurrentAssignment();
  }, []);

  async function loadJobs() {
    const { data } = await supabase.from('jobs').select('*').eq('status', 'active').order('name');
    setJobs(data || []);
    setLoading(false);
  }

  async function loadCurrentAssignment() {
    const user = await getUser();
    if (!user) return;
    const { data } = await supabase
      .from('job_assignments')
      .select('job_id')
      .eq('employee_id', user.id)
      .is('checked_out_at', null)
      .single();
    if (data) setCheckedInJob(data.job_id);
  }

  async function handleCheckIn(job: Job) {
    const user = await getUser();
    if (!user) return;
    setActionLoading(true);
    try {
      await supabase.from('job_assignments').upsert({
        job_id: job.id,
        employee_id: user.id,
        checked_in_at: new Date().toISOString(),
        checked_out_at: null,
      }, { onConflict: 'job_id,employee_id' });

      await supabase.from('job_updates').insert({
        job_id: job.id,
        employee_id: user.id,
        type: 'checkin',
        message: `${user.name} checked in`,
      });

      setCheckedInJob(job.id);
      Alert.alert('Checked in!', `You're now on site at ${job.name}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCheckOut(job: Job) {
    const user = await getUser();
    if (!user) return;
    setActionLoading(true);
    try {
      await supabase.from('job_assignments')
        .update({ checked_out_at: new Date().toISOString() })
        .eq('job_id', job.id)
        .eq('employee_id', user.id);

      await supabase.from('job_updates').insert({
        job_id: job.id,
        employee_id: user.id,
        type: 'checkout',
        message: `${user.name} checked out`,
      });

      setCheckedInJob(null);
      Alert.alert('Checked out', `Good work at ${job.name}!`);
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {checkedInJob ? '✅ Currently on site' : '📍 Select a job site'}
      </Text>

      <FlatList
        data={jobs}
        keyExtractor={j => j.id}
        contentContainerStyle={{ gap: 12, padding: 16 }}
        renderItem={({ item }) => {
          const isActive = checkedInJob === item.id;
          return (
            <View style={[styles.card, isActive && styles.cardActive]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.jobName}>{item.name}</Text>
                <Text style={styles.jobAddress}>{item.address}</Text>
              </View>
              <TouchableOpacity
                style={[styles.btn, isActive ? styles.btnOut : styles.btnIn]}
                onPress={() => isActive ? handleCheckOut(item) : handleCheckIn(item)}
                disabled={actionLoading || (!!checkedInJob && !isActive)}
              >
                {actionLoading && isActive
                  ? <ActivityIndicator size="small" color="#000" />
                  : <Text style={styles.btnText}>{isActive ? 'Check Out' : 'Check In'}</Text>
                }
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  label: { color: '#888', fontSize: 14, padding: 16, paddingBottom: 4 },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  cardActive: { borderColor: '#f97316' },
  jobName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  jobAddress: { color: '#666', fontSize: 13, marginTop: 2 },
  btn: { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, minWidth: 90, alignItems: 'center' },
  btnIn: { backgroundColor: '#f97316' },
  btnOut: { backgroundColor: '#ef4444' },
  btnText: { color: '#000', fontWeight: '700', fontSize: 13 },
});
