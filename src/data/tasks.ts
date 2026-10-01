import { useLiveQuery } from 'dexie-react-hooks';
import { getSettings } from '../hooks/useSettings';
import { isColorKey, randomColor } from '../lib/colors';
import { DAY_MINUTES, clamp } from '../lib/time';
import { db } from './db';
import { LOCAL_USER_ID, type Task, type TaskFields } from './types';

type Listener = () => void;
const listeners = new Set<Listener>();

/** Lets the sync engine react to local edits without the UI knowing about sync. */
export function onLocalChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const notify = () => listeners.forEach((l) => l());

const now = () => new Date().toISOString();

export function newId(): string {
  // randomUUID only exists in secure contexts (https / localhost).
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Fallback for non-secure contexts (e.g. testing over a LAN IP without https).
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Enforces the same invariants as the database constraints so a bad edit can never get stuck
 * in the sync queue: times need a day, come in pairs, stay within the day, and end after start.
 */
export function normalizeFields<T extends Partial<TaskFields>>(fields: T): T {
  const out = { ...fields };
  if ('title' in out && typeof out.title === 'string') out.title = out.title.trim().slice(0, 500);
  if ('notes' in out && typeof out.notes === 'string') out.notes = out.notes.slice(0, 5000);
  if ('color' in out && !isColorKey(out.color)) out.color = 'blue';
  if ('date' in out && !out.date) {
    out.date = null;
    out.start = null;
    out.end = null;
  }
  if ('start' in out || 'end' in out) {
    if (out.start == null || out.end == null) {
      out.start = null;
      out.end = null;
    } else {
      out.start = clamp(Math.round(out.start), 0, DAY_MINUTES - 1);
      out.end = clamp(Math.round(out.end), out.start + 1, DAY_MINUTES);
    }
  }
  // A reminder needs a start time to count back from.
  if ('start' in out && out.start == null) out.remindBefore = null;
  if ('remindBefore' in out && out.remindBefore != null) {
    out.remindBefore = clamp(Math.round(out.remindBefore), 0, 7 * DAY_MINUTES);
  }
  return out;
}

export async function createTask(
  userId: string,
  fields: Partial<TaskFields> & { title: string },
): Promise<Task> {
  const stamp = now();
  // Timed tasks get the user's default reminder unless the caller chose one.
  const remindBefore = fields.remindBefore !== undefined ? fields.remindBefore : getSettings().defaultReminder;
  const task: Task = {
    id: newId(),
    userId,
    notes: '',
    color: randomColor(),
    date: null,
    start: null,
    end: null,
    done: false,
    ...normalizeFields({ remindBefore, ...fields, ...(fields.start == null ? { start: null, end: null } : {}) }),
    createdAt: stamp,
    updatedAt: stamp,
    deleted: 0,
    dirty: 1,
  };
  if (!task.title) throw new Error('A task needs a title.');
  await db.tasks.add(task);
  notify();
  return task;
}

/** Applies a change and returns the previous version (for undo). */
export async function updateTask(id: string, patch: Partial<TaskFields>): Promise<Task | undefined> {
  const before = await db.tasks.get(id);
  if (!before || before.deleted) return undefined;
  const next = normalizeFields({ ...pickFields(before), ...patch });
  if (!next.title) return before;
  await db.tasks.update(id, { ...next, updatedAt: now(), dirty: 1 });
  notify();
  return before;
}

export async function toggleDone(id: string): Promise<void> {
  const t = await db.tasks.get(id);
  if (t) await updateTask(id, { done: !t.done });
}

/** Soft-deletes so the deletion can sync; returns the task so it can be restored. */
export async function deleteTask(id: string): Promise<Task | undefined> {
  const before = await db.tasks.get(id);
  if (!before) return undefined;
  if (before.userId === LOCAL_USER_ID) {
    await db.tasks.delete(id); // nothing to sync for device-only tasks
  } else {
    await db.tasks.update(id, { deleted: 1, dirty: 1, updatedAt: now() });
  }
  notify();
  return before;
}

/** Puts a previous version back (undo for delete, move, resize and edits). */
export async function restoreTask(snapshot: Task): Promise<void> {
  await db.tasks.put({ ...snapshot, deleted: 0, dirty: 1, updatedAt: now() });
  notify();
}

/** Hands device-only tasks over to an account after the user signs in, so they sync. */
export async function adoptLocalTasks(userId: string): Promise<number> {
  const stamp = now();
  const count = await db.tasks
    .where('userId')
    .equals(LOCAL_USER_ID)
    .modify({ userId, dirty: 1, updatedAt: stamp });
  if (count) notify();
  return count;
}

export async function clearUserData(userId: string): Promise<void> {
  await db.transaction('rw', db.tasks, db.meta, async () => {
    await db.tasks.where('userId').equals(userId).delete();
    await db.meta.where('key').startsWith(`${userId}:`).delete();
  });
}

export async function countPending(userId: string): Promise<number> {
  return db.tasks.where('[userId+dirty]').equals([userId, 1]).count();
}

function pickFields(t: Task): TaskFields {
  return {
    title: t.title,
    notes: t.notes,
    color: t.color,
    date: t.date,
    start: t.start,
    end: t.end,
    remindBefore: t.remindBefore ?? null,
    done: t.done,
  };
}

/** Live list of the user's tasks; re-renders automatically on any local or synced change. */
export function useTasks(userId: string | null): Task[] | undefined {
  return useLiveQuery(
    async () => {
      if (!userId) return [];
      const rows = await db.tasks.where('userId').equals(userId).toArray();
      return rows.filter((t) => !t.deleted);
    },
    [userId],
  );
}

export function usePendingCount(userId: string | null): number {
  return useLiveQuery(() => (userId ? countPending(userId) : 0), [userId]) ?? 0;
}
