import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { usePlanner, type TaskDialog } from '../app/PlannerContext';
import { changeTask, removeTask } from '../data/actions';
import { createTask } from '../data/tasks';
import type { Task } from '../data/types';
import { getSettings } from '../hooks/useSettings';
import { COLOR_BAR, COLOR_KEYS, randomColor, type ColorKey } from '../lib/colors';
import { REMINDER_OPTIONS } from '../lib/reminders';
import { dayOptions } from '../lib/dates';
import { slotProblem } from '../lib/schedule';
import { EMPTY_DRAFT, draftFromSlot, draftSlot, withDuration, type TimeDraft } from '../lib/timeDraft';
import { formatDuration } from '../lib/time';
import { AlertIcon, BellIcon, TrashIcon } from './icons';
import { Modal } from './Modal';
import { TimeFields } from './TimeFields';

interface Draft {
  title: string;
  notes: string;
  date: string;
  color: ColorKey;
  time: TimeDraft;
  remindBefore: number | null;
}

function initialDraft(dialog: TaskDialog, task: Task | undefined): Draft {
  if (dialog.mode === 'edit' && task) {
    return {
      title: task.title,
      notes: task.notes,
      date: task.date ?? '',
      color: task.color,
      time: draftFromSlot(task.start, task.end),
      remindBefore: task.remindBefore ?? null,
    };
  }
  const d = dialog.mode === 'new' ? dialog.defaults : {};
  return {
    title: d.title ?? '',
    notes: '',
    date: d.date ?? '',
    color: d.color ?? randomColor(),
    time: d.start != null && d.end != null ? { ...draftFromSlot(d.start, d.end), endManual: false } : EMPTY_DRAFT,
    remindBefore: d.remindBefore !== undefined ? d.remindBefore : getSettings().defaultReminder,
  };
}

export function TaskModal({ dialog, onClose }: { dialog: TaskDialog | null; onClose: () => void }) {
  return (
    <Modal open={!!dialog} onClose={onClose} labelledBy="task-modal-title">
      {dialog && <TaskForm key={dialog.mode === 'edit' ? dialog.taskId : 'new'} dialog={dialog} onClose={onClose} />}
    </Modal>
  );
}

