import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { createTask, deleteTask, updateTask } from '../data/tasks';
import { SyncEngine } from './engine';
import { RejectedError, TransientError, type OutgoingRow, type Remote, type RemoteRow } from './remote';
import { getSyncStatus } from './status';

const USER = '00000000-0000-4000-8000-000000000001';

/** In-memory stand-in for Supabase with the same last-write-wins rule as the database trigger. */
class FakeRemote implements Remote {
  rows = new Map<string, RemoteRow>();
  session = true;
  failWith: Error | null = null;
  rejectIds = new Set<string>();
  private clock = 0;

  private stamp() {
    return new Date(Date.UTC(2026, 9, 1) + ++this.clock * 1000).toISOString();
  }

  async hasSession() {
    return this.session;
  }

  async upsert(rows: OutgoingRow[]) {
    if (this.failWith) throw this.failWith;
    if (rows.some((r) => this.rejectIds.has(r.id))) throw new RejectedError('violates check constraint');
    const accepted: RemoteRow[] = [];
    for (const r of rows) {
      const existing = this.rows.get(r.id);
      if (existing && r.client_updated_at < existing.client_updated_at) continue;
      const row = { ...r, created_at: existing?.created_at ?? r.created_at, updated_at: this.stamp() };
      this.rows.set(r.id, row);
      accepted.push(row);
    }
    return accepted;
  }

  async fetchByIds(ids: string[]) {
    return ids.map((id) => this.rows.get(id)).filter((r): r is RemoteRow => !!r);
  }

  async fetchChanges(userId: string, since: string | null, offset: number, limit: number) {
    if (this.failWith) throw this.failWith;
    return [...this.rows.values()]
      .filter((r) => r.user_id === userId && (!since || r.updated_at > since))
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
      .slice(offset, offset + limit);
  }

  subscribe() {
    return () => undefined;
  }

  /** Simulates an edit made on another device. */
  editFromOtherDevice(id: string, patch: Partial<RemoteRow>, clientUpdatedAt: string) {
    const row = this.rows.get(id)!;
    this.rows.set(id, { ...row, ...patch, client_updated_at: clientUpdatedAt, updated_at: this.stamp() });
  }

  insertFromOtherDevice(row: Partial<RemoteRow> & { id: string; title: string }) {
    const stamp = this.stamp();
    this.rows.set(row.id, {
      user_id: USER,
      notes: '',
      color: 'green',
      date: null,
      start_min: null,
      end_min: null,
      done: false,
      deleted: false,
      created_at: stamp,
      client_updated_at: stamp,
      updated_at: stamp,
      ...row,
    });
  }
}

let remote: FakeRemote;
let online: boolean;
let engine: SyncEngine;

beforeEach(async () => {
  await db.tasks.clear();
  await db.meta.clear();
  remote = new FakeRemote();
  online = true;
  engine = new SyncEngine({ userId: USER, remote, isOnline: () => online });
});

const local = (id: string) => db.tasks.get(id);

