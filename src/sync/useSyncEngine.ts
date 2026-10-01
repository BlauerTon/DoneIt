import { useEffect } from 'react';
import type { Profile } from '../auth/profile';
import { supabase } from '../lib/supabase';
import { SyncEngine } from './engine';
import { createSupabaseRemote } from './remote';
import { setSyncStatus } from './status';

let active: SyncEngine | null = null;

/** Ask the running engine (if any) to sync now, e.g. from a "Sync now" button. */
export function syncNow(): void {
  active?.requestSync(0);
}

/** Runs a sync engine for the signed-in cloud user; device-only profiles never sync. */
export function useSyncEngine(profile: Profile | null): void {
  const userId = profile?.kind === 'cloud' ? profile.id : null;
  const hasProfile = profile !== null;

  useEffect(() => {
    if (!hasProfile) return;
    if (!userId || !supabase) {
      setSyncStatus({ state: 'local', lastSyncedAt: null, message: undefined });
      return;
    }
    const engine = new SyncEngine({ userId, remote: createSupabaseRemote(supabase) });
    active = engine;
    setSyncStatus({ state: 'idle', lastSyncedAt: null, message: undefined });
    engine.start();

    // Signing in again after a session expired should flush the queue straight away.
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') engine.requestSync(0);
    });
    return () => {
      data.subscription.unsubscribe();
      engine.stop();
      if (active === engine) active = null;
    };
  }, [userId, hasProfile]);
}
