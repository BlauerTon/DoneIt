import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { adoptLocalTasks, clearUserData } from '../data/tasks';
import { supabase } from '../lib/supabase';
import { removePushSubscription } from '../reminders/push';
import {
  LOCAL_PROFILE,
  clearProfile,
  loadProfile,
  profileFromUser,
  saveProfile,
  type Profile,
} from './profile';

type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface SignUpResult {
  error?: string;
  message?: string;
}

interface AuthContextValue {
  status: AuthStatus;
  profile: Profile | null;
  cloudAvailable: boolean;
  signIn(email: string, password: string): Promise<string | null>;
  signUp(name: string, email: string, password: string): Promise<SignUpResult>;
  continueLocally(): void;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Asks the browser not to evict IndexedDB under storage pressure, so offline tasks are safe. */
function requestPersistentStorage() {
  void navigator.storage?.persist?.().catch(() => undefined);
}

function friendlyError(message: string): string {
  if (!navigator.onLine || /fetch|network/i.test(message)) {
    return "You're offline. Connect to the internet to sign in, or continue without an account.";
  }
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(loadProfile);
  const [status, setStatus] = useState<AuthStatus>(() =>
    loadProfile() ? 'signedIn' : supabase ? 'loading' : 'signedOut',
  );

  const activate = useCallback((p: Profile) => {
    saveProfile(p);
    setProfile(p);
    setStatus('signedIn');
    requestPersistentStorage();
  }, []);

  useEffect(() => {
    if (loadProfile()) requestPersistentStorage();
    if (!supabase) return;
    let cancelled = false;

    // A cached profile already let the UI open (offline-friendly). This only upgrades it:
    // it picks up an existing v1 session and refreshes the display name.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        const cached = loadProfile();
        const user = data.session?.user;
        if (user && cached?.kind !== 'local') activate(profileFromUser(user));
        else if (!cached) setStatus('signedOut');
      })
      .catch(() => {
        if (!cancelled && !loadProfile()) setStatus('signedOut');
      });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session?.user || (event !== 'USER_UPDATED' && event !== 'TOKEN_REFRESHED')) return;
      const cached = loadProfile();
      if (cached?.kind === 'cloud' && cached.id === session.user.id) {
        const fresh = profileFromUser(session.user);
        if (fresh.name !== cached.name || fresh.email !== cached.email) activate(fresh);
      }
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [activate]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return 'Cloud sync is not configured for this build.';
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) return friendlyError(error.message);
        const next = profileFromUser(data.user);
        if (loadProfile()?.kind === 'local') await adoptLocalTasks(next.id);
        activate(next);
        return null;
      } catch (err) {
        return friendlyError(err instanceof Error ? err.message : 'Failed to sign in.');
      }
    },
    [activate],
  );

  const signUp = useCallback(
    async (name: string, email: string, password: string): Promise<SignUpResult> => {
      if (!supabase) return { error: 'Cloud sync is not configured for this build.' };
      try {
        const fullName = name.trim() || email.trim().split('@')[0];
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) return { error: friendlyError(error.message) };
        if (data.session && data.user) {
          const next = profileFromUser(data.user);
          if (loadProfile()?.kind === 'local') await adoptLocalTasks(next.id);
          activate(next);
          return {};
        }
        return { message: 'Account created! If confirmation is required, check your email, then sign in.' };
      } catch (err) {
        return { error: friendlyError(err instanceof Error ? err.message : 'Failed to create account.') };
      }
    },
    [activate],
  );

  const continueLocally = useCallback(() => activate(LOCAL_PROFILE), [activate]);

  const signOut = useCallback(async () => {
    const current = loadProfile();
    // Stop this device receiving the previous user's reminders (needs the session, so first).
    await removePushSubscription().catch(() => undefined);
    if (current?.kind === 'cloud' && supabase) {
      // Local scope works offline; it only forgets the session on this device.
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
    if (current) await clearUserData(current.id);
    clearProfile();
    setProfile(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, profile, cloudAvailable: !!supabase, signIn, signUp, continueLocally, signOut }),
    [status, profile, signIn, signUp, continueLocally, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
