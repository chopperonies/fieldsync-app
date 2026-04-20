import { getUser } from './storage';

const API_BASE = 'https://linkcrew.io';

async function headers(): Promise<Record<string, string>> {
  const user = await getUser();
  const token = (user as any)?.mobile_session_token;
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function mobileGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: await headers() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `GET ${path} failed: ${res.status}`);
  }
  return res.json();
}

export async function mobilePost<T = any>(path: string, body: any = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `POST ${path} failed: ${res.status}`);
  }
  return res.json();
}

export async function mobilePatch<T = any>(path: string, body: any = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: await headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `PATCH ${path} failed: ${res.status}`);
  }
  return res.json();
}
