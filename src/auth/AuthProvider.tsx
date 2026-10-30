import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { adoptLocalTasks, clearUserData } from '../data/tasks';
import { appUrl, authRedirect, clearAuthRedirect, supabase } from '../lib/supabase';
import { removePushSubscription } from '../reminders/push';
import {
  LOCAL_PROFILE,
  clearProfile,
  loadProfile,
  profileFromUser,
  saveProfile,
  type Profile,
} from './profile';

/** `recovery`: opened from a password reset email; the user must choose a new password. */
type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'recovery';

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
  /** Emails a reset link. Returns an error message, or null once the email is on its way. */
  requestPasswordReset(email: string): Promise<string | null>;
  /** Email of the account being reset while `status` is `recovery`. */
  recoveryEmail: string;
  /** Sets the new password at the end of a reset and opens the planner. */
  updatePassword(password: string): Promise<string | null>;
  cancelRecovery(): Promise<void>;
  /** Why an email link that opened the app was rejected (e.g. it expired). */
  linkError: string | null;
  clearLinkError(): void;
  continueLocally(): void;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Asks the browser not to evict IndexedDB under storage pressure, so offline tasks are safe. */
function requestPersistentStorage() {
  void navigator.storage?.persist?.().catch(() => undefined);
}

const OFFLINE_SIGN_IN = "You're offline. Connect to the internet to sign in, or continue without an account.";
const OFFLINE_RESET = "You're offline. Connect to the internet to reset your password.";

function friendlyError(message: string, offline = OFFLINE_SIGN_IN): string {
  if (!navigator.onLine || /fetch|network/i.test(message)) return offline;
  return message;
}

/** Status before Supabase answers. A reset link waits for its session instead of opening the planner. */
function initialStatus(): AuthStatus {
  if (supabase && authRedirect.recovery) return 'loading';
  if (loadProfile()) return 'signedIn';
  return supabase ? 'loading' : 'signedOut';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(loadProfile);
  const [status, setStatus] = useState<AuthStatus>(initialStatus);
  const [recoveryUser, setRecoveryUser] = useState<{ id: string; email: string } | null>(null);
  const [linkError, setLinkError] = useState(authRedirect.error);

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
    const settle = () => setStatus((s) => (s === 'loading' ? (loadProfile() ? 'signedIn' : 'signedOut') : s));
    const startRecovery = (user: { id: string; email?: string }) => {
      setRecoveryUser({ id: user.id, email: user.email ?? '' });
      setStatus('recovery');
    };

    // A cached profile already let the UI open (offline-friendly). This only upgrades it:
    // it picks up an existing v1 session and refreshes the display name.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        if (authRedirect.error) clearAuthRedirect();
        const cached = loadProfile();
        const user = data.session?.user;
        if (user && authRedirect.recovery) startRecovery(user);
        else if (user && cached?.kind !== 'local') activate(profileFromUser(user));
        else settle();
      })
      .catch(() => {
        if (!cancelled) settle();
      });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session?.user) return startRecovery(session.user);
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

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!supabase) return 'Cloud sync is not configured for this build.';
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl() });
      return error ? friendlyError(error.message, OFFLINE_RESET) : null;
    } catch (err) {
      return friendlyError(err instanceof Error ? err.message : 'Failed to send the reset email.', OFFLINE_RESET);
    }
  }, []);

  const updatePassword = useCallback(
    async (password: string) => {
      if (!supabase) return 'Cloud sync is not configured for this build.';
      try {
        const { data, error } = await supabase.auth.updateUser({ password });
        if (error) return friendlyError(error.message, OFFLINE_RESET);
        const next = profileFromUser(data.user);
        if (loadProfile()?.kind === 'local') await adoptLocalTasks(next.id);
        setRecoveryUser(null);
        activate(next);
        return null;
      } catch (err) {
        return friendlyError(err instanceof Error ? err.message : 'Failed to update your password.', OFFLINE_RESET);
      }
    },
    [activate],
  );

  const cancelRecovery = useCallback(async () => {
    const cached = loadProfile();
    // The link signed this device in. Keep that session only if it is the account already open here.
    if (supabase && !(cached?.kind === 'cloud' && cached.id === recoveryUser?.id)) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
    setRecoveryUser(null);
    setStatus(cached ? 'signedIn' : 'signedOut');
  }, [recoveryUser]);

  const clearLinkError = useCallback(() => setLinkError(null), []);

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
    () => ({
      status,
      profile,
      cloudAvailable: !!supabase,
      signIn,
      signUp,
      requestPasswordReset,
      recoveryEmail: recoveryUser?.email ?? '',
      updatePassword,
      cancelRecovery,
      linkError,
      clearLinkError,
      continueLocally,
      signOut,
    }),
    [
      status,
      profile,
      signIn,
      signUp,
      requestPasswordReset,
      recoveryUser,
      updatePassword,
      cancelRecovery,
      linkError,
      clearLinkError,
      continueLocally,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
