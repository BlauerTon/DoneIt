import type { Task, TaskFields } from '../data/types';
import { relativeLabel, type ISODate } from './dates';
import { findConflict } from './schedule';
import { DAY_MINUTES, DEFAULT_DURATION, clamp, formatRange, snap } from './time';

export type MovePlan =
  | { ok: true; patch: Partial<TaskFields>; message: string }
  | { ok: false; message: string };

const duration = (t: Task) => (t.start != null && t.end != null ? t.end - t.start : DEFAULT_DURATION);

/**
 * Dropping a task on a day (week view) or on "Unassigned".
 * A timed task keeps its time on the new day when that slot is free there; otherwise it lands
 * as unscheduled for that day rather than creating a double booking.
 */
export function planMoveToDay(tasks: Task[], task: Task, date: ISODate | null, today: ISODate): MovePlan {
  if (date === null) {
    return { ok: true, patch: { date: null, start: null, end: null }, message: `Unassigned “${task.title}”` };
  }
  const label = relativeLabel(date, today);
  if (task.start != null && task.end != null) {
    const clash = findConflict(tasks, date, { start: task.start, end: task.end }, task.id);
    if (!clash) {
      return {
        ok: true,
        patch: { date },
        message: `Moved to ${label} at ${formatRange(task.start, task.end)}`,
      };
    }
    return {
      ok: true,
      patch: { date, start: null, end: null },
      message: `Moved to ${label} as unscheduled (time was taken by “${clash.title}”)`,
    };
  }
  return { ok: true, patch: { date }, message: `Moved to ${label}` };
}

/** Dropping a task on a day's "Unscheduled" list keeps the day and clears the time. */
export function planUnschedule(task: Task, date: ISODate): MovePlan {
  return { ok: true, patch: { date, start: null, end: null }, message: `Unscheduled “${task.title}”` };
}

/** Dropping a task onto the day timeline at `minute` (snapped to 15 minutes, duration kept). */
export function planMoveToTime(tasks: Task[], task: Task, date: ISODate, minute: number): MovePlan {
  const length = duration(task);
  const start = clamp(snap(minute), 0, DAY_MINUTES - length);
  const end = start + length;
  const clash = findConflict(tasks, date, { start, end }, task.id);
  if (clash) {
    return {
      ok: false,
      message: `Can't place it at ${formatRange(start, end)}: “${clash.title}” is there (${formatRange(clash.start, clash.end)}).`,
    };
  }
  return { ok: true, patch: { date, start, end }, message: `Scheduled ${formatRange(start, end)}` };
}
