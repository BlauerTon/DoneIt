import { useSyncExternalStore } from 'react';

export type SyncState =
  | 'local' // no account: tasks live on this device only
  | 'idle' // engine not started yet
  | 'offline'
  | 'syncing'
  | 'synced'
  | 'error' // server problem; retrying with backoff
  | 'unauthenticated'; // session expired; changes keep queueing until the user signs in again

export interface SyncStatus {
  state: SyncState;
  lastSyncedAt: number | null;
  message?: string;
}

let status: SyncStatus = { state: 'idle', lastSyncedAt: null };
const listeners = new Set<() => void>();

export function setSyncStatus(next: Partial<SyncStatus>): void {
  status = { ...status, ...next };
  listeners.forEach((l) => l());
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}
