import { describe, expect, it } from 'vitest';
import type { Task } from '../data/types';
import { normalizeFields } from '../data/tasks';
import { dayOptions } from './dates';
import { planMoveToDay, planMoveToTime } from './moves';
import { parseQuickAdd } from './quickAdd';
import { REMINDER_GRACE_MS, dueReminders, nextReminderIn, reminderBody, reminderKey, remindAt } from './reminders';
import { findConflict, freeWindow, layoutLanes, slotProblem } from './schedule';
import { formatTime, parseTime } from './time';
import { EMPTY_DRAFT, draftSlot, setEndHour, setEndMinute, setStartHour, setStartMinute, withDuration } from './timeDraft';

const TODAY = '2026-10-02'; // a Friday

function task(partial: Partial<Task> & { id: string }): Task {
  return {
    userId: 'u',
    title: partial.id,
    notes: '',
    color: 'blue',
    date: TODAY,
    start: null,
    end: null,
    remindBefore: null,
    done: false,
    createdAt: '',
    updatedAt: '',
    deleted: 0,
    dirty: 0,
    ...partial,
  };
}

describe('time', () => {
  it('formats and parses minutes', () => {
    expect(formatTime(545)).toBe('09:05');
    expect(formatTime(1440)).toBe('24:00');
    expect(parseTime('8:57')).toBe(537);
    expect(parseTime('24:30')).toBeNull();
    expect(parseTime('12:60')).toBeNull();
  });
});

describe('quick add', () => {
  it('reads a trailing day and time', () => {
    expect(parseQuickAdd('Gym tomorrow 18:00', TODAY)).toEqual({ title: 'Gym', date: '2026-10-03', start: 1080, end: 1140 });
    expect(parseQuickAdd('Gym 6pm tomorrow', TODAY)).toEqual({ title: 'Gym', date: '2026-10-03', start: 1080, end: 1140 });
  });
  it('reads ranges and carries am/pm to the start', () => {
    expect(parseQuickAdd('Call mum mon 9-9:30am', TODAY)).toEqual({ title: 'Call mum', date: '2026-10-05', start: 540, end: 570 });
    expect(parseQuickAdd('Workshop 1-3pm', TODAY)).toEqual({ title: 'Workshop', date: TODAY, start: 780, end: 900 });
    expect(parseQuickAdd('Standup 9:15 - 9:30', TODAY)).toMatchObject({ start: 555, end: 570 });
  });
  it('leaves ordinary numbers and words alone', () => {
    expect(parseQuickAdd('Read 20 pages', TODAY)).toEqual({ title: 'Read 20 pages', date: null, start: null, end: null });
    expect(parseQuickAdd('Plan the week', TODAY)).toEqual({ title: 'Plan the week', date: null, start: null, end: null });
    expect(parseQuickAdd('Friday', TODAY).title).toBe('Friday');
  });
  it('treats a weekday as its next occurrence, today included', () => {
    expect(parseQuickAdd('Groceries fri', TODAY).date).toBe(TODAY);
    expect(parseQuickAdd('Groceries thursday', TODAY).date).toBe('2026-10-08');
  });
});

describe('schedule rules', () => {
  const tasks = [task({ id: 'a', start: 540, end: 600 }), task({ id: 'b', start: 720, end: 780 })];

  it('detects overlaps but allows back-to-back tasks', () => {
    expect(findConflict(tasks, TODAY, { start: 570, end: 630 })?.id).toBe('a');
    expect(findConflict(tasks, TODAY, { start: 600, end: 720 })).toBeNull();
    expect(findConflict(tasks, '2026-10-03', { start: 540, end: 600 })).toBeNull();
    expect(findConflict(tasks, TODAY, { start: 540, end: 600 }, 'a')).toBeNull();
  });

  it('explains why a slot is unavailable', () => {
    expect(slotProblem(tasks, TODAY, { start: 600, end: 600 })).toMatch(/after start/);
    expect(slotProblem(tasks, TODAY, { start: 550, end: 560 })).toBe('Slot conflict: "a" is already scheduled (09:00 – 10:00).');
  });

  it('bounds resizing by the neighbouring tasks', () => {
    expect(freeWindow(tasks, TODAY, { id: 'x', start: 630, end: 660 })).toEqual({ start: 600, end: 720 });
  });

  it('lays out overlapping blocks side by side', () => {
    const lanes = layoutLanes([
      { id: 1, start: 0, end: 60 },
      { id: 2, start: 30, end: 90 },
      { id: 3, start: 120, end: 180 },
    ]);
    expect(lanes.map((l) => [l.lane, l.lanes])).toEqual([[0, 2], [1, 2], [0, 1]]);
  });
});

