import type { Task } from '../data/types';
import type { ISODate } from './dates';
import { DAY_MINUTES, formatRange } from './time';

export interface Slot {
  start: number;
  end: number;
}

export type ScheduledTask = Task & { start: number; end: number };

export const isScheduled = (t: Task): t is ScheduledTask => t.start != null && t.end != null;

export function scheduledOn(tasks: Task[], date: ISODate, excludeId?: string): ScheduledTask[] {
  return tasks
    .filter((t): t is ScheduledTask => t.date === date && isScheduled(t) && t.id !== excludeId)
    .sort((a, b) => a.start - b.start);
}

/** First task on `date` whose time range overlaps [start, end), ignoring `excludeId`. */
export function findConflict(
  tasks: Task[],
  date: ISODate,
  slot: Slot,
  excludeId?: string,
): ScheduledTask | null {
  for (const t of scheduledOn(tasks, date, excludeId)) {
    if (Math.max(slot.start, t.start) < Math.min(slot.end, t.end)) return t;
  }
  return null;
}

/** Human-readable reason a slot cannot be used, or null if it is free and valid. */
export function slotProblem(
  tasks: Task[],
  date: ISODate | null,
  slot: Slot | null,
  excludeId?: string,
): string | null {
  if (!slot) return null;
  if (slot.end <= slot.start) return 'End time must be after start time.';
  if (slot.start < 0 || slot.end > DAY_MINUTES) return 'Times must fall between 00:00 and 24:00.';
  if (!date) return null;
  const clash = findConflict(tasks, date, slot, excludeId);
  if (clash) {
    return `Slot conflict: "${clash.title}" is already scheduled (${formatRange(clash.start, clash.end)}).`;
  }
  return null;
}

/**
 * The free window a task can grow into without overlapping its neighbours.
 * Used to clamp resize gestures so they can never create a double booking.
 */
export function freeWindow(tasks: Task[], date: ISODate, task: Slot & { id: string }): Slot {
  let lo = 0;
  let hi = DAY_MINUTES;
  for (const t of scheduledOn(tasks, date, task.id)) {
    if (t.end <= task.start) lo = Math.max(lo, t.end);
    if (t.start >= task.end) hi = Math.min(hi, t.start);
  }
  return { start: lo, end: hi };
}

export interface LaidOut<T> {
  item: T;
  lane: number;
  lanes: number;
}

/**
 * Side-by-side lanes for overlapping blocks. Overlaps are prevented locally, but they can still
 * arrive from another device that was offline, and they should stay readable when they do.
 */
export function layoutLanes<T extends Slot>(items: T[]): LaidOut<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const result: LaidOut<T>[] = [];
  let cluster: LaidOut<T>[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    for (const entry of cluster) entry.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    if (item.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    const entry: LaidOut<T> = { item, lane, lanes: 1 };
    cluster.push(entry);
    result.push(entry);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();
  return result;
}
