import { Linking } from 'react-native';

// Normalize a phone number for `tel:` / `sms:` deep links.
// Keeps digits and a leading +, drops everything else.
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw).replace(/[^\d+]/g, '');
}

export function callNumber(phone: string | null | undefined) {
  const p = normalizePhone(phone);
  if (!p) return;
  Linking.openURL(`tel:${p}`);
}

export function textNumber(phone: string | null | undefined, body?: string) {
  const p = normalizePhone(phone);
  if (!p) return;
  const suffix = body ? `?body=${encodeURIComponent(body)}` : '';
  Linking.openURL(`sms:${p}${suffix}`);
}
