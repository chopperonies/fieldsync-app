import { useEffect, useState } from 'react';
import { getUser } from './storage';
import { Role } from './supabase';

// Small hook — returns the current employee role from AsyncStorage.
// Starts as null, resolves asynchronously, stays stable for the
// session. Components using this should default-hide elevated
// features while role is null (i.e. treat null as "crew-safe").

export function useRole(): Role | null {
  const [role, setRole] = useState<Role | null>(null);
  useEffect(() => {
    let cancelled = false;
    getUser().then(u => {
      if (!cancelled) setRole((u?.role as Role) || null);
    });
    return () => { cancelled = true; };
  }, []);
  return role;
}

export function isOwnerRole(role: Role | null): boolean {
  return role === 'owner';
}

export function canEditSettings(role: Role | null): boolean {
  return role === 'owner' || role === 'manager';
}

export function canManageCrew(role: Role | null): boolean {
  return role === 'owner';
}

export function canCreateInvoices(role: Role | null): boolean {
  return role === 'owner' || role === 'manager';
}

export function canSeeFinancials(role: Role | null): boolean {
  return role === 'owner';
}
