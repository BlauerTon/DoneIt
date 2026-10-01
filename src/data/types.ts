import type { ColorKey } from '../lib/colors';
import type { ISODate } from '../lib/dates';

/** Owner id used for tasks created without an account (stored on this device only). */
export const LOCAL_USER_ID = 'local';

export interface Task {
  id: string;
  userId: string;
  title: string;
  notes: string;
  color: ColorKey;
  /** Calendar day, or null while the task is unassigned. */
  date: ISODate | null;
  /** Minutes from midnight. Both null when the task has a day but no time. */
  start: number | null;
  end: number | null;
  /** Minutes before the start to remind (0 = at the start time); null = no reminder. */
  remindBefore: number | null;
  done: boolean;
  createdAt: string;
  /** When the user last changed this task on this device (ISO timestamp). */
  updatedAt: string;
  /** Soft-delete marker, kept until the deletion has been synced. 0/1 so it can be indexed. */
  deleted: 0 | 1;
  /** 1 while the task has local changes the server has not acknowledged. */
  dirty: 0 | 1;
}

export type TaskFields = Pick<Task, 'title' | 'notes' | 'color' | 'date' | 'start' | 'end' | 'remindBefore' | 'done'>;
