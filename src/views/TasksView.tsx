import { useMemo, useState } from 'react';
import { usePlanner } from '../app/PlannerContext';
import { BellIcon, ChevronDownIcon, SearchIcon, XIcon } from '../components/icons';
import { QuickAdd } from '../components/QuickAdd';
import { DeleteButton, TaskCheckbox } from '../components/TaskChip';
import { changeTask, removeTask, toggleTask } from '../data/actions';
import type { Task } from '../data/types';
import { COLOR_BAR } from '../lib/colors';
import { addDaysISO, dayOptions, dowLong, relativeLabel, shortLabel } from '../lib/dates';
import { findConflict } from '../lib/schedule';
import { reminderLabel } from '../lib/reminders';
import { formatRange } from '../lib/time';

interface Group {
  key: string;
  label: string;
  items: Task[];
  tone?: 'warn';
  collapsible?: boolean;
}

const sortTasks = (a: Task, b: Task) =>
  (a.date ?? '').localeCompare(b.date ?? '') ||
  (a.start ?? 9999) - (b.start ?? 9999) ||
  a.createdAt.localeCompare(b.createdAt);

export function TasksView() {
  const { tasks, visible, today } = usePlanner();
  const [query, setQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const groups = useMemo<Group[]>(() => {
    const q = query.trim().toLowerCase();
    const list = visible
      .filter((t) => !q || t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q))
      .sort(sortTasks);
    const weekEnd = addDaysISO(today, 6);
    const out: Group[] = [
      { key: 'overdue', label: 'Overdue', items: list.filter((t) => t.date && t.date < today && !t.done), tone: 'warn' },
      { key: 'unassigned', label: 'Unassigned', items: list.filter((t) => !t.date) },
    ];
    for (let i = 0; i < 7; i++) {
      const iso = addDaysISO(today, i);
      out.push({
        key: iso,
        label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dowLong(iso),
        items: list.filter((t) => t.date === iso),
      });
    }
    out.push({ key: 'later', label: 'Later', items: list.filter((t) => t.date && t.date > weekEnd) });
    out.push({
      key: 'done-past',
      label: 'Completed earlier',
      items: list.filter((t) => t.date && t.date < today && t.done).reverse(),
      collapsible: true,
    });
    // Unassigned always shows (it is the inbox); other empty groups are hidden.
    return out.filter((g) => g.items.length || g.key === 'unassigned');
  }, [visible, today, query]);

  const open = tasks.filter((t) => !t.done).length;
  const needDay = tasks.filter((t) => !t.date && !t.done).length;

  return (
    <div className="max-w-[760px] px-[30px] pt-[22px] pb-12 max-md:px-4 max-md:pt-4 max-md:pb-24">
      <header className="pb-5">
        <h1 className="m-0 text-[22px] font-bold tracking-tight text-ink">Tasks</h1>
        <div className="mt-0.5 text-[13px] text-muted">
          {open} open · {needDay} still need a day
        </div>
      </header>

      <QuickAdd defaultDate={null} />

      <div className="relative mt-5 mb-6">
        <SearchIcon size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input
          id="task-search"
          className="field py-2 pr-8 pl-9 text-[13px]"
          placeholder="Search tasks and notes  ( / )"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search tasks"
          type="search"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery('')}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink"
          >
            <XIcon size={13} />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-[26px]">
        {groups.map((g) => {
          const collapsed = g.collapsible && !openGroups[g.key];
          return (
            <section key={g.key}>
              <button
                type="button"
                disabled={!g.collapsible}
                onClick={() => setOpenGroups((s) => ({ ...s, [g.key]: !s[g.key] }))}
                className="mb-2.5 flex w-full items-center justify-between border-b border-line-soft pb-[7px] text-left disabled:cursor-default"
              >
                <span className={`label-mono flex items-center gap-1 ${g.tone === 'warn' ? 'text-danger!' : ''}`}>
                  {g.collapsible && <ChevronDownIcon size={12} className={collapsed ? '-rotate-90' : ''} />}
                  {g.label}
                </span>
                <span className="font-mono text-[10px] text-muted">{g.items.length}</span>
              </button>
              {!collapsed && (
                <div className="flex flex-col gap-1.5">
                  {g.items.map((t) => (
                    <TaskRow key={t.id} task={t} />
                  ))}
                  {!g.items.length && (
                    <div className="py-1 text-[13px] text-muted">
                      {query ? 'No matches.' : 'Inbox zero. Everything has a day.'}
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
        {query && groups.every((g) => !g.items.length) && <p className="text-[13px] text-muted">No tasks match “{query}”.</p>}
      </div>
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const { tasks, today, openEditTask } = usePlanner();
  const options = useMemo(() => dayOptions(today, task.date), [today, task.date]);

  const assign = (value: string) => {
    const date = value || null;
    // Keep the time when moving a timed task, unless it would clash on the new day.
    const keepTime =
      date && task.start != null && task.end != null && !findConflict(tasks, date, { start: task.start, end: task.end }, task.id);
    void changeTask(
      task.id,
      { date, start: keepTime ? task.start : null, end: keepTime ? task.end : null },
      date ? `Moved to ${relativeLabel(date, today)}` : 'Unassigned',
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-[10px] border border-line bg-card px-3 py-[9px]">
      <TaskCheckbox
        done={task.done}
        onToggle={() => void toggleTask(task.id)}
        size={17}
        tone="accent"
        label={task.title}
      />
      <span className="size-2 shrink-0 rounded-full" style={{ background: COLOR_BAR[task.color] }} />
      <button
        type="button"
        onClick={() => openEditTask(task.id)}
        className={`min-w-[140px] flex-1 text-left text-sm ${task.done ? 'text-muted line-through' : 'text-ink'} hover:text-accent`}
        title="Edit task"
      >
        {task.title}
        {task.notes && <span className="ml-1.5 text-[11px] text-muted no-underline">· notes</span>}
      </button>
      {task.start != null && (
        <span className="flex items-center gap-1 font-mono text-[11px] text-muted">
          {formatRange(task.start, task.end)}
          {task.remindBefore != null && !task.done && (
            <span title={`Reminder: ${reminderLabel(task.remindBefore)}`} className="flex">
              <BellIcon size={11} aria-label={`Reminder ${reminderLabel(task.remindBefore)}`} />
            </span>
          )}
        </span>
      )}
      {task.date && task.date < today && <span className="font-mono text-[11px] text-muted">{shortLabel(task.date)}</span>}
      <select
        value={task.date ?? ''}
        onChange={(e) => assign(e.target.value)}
        aria-label={`Day for “${task.title}”`}
        className="max-w-[190px] cursor-pointer rounded-lg border border-field-line bg-field px-2 py-1.5 text-xs text-ink"
      >
        {options.map((o) => (
          <option key={o.value || 'none'} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <DeleteButton onDelete={() => void removeTask(task.id)} label={task.title} className="text-muted hover:text-danger" />
    </div>
  );
}
