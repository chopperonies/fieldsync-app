import AsyncStorage from '@react-native-async-storage/async-storage';

const TTL = 60 * 60 * 1000; // 1 hour

export async function setCache(key: string, data: any): Promise<void> {
  try {
    await AsyncStorage.setItem('cache_' + key, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

export async function getCache<T>(key: string, maxAge = TTL): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem('cache_' + key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > maxAge) return null;
    return data as T;
  } catch {
    return null;
  }
}

// Returns stale cache regardless of age — used as offline fallback
export async function getStaleCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem('cache_' + key);
    if (!raw) return null;
    return JSON.parse(raw).data as T;
  } catch {
    return null;
  }
}