describe('moves', () => {
  const tasks = [task({ id: 'a', start: 540, end: 600 }), task({ id: 'b', date: '2026-10-03', start: 540, end: 570 })];

  it('keeps the time when moving to a day where the slot is free, unschedules otherwise', () => {
    const free = planMoveToDay(tasks, tasks[0], '2026-10-04', TODAY);
    expect(free.ok && free.patch).toEqual({ date: '2026-10-04' });
    const taken = planMoveToDay(tasks, tasks[0], '2026-10-03', TODAY);
    expect(taken.ok && taken.patch).toEqual({ date: '2026-10-03', start: null, end: null });
  });

  it('snaps timeline drops to 15 minutes and refuses double bookings', () => {
    const t = task({ id: 'c' });
    const ok = planMoveToTime(tasks, t, TODAY, 607);
    expect(ok.ok && ok.patch).toEqual({ date: TODAY, start: 600, end: 660 });
    expect(planMoveToTime(tasks, t, TODAY, 560).ok).toBe(false);
  });
});

describe('segmented time input', () => {
  it('auto-completes hours and keeps the end one hour after the start', () => {
    const a = setStartHour(EMPTY_DRAFT, '8');
    expect(a.advance).toBe(true);
    expect(a.draft).toMatchObject({ sh: '08', eh: '09', em: '00' });
    const b = setStartMinute(a.draft, '57');
    expect(b.draft).toMatchObject({ sm: '57', eh: '09', em: '57' });
    expect(draftSlot(b.draft)).toEqual({ start: 537, end: 597 });
  });

  it('waits for a second digit when the hour could continue', () => {
    const a = setStartHour(EMPTY_DRAFT, '1');
    expect(a).toEqual({ draft: { ...EMPTY_DRAFT, sh: '1' }, advance: false });
    expect(setStartHour(a.draft, '14').draft).toMatchObject({ sh: '14', eh: '15' });
  });

  it('stops following once the end is set by hand, and caps at 24:00', () => {
    const manual = setEndHour(setStartHour(EMPTY_DRAFT, '09').draft, '11').draft;
    expect(setStartHour(manual, '10').draft.eh).toBe('11');
    expect(setStartHour(EMPTY_DRAFT, '23').draft).toMatchObject({ eh: '24', em: '00' });
    expect(setEndMinute({ ...manual, eh: '24' }, '30').draft.em).toBe('00');
    expect(withDuration(setStartHour(EMPTY_DRAFT, '23').draft, 120)).toMatchObject({ eh: '24', em: '00' });
  });
});

describe('data invariants', () => {
  it('drops times without a day and repairs inverted ranges', () => {
    expect(normalizeFields({ date: null, start: 540, end: 600 })).toEqual({ date: null, start: null, end: null, remindBefore: null });
    expect(normalizeFields({ start: 600, end: 500 })).toEqual({ start: 600, end: 601 });
    expect(normalizeFields({ start: 600, end: null })).toEqual({ start: null, end: null, remindBefore: null });
  });

  it('keeps a past date selectable for tasks that already have one', () => {
    const opts = dayOptions(TODAY, '2026-09-20');
    expect(opts[0]).toEqual({ value: '', label: 'Unassigned' });
    expect(opts[1].value).toBe('2026-09-20');
    expect(opts[2].label).toMatch(/^Today/);
  });
});

describe('reminders', () => {
  const at = (iso: string, minutes: number) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d, 0, minutes).getTime();
  };

  it('computes the reminder moment in local time', () => {
    const t = task({ id: 'r', start: 540, end: 600, remindBefore: 10 });
    expect(remindAt(t)?.getTime()).toBe(at(TODAY, 530));
    expect(remindAt({ ...t, remindBefore: 1440 })?.getTime()).toBe(at('2026-10-01', 540));
    expect(remindAt({ ...t, remindBefore: null })).toBeNull();
    expect(remindAt({ ...t, done: true })).toBeNull();
    expect(remindAt({ ...t, start: null })).toBeNull();
  });

  it('finds due reminders once, within the grace window', () => {
    const t = task({ id: 'r', start: 540, end: 600, remindBefore: 0 });
    const moment = at(TODAY, 540);
    expect(dueReminders([t], moment - 1000, new Set())).toHaveLength(0);
    expect(dueReminders([t], moment, new Set())).toHaveLength(1);
    expect(dueReminders([t], moment + REMINDER_GRACE_MS + 1, new Set())).toHaveLength(0);
    expect(dueReminders([t], moment + 1000, new Set([reminderKey('r', moment)]))).toHaveLength(0);
    // Moving the task creates a new reminder moment, so it fires again for the new time.
    expect(dueReminders([{ ...t, start: 600, end: 660 }], at(TODAY, 600), new Set([reminderKey('r', moment)]))).toHaveLength(1);
  });

  it('knows when to wake up next and words the message', () => {
    const t = task({ id: 'r', start: 540, end: 600, remindBefore: 15 });
    expect(nextReminderIn([t], at(TODAY, 500))).toBe(25 * 60 * 1000);
    expect(reminderBody(t)).toBe('In 15m · 09:00 – 10:00');
    expect(reminderBody({ ...t, remindBefore: 0 })).toBe('Starting now · 09:00 – 10:00');
  });

  it('clears the reminder when a task loses its time', () => {
    expect(normalizeFields({ start: null, end: null, remindBefore: 10 })).toMatchObject({ remindBefore: null });
    expect(normalizeFields({ date: null, remindBefore: 10 })).toMatchObject({ remindBefore: null });
  });
});