describe('SyncEngine', () => {
  it('pushes tasks created on this device and marks them synced', async () => {
    const t = await createTask(USER, { title: 'Write report', date: '2026-10-02', start: 540, end: 600 });
    await engine.sync();

    expect(remote.rows.get(t.id)).toMatchObject({ title: 'Write report', start_min: 540, end_min: 600, deleted: false });
    expect((await local(t.id))?.dirty).toBe(0);
    expect(getSyncStatus().state).toBe('synced');
  });

  it('syncs reminders with the absolute moment the server needs for push', async () => {
    const t = await createTask(USER, { title: 'Dentist', date: '2026-10-05', start: 600, end: 630, remindBefore: 30 });
    await engine.sync();
    const row = remote.rows.get(t.id) as RemoteRow & { remind_at?: string };
    expect(row.remind_before).toBe(30);
    expect(row.remind_at).toBe(new Date(2026, 9, 5, 9, 30).toISOString());

    remote.editFromOtherDevice(t.id, { remind_before: 5 }, new Date(Date.now() + 60_000).toISOString());
    await engine.sync();
    expect((await local(t.id))?.remindBefore).toBe(5);
  });

  it('pulls tasks created on another device', async () => {
    remote.insertFromOtherDevice({ id: 'r1', title: 'From phone', date: '2026-10-03' });
    await engine.sync();
    expect(await local('r1')).toMatchObject({ title: 'From phone', date: '2026-10-03', dirty: 0, color: 'green' });
  });

  it('keeps working offline and uploads everything once back online', async () => {
    online = false;
    const a = await createTask(USER, { title: 'Offline A' });
    const b = await createTask(USER, { title: 'Offline B' });
    await updateTask(a.id, { title: 'Offline A (edited)' });
    await engine.sync();

    expect(getSyncStatus().state).toBe('offline');
    expect(remote.rows.size).toBe(0);
    expect((await local(a.id))?.dirty).toBe(1);

    online = true;
    await engine.sync();
    expect(remote.rows.get(a.id)?.title).toBe('Offline A (edited)');
    expect(remote.rows.get(b.id)?.title).toBe('Offline B');
    expect(await db.tasks.where('[userId+dirty]').equals([USER, 1]).count()).toBe(0);
  });

  it('does not let a stale offline edit overwrite a newer edit from another device', async () => {
    const t = await createTask(USER, { title: 'Original' });
    await engine.sync();

    // This device edits while offline at 10:00...
    await db.tasks.update(t.id, { title: 'Stale edit', updatedAt: '2026-10-02T10:00:00.000Z', dirty: 1 });
    // ...but another device already saved a newer edit at 11:00.
    remote.editFromOtherDevice(t.id, { title: 'Newer edit' }, '2026-10-02T11:00:00.000Z');

    await engine.sync();
    expect(remote.rows.get(t.id)?.title).toBe('Newer edit');
    expect(await local(t.id)).toMatchObject({ title: 'Newer edit', dirty: 0 });
  });

  it('does not overwrite unsent local edits when pulling', async () => {
    const t = await createTask(USER, { title: 'Mine' });
    await engine.sync();
    remote.editFromOtherDevice(t.id, { title: 'Theirs' }, '2026-01-01T00:00:00.000Z');
    online = false;
    await updateTask(t.id, { title: 'Mine, edited offline' });
    online = true;
    await engine.sync();
    // The local edit is newer, so it wins on the server too.
    expect(await local(t.id)).toMatchObject({ title: 'Mine, edited offline', dirty: 0 });
    expect(remote.rows.get(t.id)?.title).toBe('Mine, edited offline');
  });

  it('propagates deletions in both directions', async () => {
    const mine = await createTask(USER, { title: 'Delete me' });
    remote.insertFromOtherDevice({ id: 'r2', title: 'Deleted elsewhere' });
    await engine.sync();
    expect(await local('r2')).toBeTruthy();

    await deleteTask(mine.id);
    remote.editFromOtherDevice('r2', { deleted: true }, new Date().toISOString());
    await engine.sync();

    expect(remote.rows.get(mine.id)?.deleted).toBe(true);
    expect(await local(mine.id)).toBeUndefined();
    expect(await local('r2')).toBeUndefined();
  });

  it('keeps changes queued when the server is unreachable, then retries', async () => {
    const t = await createTask(USER, { title: 'Queued' });
    remote.failWith = new TransientError('Failed to fetch');
    await engine.sync();
    expect(getSyncStatus().state).toBe('error');
    expect((await local(t.id))?.dirty).toBe(1);

    remote.failWith = null;
    await engine.sync();
    expect(getSyncStatus().state).toBe('synced');
    expect((await local(t.id))?.dirty).toBe(0);
    engine.stop();
  });

  it('does not let one rejected task block the rest of the queue', async () => {
    const bad = await createTask(USER, { title: 'Bad' });
    const good = await createTask(USER, { title: 'Good' });
    remote.rejectIds.add(bad.id);
    await engine.sync();
    expect(remote.rows.has(good.id)).toBe(true);
    expect(remote.rows.has(bad.id)).toBe(false);
    expect((await local(bad.id))?.dirty).toBe(1); // kept safely on the device
    expect(getSyncStatus().state).toBe('synced');
  });

  it('pauses and reports when the session has expired, without losing changes', async () => {
    remote.session = false;
    const t = await createTask(USER, { title: 'Waiting for sign-in' });
    await engine.sync();
    expect(getSyncStatus().state).toBe('unauthenticated');
    expect((await local(t.id))?.dirty).toBe(1);
  });
});
