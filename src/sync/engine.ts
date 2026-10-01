import { db as defaultDb, getMeta, setMeta, type PlannerDB } from '../data/db';
import { onLocalChange } from '../data/tasks';
import type { Task } from '../data/types';
import { RejectedError, fromRemote, toRemote, type Remote, type RemoteRow } from './remote';
import { setSyncStatus } from './status';

const PUSH_BATCH = 100;
const PULL_PAGE = 500;
/** Re-read a little before the cursor so rows from transactions that committed late are not missed. */
const CURSOR_OVERLAP_MS = 2 * 60 * 1000;
const PERIODIC_SYNC_MS = 60 * 1000;
const MAX_RETRY_MS = 60 * 1000;

export interface SyncEngineOptions {
  userId: string;
  remote: Remote;
  db?: PlannerDB;
  isOnline?: () => boolean;
}

/**
 * Keeps the on-device database and Supabase in step.
 *
 *  push: every task marked dirty is upserted. The server ignores writes older than its own copy
 *        (see the migration), and when that happens the server's newer version is pulled down.
 *  pull: rows changed since the last cursor are applied, unless the local copy has unsent edits.
 *
 * Runs on start, when the device comes back online, when the app regains focus, shortly after any
 * local edit, on a timer, and when realtime reconnects. Failures never lose data: dirty rows stay
 * dirty until the server acknowledges them.
 */
export class SyncEngine {
  private readonly userId: string;
  private readonly remote: Remote;
  private readonly db: PlannerDB;
  private readonly isOnline: () => boolean;
  private readonly cursorKey: string;

  private running = false;
  private rerun = false;
  private started = false;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private interval: ReturnType<typeof setInterval> | undefined;
  private retryDelay = 0;
  private unsubscribeRealtime: (() => void) | undefined;
  private unsubscribeLocal: (() => void) | undefined;
  private subscribedOnce = false;
  /** Rows the server permanently rejected this session; kept locally but not retried in a loop. */
  private readonly rejected = new Set<string>();

  constructor(options: SyncEngineOptions) {
    this.userId = options.userId;
    this.remote = options.remote;
    this.db = options.db ?? defaultDb;
    this.isOnline = options.isOnline ?? (() => navigator.onLine);
    this.cursorKey = `${this.userId}:cursor`;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.stopped = false;
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.unsubscribeLocal = onLocalChange(() => this.requestSync(400));
    this.interval = setInterval(() => this.requestSync(0), PERIODIC_SYNC_MS);
    this.requestSync(0);
  }

  stop(): void {
    this.stopped = true;
    this.started = false;
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.unsubscribeLocal?.();
    this.unsubscribeRealtime?.();
    this.unsubscribeRealtime = undefined;
    clearTimeout(this.timer);
    clearInterval(this.interval);
  }

