/** Times are stored as minutes from midnight (0..1440) on the task's calendar day. */
export const DAY_MINUTES = 24 * 60;
export const SNAP_MINUTES = 15;
export const MIN_DURATION = 15;
export const DEFAULT_DURATION = 60;

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function snap(minutes: number, step = SNAP_MINUTES): number {
  return Math.round(minutes / step) * step;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 545 -> "09:05", 1440 -> "24:00". */
export function formatTime(minutes: number): string {
  const m = clamp(Math.round(minutes), 0, DAY_MINUTES);
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** "9:05" / "09:05" -> 545. Returns null for anything that is not a valid time of day. */
export function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (m > 59 || h > 24 || (h === 24 && m !== 0)) return null;
  return h * 60 + m;
}

export function formatRange(start: number | null, end: number | null): string {
  if (start == null || end == null) return '';
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
