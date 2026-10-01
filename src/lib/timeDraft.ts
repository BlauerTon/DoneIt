import type { Slot } from './schedule';
import { DAY_MINUTES, DEFAULT_DURATION, clamp } from './time';

/**
 * The four segmented time inputs of the task form, kept as the raw strings the user typed so
 * partial input ("1" on the way to "14") is preserved. `endManual` stops the end time following
 * the start time once the user has chosen an end themselves.
 */
export interface TimeDraft {
  sh: string;
  sm: string;
  eh: string;
  em: string;
  endManual: boolean;
}

export interface DraftUpdate {
  draft: TimeDraft;
  /** True when the field is complete and focus should jump to the next segment. */
  advance: boolean;
}

export const EMPTY_DRAFT: TimeDraft = { sh: '', sm: '', eh: '', em: '', endManual: false };

const pad = (n: number) => String(n).padStart(2, '0');
const digits = (raw: string) => raw.replace(/\D/g, '').slice(0, 2);

export function draftFromSlot(start: number | null, end: number | null): TimeDraft {
  if (start == null || end == null) return EMPTY_DRAFT;
  return {
    sh: pad(Math.floor(start / 60)),
    sm: pad(start % 60),
    eh: pad(Math.floor(end / 60)),
    em: pad(end % 60),
    endManual: true,
  };
}

function startOf(d: TimeDraft): number | null {
  if (!d.sh) return null;
  return Number(d.sh) * 60 + Number(d.sm || 0);
}

/** The slot the draft describes; a start with no end defaults to one hour. */
export function draftSlot(d: TimeDraft): Slot | null {
  const start = startOf(d);
  if (start == null) return null;
  const end = d.eh ? Number(d.eh) * 60 + Number(d.em || 0) : Math.min(DAY_MINUTES, start + DEFAULT_DURATION);
  return { start, end };
}

/** Keeps the end time one hour after the start until the user sets the end explicitly. */
function followStart(d: TimeDraft): TimeDraft {
  const start = startOf(d);
  if (d.endManual || start == null || d.sh.length < 2) return d;
  const end = Math.min(DAY_MINUTES, start + DEFAULT_DURATION);
  return { ...d, eh: pad(Math.floor(end / 60)), em: pad(end % 60) };
}

/** Hour digits: "8" -> "08" and jump (no hour starts with 3-9), "14" -> jump, "1" -> wait. */
function hourInput(raw: string, max: number): { value: string; complete: boolean } {
  const v = digits(raw);
  if (v.length === 1 && Number(v) >= 3) return { value: pad(Number(v)), complete: true };
  if (v.length === 2) return { value: pad(clamp(Number(v), 0, max)), complete: true };
  return { value: v, complete: false };
}

function minuteInput(raw: string): { value: string; complete: boolean } {
  const v = digits(raw);
  if (v.length === 2) return { value: pad(clamp(Number(v), 0, 59)), complete: true };
  return { value: v, complete: false };
}

export function setStartHour(d: TimeDraft, raw: string): DraftUpdate {
  const { value, complete } = hourInput(raw, 23);
  return { draft: followStart({ ...d, sh: value }), advance: complete };
}

export function setStartMinute(d: TimeDraft, raw: string): DraftUpdate {
  // Focus stays put: the end time already follows the start, so most users stop here.
  const { value } = minuteInput(raw);
  return { draft: followStart({ ...d, sm: value }), advance: false };
}

export function setEndHour(d: TimeDraft, raw: string): DraftUpdate {
  const { value, complete } = hourInput(raw, 24);
  const em = value === '24' ? '00' : d.em;
  return { draft: { ...d, eh: value, em, endManual: true }, advance: complete && value !== '24' };
}

export function setEndMinute(d: TimeDraft, raw: string): DraftUpdate {
  const { value, complete } = minuteInput(raw);
  const em = d.eh === '24' && value ? '00' : value;
  return { draft: { ...d, em, endManual: true }, advance: complete };
}

/** Quick duration chips: start defaults to 09:00 when empty, end is capped at 24:00. */
export function withDuration(d: TimeDraft, minutes: number): TimeDraft {
  const start = startOf(d) ?? 9 * 60;
  const end = Math.min(DAY_MINUTES, start + minutes);
  return {
    sh: pad(Math.floor(start / 60)),
    sm: pad(start % 60),
    eh: pad(Math.floor(end / 60)),
    em: pad(end % 60),
    endManual: true,
  };
}
