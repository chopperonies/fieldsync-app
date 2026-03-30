import AsyncStorage from '@react-native-async-storage/async-storage';
import { Employee } from './supabase';

const USER_KEY = 'fieldsync_user';

export async function saveUser(user: Employee) {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function getUser(): Promise<Employee | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function clearUser() {
  await AsyncStorage.removeItem(USER_KEY);
}
