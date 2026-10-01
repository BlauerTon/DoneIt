import { useMemo, useState, type FormEvent } from 'react';
import { usePlanner } from '../app/PlannerContext';
import { createTask } from '../data/tasks';
import { relativeLabel, type ISODate } from '../lib/dates';
import { parseQuickAdd } from '../lib/quickAdd';
import { slotProblem } from '../lib/schedule';
import { formatRange } from '../lib/time';

interface QuickAddProps {
  /** Day used when the text does not name one (null = leave unassigned). */
  defaultDate: ISODate | null;
  placeholder?: string;
  compact?: boolean;
}

/**
 * One-line task entry that understands a trailing day and time, e.g. "Gym tomorrow 6pm" or
 * "Standup mon 9:15-9:30". A preview shows how the text will be read before it is added.
 */
export function QuickAdd({ defaultDate, placeholder = 'What do you need to do?', compact }: QuickAddProps) {
  const { tasks, today, profile } = usePlanner();
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseQuickAdd(text, today), [text, today]);
  const date = parsed.date ?? defaultDate;
  const slot = parsed.start != null && parsed.end != null ? { start: parsed.start, end: parsed.end } : null;
  const problem = text.trim() ? slotProblem(tasks, date, slot) : null;
  const hasHint = text.trim() && (parsed.date || slot);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!parsed.title.trim() || problem) return;
    await createTask(profile.id, {
      title: parsed.title,
      date,
      start: slot?.start ?? null,
      end: slot?.end ?? null,
    });
    setText('');
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <input
          className={`field min-w-0 flex-1 ${compact ? 'py-2 text-[13px]' : 'py-[11px]'}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label="New task"
          enterKeyHint="done"
          maxLength={500}
        />
        <button type="submit" className={`btn btn-primary ${compact ? 'px-3' : 'px-[18px] text-sm'}`} disabled={!text.trim() || !!problem}>
          Add
        </button>
      </div>
      {problem ? (
        <p className="m-0 text-[12px] font-medium text-danger">{problem}</p>
      ) : hasHint ? (
        <p className="m-0 font-mono text-[11px] text-muted" aria-live="polite">
          → “{parsed.title}” · {date ? relativeLabel(date, today) : 'Unassigned'}
          {slot ? ` · ${formatRange(slot.start, slot.end)}` : ''}
        </p>
      ) : !compact ? (
        <p className="m-0 text-[11px] text-muted">Tip: add a day or time at the end, like “Gym tomorrow 6pm”.</p>
      ) : null}
    </form>
  );
}
