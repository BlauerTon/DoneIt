import Dexie, { type Table } from 'dexie';
import type { Task } from './types';

export interface MetaEntry {
  key: string;
  value: string;
}

/**
 * The on-device database. It is the source of truth for the UI: every screen reads from here,
 * every edit writes here first, and the sync engine reconciles it with Supabase in the background.
 */
export class PlannerDB extends Dexie {
  tasks!: Table<Task, string>;
  meta!: Table<MetaEntry, string>;

  constructor(name = 'doneit') {
    super(name);
    this.version(1).stores({
      tasks: 'id, userId, [userId+dirty], [userId+date]',
      meta: 'key',
    });
    // v2: per-task reminders.
    this.version(2).stores({}).upgrade((tx) =>
      tx
        .table('tasks')
        .toCollection()
        .modify((t: Partial<Task>) => {
          if (t.remindBefore === undefined) t.remindBefore = null;
        }),
    );
  }
}

export const db = new PlannerDB();

export async function getMeta(key: string): Promise<string | null> {
  return (await db.meta.get(key))?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}
