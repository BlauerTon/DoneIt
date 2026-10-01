import { addDaysISO, fromISODate, type ISODate } from './dates';
import { DAY_MINUTES, DEFAULT_DURATION } from './time';

export interface QuickAddResult {
  title: string;
  date: ISODate | null;
  start: number | null;
  end: number | null;
}

const DAY_WORDS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};
const TODAY_WORDS = ['today', 'tonight'];
const TOMORROW_WORDS = ['tomorrow', 'tmrw', 'tmr'];

/** "9", "9:30", "9am", "9:30pm", "21:00" -> minutes. */
function parseClock(raw: string): number | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(raw.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const marker = m[3]?.toLowerCase();
  if (min > 59) return null;
  if (marker) {
    if (h < 1 || h > 12) return null;
    if (marker === 'pm' && h !== 12) h += 12;
    if (marker === 'am' && h === 12) h = 0;
  }
  if (h > 24 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

const hasMarker = (raw: string) => /(am|pm)\s*$/i.test(raw);
const isExplicitTime = (raw: string) => raw.includes(':') || hasMarker(raw);

const TIME = String.raw`\d{1,2}(?::\d{2})?\s*(?:am|pm)?`;
const RANGE_RE = new RegExp(String.raw`(?:^|\s)(?:at\s+|from\s+)?(${TIME})\s*(?:-|–|to)\s*(${TIME})$`, 'i');
const SINGLE_RE = new RegExp(String.raw`(?:^|\s)(?:at\s+)?(${TIME})$`, 'i');
const WORD_RE = /(?:^|\s)(?:on\s+)?([a-z]+)$/i;

/**
 * Pulls a trailing day and/or time out of a quick-add line:
 *   "Gym tomorrow 18:00"       -> Gym, tomorrow, 18:00–19:00
 *   "Call mum fri 9-9:30am"    -> Call mum, Friday, 09:00–09:30
 *   "Read 20 pages"            -> unchanged (bare numbers are never treated as times)
 * Day and time may come in either order. A time without a day means today.
 */
export function parseQuickAdd(input: string, today: ISODate): QuickAddResult {
  const original = input.trim().replace(/\s+/g, ' ');
  let text = original;
  let date: ISODate | null = null;
  let start: number | null = null;
  let end: number | null = null;

  const takeTime = (): boolean => {
    if (start != null) return false;
    const range = RANGE_RE.exec(text);
    if (range && (isExplicitTime(range[1]) || isExplicitTime(range[2]))) {
      const b = parseClock(range[2]);
      let a = parseClock(range[1]);
      // "1-3pm": a marker on the end time also applies to the start when that keeps it earlier.
      if (a != null && b != null && !hasMarker(range[1]) && hasMarker(range[2])) {
        const withMarker = parseClock(range[1] + range[2].trim().slice(-2));
        if (withMarker != null && withMarker < b) a = withMarker;
      }
      if (a != null && b != null && b > a && a < DAY_MINUTES) {
        start = a;
        end = b;
        text = text.slice(0, range.index).trim();
        return true;
      }
    }
    const single = SINGLE_RE.exec(text);
    if (single && isExplicitTime(single[1])) {
      const a = parseClock(single[1]);
      if (a != null && a < DAY_MINUTES) {
        start = a;
        end = Math.min(DAY_MINUTES, a + DEFAULT_DURATION);
        text = text.slice(0, single.index).trim();
        return true;
      }
    }
    return false;
  };

  const takeDay = (): boolean => {
    if (date) return false;
    const m = WORD_RE.exec(text);
    if (!m) return false;
    const word = m[1].toLowerCase();
    let found: ISODate | null = null;
    if (TODAY_WORDS.includes(word)) found = today;
    else if (TOMORROW_WORDS.includes(word)) found = addDaysISO(today, 1);
    else if (word in DAY_WORDS) {
      const diff = (DAY_WORDS[word] - fromISODate(today).getDay() + 7) % 7;
      found = addDaysISO(today, diff);
    }
    if (!found) return false;
    const rest = text.slice(0, m.index).trim();
    if (!rest) return false; // never consume the whole title
    date = found;
    text = rest;
    return true;
  };

  // Accept "<day> <time>" and "<time> <day>".
  for (let i = 0; i < 2; i++) {
    if (!(takeTime() || takeDay())) break;
  }
  if (!text) return { title: original, date: null, start: null, end: null };
  if (start != null && !date) date = today;
  return { title: text, date, start, end };
}
