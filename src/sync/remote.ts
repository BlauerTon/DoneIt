import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { COLOR_KEYS } from '../lib/colors';
import { remindAt } from '../lib/reminders';
import type { Task } from '../data/types';

export const TABLE = 'planner_tasks';

/** Shape of a row in `public.planner_tasks`, validated because it arrives over the network. */
export const remoteRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  title: z.string(),
  notes: z.string().nullable().optional(),
  color: z.string(),
  date: z.string().nullable(),
  start_min: z.number().int().nullable(),
  end_min: z.number().int().nullable(),
  // Optional so rows still parse before the reminders migration has been run.
  remind_before: z.number().int().nullable().optional(),
  done: z.boolean(),
  deleted: z.boolean(),
  created_at: z.string(),
  client_updated_at: z.string(),
  updated_at: z.string(),
});
export type RemoteRow = z.infer<typeof remoteRowSchema>;
export type OutgoingRow = Omit<RemoteRow, 'updated_at'> & { remind_at?: string | null };

export function toRemote(t: Task): OutgoingRow {
  return {
    id: t.id,
    user_id: t.userId,
    title: t.title,
    notes: t.notes,
    color: t.color,
    date: t.date,
    start_min: t.start,
    end_min: t.end,
    remind_before: t.remindBefore ?? null,
    // Absolute time for the server's push sender, computed here because only the device knows
    // the user's time zone.
    remind_at: t.deleted ? null : (remindAt(t)?.toISOString() ?? null),
    done: t.done,
    deleted: t.deleted === 1,
    created_at: t.createdAt,
    client_updated_at: t.updatedAt,
  };
}

export function fromRemote(r: RemoteRow): Task {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    notes: r.notes ?? '',
    color: (COLOR_KEYS as readonly string[]).includes(r.color) ? (r.color as Task['color']) : 'blue',
    date: r.date,
    start: r.start_min,
    end: r.end_min,
    remindBefore: r.remind_before ?? null,
    done: r.done,
    createdAt: r.created_at,
    updatedAt: r.client_updated_at,
    deleted: r.deleted ? 1 : 0,
    dirty: 0,
  };
}

export function parseRows(data: unknown): RemoteRow[] {
  if (!Array.isArray(data)) return [];
  const rows: RemoteRow[] = [];
  for (const raw of data) {
    const parsed = remoteRowSchema.safeParse(raw);
    if (parsed.success) rows.push(parsed.data);
    else console.warn('[sync] ignoring malformed row', parsed.error.issues);
  }
  return rows;
}

/** Thrown for failures that mean "try again later" rather than "this data is wrong". */
export class TransientError extends Error {}
/** Thrown when the server rejects specific rows (constraint or type violations). */
export class RejectedError extends Error {}

/** Everything the sync engine needs from the server, so it can be tested without Supabase. */
export interface Remote {
  /** True when there is a usable session. Throws TransientError if that cannot be determined. */
  hasSession(): Promise<boolean>;
  /** Upserts rows and returns the rows the server actually accepted (stale writes are skipped). */
  upsert(rows: OutgoingRow[]): Promise<RemoteRow[]>;
  fetchByIds(ids: string[]): Promise<RemoteRow[]>;
  /** Rows changed after `since` (exclusive), ordered by updated_at. */
  fetchChanges(userId: string, since: string | null, offset: number, limit: number): Promise<RemoteRow[]>;
  /** Live change feed. `onReady` fires after (re)connecting so the engine can catch up. */
  subscribe(userId: string, onRow: (row: RemoteRow) => void, onReady: () => void): () => void;
}

function classify(error: { message?: string; code?: string } | null | undefined): Error {
  const code = error?.code ?? '';
  const message = error?.message ?? 'Unknown sync error';
  // Postgres data exceptions (22xxx) and integrity violations (23xxx) will never succeed on retry.
  if (/^2[23]/.test(code)) return new RejectedError(message);
  return new TransientError(message);
}

function withoutReminders(row: OutgoingRow): OutgoingRow {
  const { remind_before: _b, remind_at: _a, ...rest } = row;
  return rest;
}

export function createSupabaseRemote(client: SupabaseClient): Remote {
  let remindersSupported = true;
  return {
    async hasSession() {
      const { data, error } = await client.auth.getSession();
      if (data.session) return true;
      if (error && (error.name === 'AuthRetryableFetchError' || !navigator.onLine)) {
        throw new TransientError(error.message);
      }
      return false;
    },

    async upsert(rows) {
      const send = (payload: OutgoingRow[]) => client.from(TABLE).upsert(payload, { onConflict: 'id' }).select();
      let { data, error } = await (remindersSupported ? send(rows) : send(rows.map(withoutReminders)));
      // PGRST204: column not found. The reminders migration has not been run yet; keep syncing
      // everything else rather than stalling the whole queue.
      if (error?.code === 'PGRST204' && remindersSupported) {
        console.warn('[sync] reminder columns missing on the server; run the reminders migration to sync them.');
        remindersSupported = false;
        ({ data, error } = await send(rows.map(withoutReminders)));
      }
      if (error) throw classify(error);
      return parseRows(data);
    },

    async fetchByIds(ids) {
      if (!ids.length) return [];
      const { data, error } = await client.from(TABLE).select('*').in('id', ids);
      if (error) throw classify(error);
      return parseRows(data);
    },

    async fetchChanges(userId, since, offset, limit) {
      let query = client.from(TABLE).select('*').eq('user_id', userId);
      if (since) query = query.gt('updated_at', since);
      const { data, error } = await query
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) throw classify(error);
      return parseRows(data);
    },

    subscribe(userId, onRow, onReady) {
      const channel = client
        .channel(`planner_tasks:${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: TABLE, filter: `user_id=eq.${userId}` },
          (payload) => {
            const [row] = parseRows([payload.new]);
            if (row) onRow(row);
          },
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') onReady();
        });
      return () => {
        void client.removeChannel(channel);
      };
    },
  };
}
