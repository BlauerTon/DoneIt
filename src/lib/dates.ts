import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns';

/** Calendar days are plain "YYYY-MM-DD" strings in the user's local time zone. */
export type ISODate = string;

export function toISODate(d: Date): ISODate {
  return format(d, 'yyyy-MM-dd');
}

export function fromISODate(iso: ISODate): Date {
  return parseISO(iso);
}

export function todayISO(now = new Date()): ISODate {
  return toISODate(now);
}

export function addDaysISO(iso: ISODate, n: number): ISODate {
  return toISODate(addDays(fromISODate(iso), n));
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return differenceInCalendarDays(fromISODate(b), fromISODate(a));
}

export function weekStartISO(iso: ISODate): ISODate {
  return toISODate(startOfWeek(fromISODate(iso), { weekStartsOn: 1 }));
}

export const dowShort = (iso: ISODate) => format(fromISODate(iso), 'EEE').toUpperCase();
export const dowLong = (iso: ISODate) => format(fromISODate(iso), 'EEEE');
export const dayNumber = (iso: ISODate) => fromISODate(iso).getDate();
/** "Monday, October 2" */
export const longLabel = (iso: ISODate) => format(fromISODate(iso), 'EEEE, MMMM d');
/** "Mon, Oct 2" */
export const shortLabel = (iso: ISODate) => format(fromISODate(iso), 'EEE, MMM d');

/** Human label relative to today: "Today", "Tomorrow", "Yesterday" or "Thu, Oct 5". */
export function relativeLabel(iso: ISODate, today: ISODate): string {
  const diff = daysBetween(today, iso);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return dowLong(iso);
  return shortLabel(iso);
}

/** "October 2 – 8" or "September 29 – October 5" */
export function rangeTitle(from: ISODate, to: ISODate): string {
  const a = fromISODate(from);
  const b = fromISODate(to);
  if (a.getMonth() === b.getMonth()) return `${format(a, 'MMMM d')} – ${format(b, 'd')}`;
  return `${format(a, 'MMMM d')} – ${format(b, 'MMMM d')}`;
}

export interface DayOption {
  value: ISODate | '';
  label: string;
}

/**
 * Day picker options: Unassigned, then today and the following days.
 * A task already on a past date keeps that date as an option so editing it never loses data.
 */
export function dayOptions(today: ISODate, current?: ISODate | null, count = 14): DayOption[] {
  const options: DayOption[] = [{ value: '', label: 'Unassigned' }];
  if (current && current < today) {
    options.push({ value: current, label: `${longLabel(current)} (past)` });
  }
  for (let i = 0; i < count; i++) {
    const iso = addDaysISO(today, i);
    const base = format(fromISODate(iso), 'EEEE, MMM d');
    const label = i === 0 ? `Today (${base})` : i === 1 ? `Tomorrow (${base})` : base;
    options.push({ value: iso, label });
  }
  if (current && current >= addDaysISO(today, count)) {
    options.push({ value: current, label: longLabel(current) });
  }
  return options;
}

export function greeting(name: string, now = new Date()): string {
  const hour = now.getHours();
  const part = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 17 ? 'Good afternoon' : 'Good evening';
  const first = name.trim().split(/\s+/)[0];
  return `${part}, ${first || 'there'}`;
}
