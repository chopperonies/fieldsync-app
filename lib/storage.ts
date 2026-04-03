import AsyncStorage from '@react-native-async-storage/async-storage';
import { Employee } from './supabase';

const USER_KEY = 'fieldsync_user';
const PLAN_KEY = 'fieldsync_plan';

export async function saveUser(user: Employee) {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function getUser(): Promise<Employee | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function clearUser() {
  await AsyncStorage.removeItem(USER_KEY);
  await AsyncStorage.removeItem(PLAN_KEY);
}

export interface TenantPlan {
  plan: 'solo' | 'team' | 'pro' | 'business' | null;
  subscription_status: 'trialing' | 'active' | 'past_due' | 'canceled' | null;
  max_users: number;
}

export async function savePlan(plan: TenantPlan) {
  await AsyncStorage.setItem(PLAN_KEY, JSON.stringify(plan));
}

export async function getPlan(): Promise<TenantPlan | null> {
  const raw = await AsyncStorage.getItem(PLAN_KEY);
  return raw ? JSON.parse(raw) : null;
}