  requestSync(delayMs = 0): void {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.sync(), delayMs);
  }

  async sync(): Promise<void> {
    if (this.stopped) return;
    if (this.running) {
      this.rerun = true;
      return;
    }
    if (!this.isOnline()) {
      setSyncStatus({ state: 'offline' });
      return;
    }
    this.running = true;
    setSyncStatus({ state: 'syncing' });
    try {
      if (!(await this.remote.hasSession())) {
        setSyncStatus({ state: 'unauthenticated' });
        return;
      }
      this.ensureRealtime();
      await this.push();
      await this.pull();
      this.retryDelay = 0;
      setSyncStatus({ state: 'synced', lastSyncedAt: Date.now(), message: undefined });
    } catch (err) {
      if (!this.isOnline()) {
        setSyncStatus({ state: 'offline' });
      } else {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[sync] failed, will retry:', message);
        this.retryDelay = Math.min(MAX_RETRY_MS, Math.max(5000, this.retryDelay * 2));
        setSyncStatus({ state: 'error', message });
        this.requestSync(this.retryDelay);
      }
    } finally {
      this.running = false;
      if (this.rerun && !this.stopped) {
        this.rerun = false;
        this.requestSync(0);
      }
    }
  }

  private async push(): Promise<void> {
    const dirty = (await this.db.tasks.where('[userId+dirty]').equals([this.userId, 1]).toArray()).filter(
      (t) => !this.rejected.has(t.id),
    );
    for (let i = 0; i < dirty.length; i += PUSH_BATCH) {
      const batch = dirty.slice(i, i + PUSH_BATCH);
      let accepted: RemoteRow[];
      try {
        accepted = await this.remote.upsert(batch.map(toRemote));
      } catch (err) {
        if (!(err instanceof RejectedError)) throw err;
        accepted = await this.pushIndividually(batch);
      }
      const acceptedIds = new Set(accepted.map((r) => r.id));
      // Rows the server skipped lost to a newer edit from another device: adopt the server copy.
      const lost = batch.filter((t) => !acceptedIds.has(t.id) && !this.rejected.has(t.id));
      const winners = new Map((await this.remote.fetchByIds(lost.map((t) => t.id))).map((r) => [r.id, r]));

      await this.db.transaction('rw', this.db.tasks, async () => {
        for (const sent of batch) {
          const current = await this.db.tasks.get(sent.id);
          // Edited again while the request was in flight: leave dirty for the next round.
          if (!current || current.updatedAt !== sent.updatedAt) continue;
          if (acceptedIds.has(sent.id)) {
            if (current.deleted) await this.db.tasks.delete(sent.id);
            else await this.db.tasks.update(sent.id, { dirty: 0 });
          } else if (winners.has(sent.id)) {
            await this.writeRemote(winners.get(sent.id)!);
          } else if (!this.rejected.has(sent.id)) {
            this.rejected.add(sent.id);
          }
        }
      });
    }
  }

  private async pushIndividually(batch: Task[]): Promise<RemoteRow[]> {
    const accepted: RemoteRow[] = [];
    for (const task of batch) {
      try {
        accepted.push(...(await this.remote.upsert([toRemote(task)])));
      } catch (err) {
        if (!(err instanceof RejectedError)) throw err;
        console.warn(`[sync] server rejected task ${task.id}:`, err.message);
        this.rejected.add(task.id);
      }
    }
    return accepted;
  }

  private async pull(): Promise<void> {
    const cursor = await getMeta(this.cursorKey);
    const since = cursor ? new Date(Date.parse(cursor) - CURSOR_OVERLAP_MS).toISOString() : null;
    let newest = cursor;
    for (let offset = 0; ; offset += PULL_PAGE) {
      const rows = await this.remote.fetchChanges(this.userId, since, offset, PULL_PAGE);
      await this.db.transaction('rw', this.db.tasks, async () => {
        for (const row of rows) await this.applyRemote(row);
      });
      for (const row of rows) {
        if (!newest || Date.parse(row.updated_at) > Date.parse(newest)) newest = row.updated_at;
      }
      if (rows.length < PULL_PAGE) break;
    }
    if (newest && newest !== cursor) await setMeta(this.cursorKey, newest);
  }

  /** Applies a server row unless this device has edits to it that have not been sent yet. */
  private async applyRemote(row: RemoteRow): Promise<void> {
    if (row.user_id !== this.userId) return;
    const local = await this.db.tasks.get(row.id);
    if (local?.dirty) return;
    await this.writeRemote(row);
  }

  private async writeRemote(row: RemoteRow): Promise<void> {
    if (row.deleted) await this.db.tasks.delete(row.id);
    else await this.db.tasks.put(fromRemote(row));
  }

  private ensureRealtime(): void {
    if (this.unsubscribeRealtime) return;
    this.unsubscribeRealtime = this.remote.subscribe(
      this.userId,
      (row) => {
        void this.db.transaction('rw', this.db.tasks, () => this.applyRemote(row));
      },
      () => {
        // After a reconnect, catch up on anything the live feed missed.
        if (this.subscribedOnce) this.requestSync(0);
        this.subscribedOnce = true;
      },
    );
  }

  private handleOnline = () => this.requestSync(0);
  private handleOffline = () => setSyncStatus({ state: 'offline' });
  private handleVisibility = () => {
    if (document.visibilityState === 'visible') this.requestSync(0);
  };
}
