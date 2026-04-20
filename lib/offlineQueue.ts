import AsyncStorage from '@react-native-async-storage/async-storage';
import { mobilePost } from './mobileApi';

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

// Flushes all queued actions through the mobile API when network is restored.
export async function syncQueue(): Promise<number> {
  const queue = await getQueue();
  if (!queue.length) return 0;

  let synced = 0;
  for (const action of queue) {
    try {
      const gps = action.payload.punch_in_lat != null || action.payload.punch_out_lat != null
        ? {
            lat: action.payload.punch_in_lat ?? action.payload.punch_out_lat,
            lng: action.payload.punch_in_lng ?? action.payload.punch_out_lng,
          }
        : null;
      if (action.type === 'checkin') {
        await mobilePost(`/api/mobile/crew/jobs/${action.payload.job_id}/check-in`, { gps });
      } else if (action.type === 'checkout') {
        await mobilePost(`/api/mobile/crew/jobs/${action.payload.job_id}/check-out`, { gps });
      }
      await removeFromQueue(action.id);
      synced++;
    } catch {}
  }
  return synced;
}
