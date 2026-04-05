import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const QUEUE_KEY = 'offline_action_queue';

export interface QueuedAction {
  id: string;
  type: 'checkin' | 'checkout';
  payload: Record<string, any>;
  ts: string;
}

export async function enqueue(type: QueuedAction['type'], payload: Record<string, any>): Promise<void> {
  try {
    const queue = await getQueue();
    queue.push({ id: Date.now().toString(), type, payload, ts: new Date().toISOString() });
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

export async function getQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function getQueueCount(): Promise<number> {
  const q = await getQueue();
  return q.length;
}

async function removeFromQueue(id: string): Promise<void> {
  const queue = await getQueue();
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.filter(a => a.id !== id)));
}

// Flushes all queued actions to Supabase — call this when network is restored
export async function syncQueue(): Promise<number> {
  const queue = await getQueue();
  if (!queue.length) return 0;

  let synced = 0;
  for (const action of queue) {
    try {
      if (action.type === 'checkin') {
        await supabase.from('job_assignments').upsert(action.payload, { onConflict: 'job_id,employee_id' });
        await supabase.from('job_updates').insert({
          job_id: action.payload.job_id,
          employee_id: action.payload.employee_id,
          tenant_id: action.payload.tenant_id,
          type: 'checkin',
          message: `${action.payload.employee_name} checked in (offline sync)`,
        });
      } else if (action.type === 'checkout') {
        await supabase.from('job_assignments')
          .update({ checked_out_at: action.payload.checked_out_at })
          .eq('job_id', action.payload.job_id)
          .eq('employee_id', action.payload.employee_id);
        await supabase.from('job_updates').insert({
          job_id: action.payload.job_id,
          employee_id: action.payload.employee_id,
          tenant_id: action.payload.tenant_id,
          type: 'checkout',
          message: `${action.payload.employee_name} checked out (offline sync)`,
        });
      }
      await removeFromQueue(action.id);
      synced++;
    } catch {}
  }
  return synced;
}
