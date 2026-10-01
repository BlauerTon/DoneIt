import type { User } from '@supabase/supabase-js';
import { LOCAL_USER_ID } from '../data/types';

/**
 * Who is using the planner on this device. Cached in localStorage so the app can open straight
 * into the user's tasks with no network, even after the Supabase access token has expired.
 */
export interface Profile {
  id: string;
  kind: 'cloud' | 'local';
  name: string;
  email: string;
}

const KEY = 'doneit_profile';

export const LOCAL_PROFILE: Profile = { id: LOCAL_USER_ID, kind: 'local', name: '', email: '' };

export function profileFromUser(user: User): Profile {
  const meta = user.user_metadata ?? {};
  const email = user.email ?? '';
  const name = (meta.full_name as string) || (meta.name as string) || email.split('@')[0] || 'User';
  return { id: user.id, kind: 'cloud', name, email };
}

export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Profile;
    return p && typeof p.id === 'string' && (p.kind === 'cloud' || p.kind === 'local') ? p : null;
  } catch {
    return null;
  }
}

export function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: the session still works for this visit */
  }
}

export function clearProfile(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function initials(name: string, email: string): string {
  const source = name.trim() || email;
  if (!source) return 'ME';
  const parts = source.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}