function TaskForm({ dialog, onClose }: { dialog: TaskDialog; onClose: () => void }) {
  const { tasks, today, profile } = usePlanner();
  const editing = dialog.mode === 'edit' ? tasks.find((t) => t.id === dialog.taskId) : undefined;
  const [draft, setDraft] = useState<Draft>(() => initialDraft(dialog, editing));
  const [showNotes, setShowNotes] = useState(() => !!editing?.notes);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus without selecting on mobile, where the keyboard would cover the form anyway.
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  // The task was deleted elsewhere (another device, undo) while the dialog was open.
  useEffect(() => {
    if (dialog.mode === 'edit' && !editing) onClose();
  }, [dialog.mode, editing, onClose]);

  const slot = draftSlot(draft.time);
  const problem = slotProblem(tasks, draft.date || null, slot, editing?.id);
  const options = useMemo(() => dayOptions(today, editing?.date ?? null), [today, editing?.date]);

  const setTime = (time: TimeDraft) => {
    // Typing a time for an unassigned task schedules it for today rather than losing the time.
    setDraft((d) => ({ ...d, time, date: d.date || (time.sh ? today : '') }));
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const title = draft.title.trim();
    if (!title || problem || saving) return;
    setSaving(true);
    const fields = {
      title,
      notes: draft.notes.trim(),
      color: draft.color,
      date: draft.date || null,
      start: slot?.start ?? null,
      end: slot?.end ?? null,
      remindBefore: slot ? draft.remindBefore : null,
    };
    try {
      if (editing) await changeTask(editing.id, fields);
      else await createTask(profile.id, fields);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit();
      }}
      className="flex flex-col gap-4"
    >
      <div>
        <h2 id="task-modal-title" className="text-lg font-bold tracking-tight text-ink">
          {editing ? 'Edit task' : 'New task'}
        </h2>
        <p className="mt-0.5 text-[12.5px] text-muted">
          {editing ? 'Change anything, then save.' : 'Day and time are optional. Type any hour and minute.'}
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-ink-2">What do you need to do?</span>
        <input
          ref={titleRef}
          className="field"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          placeholder="e.g. Design review session"
          maxLength={500}
          required
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-ink-2">Day</span>
        <select
          className="field cursor-pointer text-[13px]"
          value={draft.date}
          onChange={(e) =>
            setDraft((d) => ({ ...d, date: e.target.value, time: e.target.value ? d.time : EMPTY_DRAFT }))
          }
        >
          {options.map((o) => (
            <option key={o.value || 'none'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <TimeFields draft={draft.time} onChange={setTime} />

      <div className="-mt-1 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted">Quick duration:</span>
        {[30, 60, 90, 120].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setTime(withDuration(draft.time, m))}
            className="rounded-md border border-line bg-card px-2 py-0.5 font-mono text-[11px] text-ink-2 hover:border-accent hover:text-accent"
          >
            +{formatDuration(m)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setTime(EMPTY_DRAFT)}
          className="rounded-md px-2 py-0.5 text-[11px] text-muted hover:text-ink"
        >
          Clear
        </button>
      </div>

      {slot && (
        <label className="-mt-1 flex items-center gap-2">
          <BellIcon size={14} className="shrink-0 text-muted" />
          <span className="sr-only">Reminder</span>
          <select
            aria-label="Reminder"
            className="field cursor-pointer py-1.5 text-[13px]"
            value={draft.remindBefore ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, remindBefore: e.target.value === '' ? null : Number(e.target.value) }))}
          >
            {REMINDER_OPTIONS.map((o) => (
              <option key={o.label} value={o.value ?? ''}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {problem && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-[10px] border border-danger-line bg-danger-bg px-3 py-2.5 text-[12.5px] leading-snug font-medium text-danger"
        >
          <AlertIcon size={16} className="mt-px shrink-0" />
          <span>{problem}</span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-ink-2">Color</span>
          {!editing && <span className="text-[11px] text-muted">Randomized on new tasks</span>}
        </div>
        <div className="flex gap-2.5" role="radiogroup" aria-label="Color">
          {COLOR_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={draft.color === k}
              aria-label={k}
              onClick={() => setDraft((d) => ({ ...d, color: k }))}
              style={{ background: COLOR_BAR[k] }}
              className={`size-[30px] rounded-full border-[2.5px] shadow-sm transition-transform hover:scale-105 ${
                draft.color === k ? 'border-accent dark:border-white' : 'border-transparent'
              }`}
            />
          ))}
        </div>
      </div>

      {showNotes ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink-2">Notes</span>
          <textarea
            className="field min-h-[72px] resize-y text-[13.5px]"
            value={draft.notes}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            placeholder="Links, details, a checklist…"
            maxLength={5000}
            autoFocus={!editing?.notes}
          />
        </label>
      ) : (
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="-mt-1 self-start text-[12.5px] font-semibold text-accent hover:underline dark:text-[#9AA8FF]"
        >
          + Add notes
        </button>
      )}

      <div className="flex items-center gap-2.5 pt-1">
        {editing && (
          <button
            type="button"
            onClick={() => {
              void removeTask(editing.id);
              onClose();
            }}
            className="btn mr-auto px-2.5 text-danger hover:bg-danger-bg"
            aria-label="Delete task"
          >
            <TrashIcon size={15} />
            <span className="max-sm:hidden">Delete</span>
          </button>
        )}
        <button type="button" className={`btn btn-ghost ${editing ? '' : 'ml-auto'}`} onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary px-4" disabled={!!problem || !draft.title.trim() || saving}>
          {editing ? 'Save' : 'Add task'}
        </button>
      </div>
    </form>
  );
}
