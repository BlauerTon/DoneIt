import type { Task } from '../data/types';
import { fromISODate } from './dates';
import { formatDuration, formatRange } from './time';

export const REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'No reminder' },
  { value: 0, label: 'At start time' },
  { value: 5, label: '5 minutes before' },
  { value: 10, label: '10 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 1440, label: '1 day before' },
];

/** How long after its moment a missed reminder is still worth showing (e.g. device was asleep). */
export const REMINDER_GRACE_MS = 15 * 60 * 1000;

/**
 * The moment to remind, in this device's time zone. The task's day and start are wall-clock
 * values, so the Date constructor (local time) gives the right instant, DST included.
 */
export function remindAt(t: Pick<Task, 'date' | 'start' | 'remindBefore' | 'done'>): Date | null {
  if (t.done || !t.date || t.start == null || t.remindBefore == null) return null;
  const day = fromISODate(t.date);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, t.start - t.remindBefore);
}

export function reminderLabel(before: number | null): string {
  if (before == null) return 'No reminder';
  if (before === 0) return 'At start';
  return `${formatDuration(before)} before`;
}

export function reminderBody(t: Pick<Task, 'start' | 'end' | 'remindBefore'>): string {
  const range = formatRange(t.start, t.end);
  if (!t.remindBefore) return `Starting now · ${range}`;
  return `In ${formatDuration(t.remindBefore)} · ${range}`;
}

export const reminderKey = (taskId: string, at: number) => `${taskId}@${at}`;
export const reminderTag = (taskId: string, at: number) => `reminder:${taskId}:${at}`;

export interface DueReminder {
  task: Task;
  at: number;
}

/** Reminders whose moment has arrived (within the grace window) and that were not shown yet. */
export function dueReminders(tasks: Task[], now: number, fired: Set<string>): DueReminder[] {
  const due: DueReminder[] = [];
  for (const task of tasks) {
    const at = remindAt(task)?.getTime();
    if (at == null || at > now || now - at > REMINDER_GRACE_MS) continue;
    if (!fired.has(reminderKey(task.id, at))) due.push({ task, at });
  }
  return due.sort((a, b) => a.at - b.at);
}

/** Milliseconds until the next future reminder, or null when there is none. */
export function nextReminderIn(tasks: Task[], now: number): number | null {
  let next: number | null = null;
  for (const task of tasks) {
    const at = remindAt(task)?.getTime();
    if (at != null && at > now && (next == null || at < next)) next = at;
  }
  return next == null ? null : next - now;
}
