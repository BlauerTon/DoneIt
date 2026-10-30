import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * What an email link (password reset) put in the URL. Read before the client is created,
 * because the client consumes the tokens and clears them from the address bar.
 */
export interface AuthRedirect {
  /** The page was opened from a password reset email. */
  recovery: boolean;
  /** The link was rejected (expired, already used), as described by Supabase. */
  error: string | null;
}

function readAuthRedirect(): AuthRedirect {
  if (typeof window === 'undefined') return { recovery: false, error: null };
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  const param = (name: string) => hash.get(name) ?? query.get(name);
  const code = param('error_code');
  const description = param('error_description');
  const error =
    code === 'otp_expired'
      ? 'That email link is invalid or has expired. To reset your password, use "Forgot password?" to get a new link.'
      : description || (param('error') ? 'That email link could not be used. Please try again.' : null);
  return { recovery: param('type') === 'recovery', error };
}

export const authRedirect: AuthRedirect = readAuthRedirect();

/** Where password reset emails send the user back to: this app's start page. */
export function appUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

/** Removes a rejected link's error parameters from the address bar. */
export function clearAuthRedirect(): void {
  history.replaceState(history.state, '', appUrl());
}

/** Null when the app is built without Supabase credentials; it then runs in device-only mode. */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;
