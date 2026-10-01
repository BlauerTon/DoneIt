import { usePendingCount } from '../data/tasks';
import { useOnline } from '../hooks/useOnline';
import { useSyncStatus, type SyncState } from '../sync/status';
import { syncNow } from '../sync/useSyncEngine';
import { CloudIcon, CloudOffIcon, DeviceIcon, RefreshIcon } from './icons';

interface Described {
  label: string;
  detail: string;
  tone: 'ok' | 'muted' | 'warn' | 'busy';
}

function describe(state: SyncState, online: boolean, pending: number, lastSyncedAt: number | null): Described {
  const queued = pending === 1 ? '1 change saved on this device' : `${pending} changes saved on this device`;
  if (state === 'local') return { label: 'On this device', detail: 'Sign in to back up and sync', tone: 'muted' };
  if (!online || state === 'offline') {
    return { label: 'Offline', detail: pending ? `${queued}, will sync later` : 'All tasks available offline', tone: 'muted' };
  }
  if (state === 'unauthenticated') {
    return { label: 'Sign in to sync', detail: pending ? queued : 'Your session expired', tone: 'warn' };
  }
  if (state === 'error') return { label: 'Sync paused', detail: pending ? `${queued}, retrying` : 'Retrying shortly', tone: 'warn' };
  // Routine background syncs with nothing to send should not flicker the indicator.
  if ((state === 'syncing' || state === 'idle') && (pending > 0 || !lastSyncedAt)) {
    return { label: 'Syncing…', detail: pending ? queued : 'Fetching your tasks', tone: 'busy' };
  }
  if (pending) return { label: 'Syncing…', detail: queued, tone: 'busy' };
  return { label: 'Synced', detail: lastSyncedAt ? `Up to date · ${timeAgo(lastSyncedAt)}` : 'Up to date', tone: 'ok' };
}

function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const dotClass = {
  ok: 'bg-[#3FB177]',
  muted: 'bg-muted',
  warn: 'bg-[#E5BA1E]',
  busy: 'bg-accent animate-pulse',
};

/** Unobtrusive one-line sync state with an action when the user can do something about it. */
export function SyncIndicator({ userId, onSignIn }: { userId: string; onSignIn: () => void }) {
  const status = useSyncStatus();
  const online = useOnline();
  const pending = usePendingCount(status.state === 'local' ? null : userId);
  const d = describe(status.state, online, pending, status.lastSyncedAt);
  const Icon = status.state === 'local' ? DeviceIcon : !online || status.state === 'offline' ? CloudOffIcon : CloudIcon;
  const needsSignIn = status.state === 'unauthenticated' || status.state === 'local';

  return (
    <div className="flex items-center gap-2.5 rounded-[10px] border border-line bg-card px-3 py-2" data-testid="sync-indicator">
      <span className="relative text-ink-2">
        <Icon size={16} />
        <span className={`absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-card ${dotClass[d.tone]}`} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold text-ink">{d.label}</div>
        <div className="truncate text-[11px] text-muted" title={status.message ?? d.detail}>
          {d.detail}
        </div>
      </div>
      {needsSignIn ? (
        <button type="button" onClick={onSignIn} className="shrink-0 text-[12px] font-semibold text-accent hover:underline dark:text-[#9AA8FF]">
          Sign in
        </button>
      ) : (
        online &&
        status.state !== 'offline' && (
          <button
            type="button"
            onClick={syncNow}
            aria-label="Sync now"
            title="Sync now"
            className="shrink-0 rounded-md p-1 text-muted hover:bg-hover hover:text-ink"
          >
            <RefreshIcon size={14} className={d.tone === 'busy' ? 'animate-spin' : ''} />
          </button>
        )
      )}
    </div>
  );
}
