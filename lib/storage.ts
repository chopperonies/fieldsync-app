import AsyncStorage from '@react-native-async-storage/async-storage';
import { Employee } from './supabase';

const USER_KEY = 'fieldsync_user';
const PLAN_KEY = 'fieldsync_plan';
const BIOMETRIC_KEY = 'fieldsync_biometric';
const BIOMETRIC_PROMPTED_KEY = 'fieldsync_biometric_prompted';
const LOGIN_ROLE_KEY = 'fieldsync_login_role';
const LOCK_METHOD_KEY = 'fieldsync_lock_method';
const PIN_KEY = 'fieldsync_pin';

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
  await AsyncStorage.removeItem(PIN_KEY);
  await AsyncStorage.removeItem(LOCK_METHOD_KEY);
  await AsyncStorage.removeItem(BIOMETRIC_PROMPTED_KEY);
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

export async function getBiometricEnabled(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(BIOMETRIC_KEY);
  return raw === 'true';
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(BIOMETRIC_KEY, enabled ? 'true' : 'false');
}

export async function getBiometricPrompted(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(BIOMETRIC_PROMPTED_KEY);
  return raw === 'true';
}

export async function setBiometricPrompted(): Promise<void> {
  await AsyncStorage.setItem(BIOMETRIC_PROMPTED_KEY, 'true');
}

// Shared "have we asked about app-lock yet?" flag — aliases the biometric
// prompt key so legacy installs don't re-prompt.
export const getLockPrompted = getBiometricPrompted;
export const setLockPrompted = setBiometricPrompted;

// (Removed) getLoginRole / setLoginRole / LoginRole — the unified login
// uses phone only, so we no longer need to remember which tab the user
// picked. The LOGIN_ROLE_KEY in AsyncStorage is left orphaned on
// existing installs and will be ignored.

// App-lock method — crew wears gloves, so PIN is first-class alongside biometric.
export type LockMethod = 'none' | 'biometric' | 'pin';
export async function getLockMethod(): Promise<LockMethod> {
  const raw = await AsyncStorage.getItem(LOCK_METHOD_KEY);
  if (raw === 'biometric' || raw === 'pin' || raw === 'none') return raw;
  // Back-compat with the old biometric-only flag.
  const bio = await AsyncStorage.getItem(BIOMETRIC_KEY);
  return bio === 'true' ? 'biometric' : 'none';
}
export async function setLockMethod(m: LockMethod): Promise<void> {
  await AsyncStorage.setItem(LOCK_METHOD_KEY, m);
  // Keep old biometric key in sync so legacy callers behave right.
  await AsyncStorage.setItem(BIOMETRIC_KEY, m === 'biometric' ? 'true' : 'false');
}

// PIN is obfuscated (not cryptographically secure). Threat model: physical
// phone snatch. The session token already grants all access; PIN is a
// friction layer, not a secret. Anyone with rooted-device access bypasses
// either way.
function encodePin(pin: string): string {
  const salt = Math.random().toString(36).slice(2, 10);
  const body = Array.from(`${salt}:${pin}`).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  return `v1.${salt}.${body}`;
}
function decodePin(stored: string): string | null {
  if (!stored.startsWith('v1.')) return null;
  const parts = stored.split('.');
  if (parts.length !== 3) return null;
  const [, salt, body] = parts;
  let decoded = '';
  for (let i = 0; i < body.length; i += 2) decoded += String.fromCharCode(parseInt(body.slice(i, i + 2), 16));
  const prefix = `${salt}:`;
  return decoded.startsWith(prefix) ? decoded.slice(prefix.length) : null;
}

export async function setPin(pin: string): Promise<void> {
  await AsyncStorage.setItem(PIN_KEY, encodePin(pin));
}
export async function verifyPin(pin: string): Promise<boolean> {
  const stored = await AsyncStorage.getItem(PIN_KEY);
  if (!stored) return false;
  const actual = decodePin(stored);
  return actual === pin;
}
export async function hasPin(): Promise<boolean> {
  return !!(await AsyncStorage.getItem(PIN_KEY));
}
export async function clearPin(): Promise<void> {
  await AsyncStorage.removeItem(PIN_KEY);
}
