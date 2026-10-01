import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { usePlanner } from '../app/PlannerContext';
import { PlusIcon } from '../components/icons';
import { DeleteButton, DraggableTask } from '../components/TaskChip';
import { removeTask } from '../data/actions';
import type { Task } from '../data/types';
import { useDropTarget } from '../dnd/PlannerDnd';
import { addDaysISO, daysBetween, dayNumber, dowShort, rangeTitle, weekStartISO, type ISODate } from '../lib/dates';
import { formatRange } from '../lib/time';

/** Sorts a day's tasks: timed ones by start, then unscheduled ones in creation order. */
function byTime(a: Task, b: Task) {
  if (a.start != null && b.start != null) return a.start - b.start;
  if (a.start != null) return -1;
  if (b.start != null) return 1;
  return a.createdAt.localeCompare(b.createdAt);
}

export function WeekView() {
  const { visible, today, openNewTask } = usePlanner();
  const scroller = useRef<HTMLDivElement>(null);
  const todayCol = useRef<HTMLDivElement>(null);

  const weekStart = weekStartISO(today);
  const pastDays = Array.from({ length: daysBetween(weekStart, today) }, (_, i) => addDaysISO(weekStart, i));
  const comingDays = Array.from({ length: 6 }, (_, i) => addDaysISO(today, i + 1));

  const byDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of visible) {
      const key = t.date ?? '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    for (const list of map.values()) list.sort(byTime);
    return map;
  }, [visible]);

  const scrollToToday = useCallback((smooth: boolean) => {
    const box = scroller.current;
    const col = todayCol.current;
    if (!box || !col) return;
    const pad = parseFloat(getComputedStyle(box).paddingLeft) || 0;
    const left = Math.max(0, box.scrollLeft + col.getBoundingClientRect().left - box.getBoundingClientRect().left - pad);
    box.scrollTo({ left, behavior: smooth ? 'smooth' : ('instant' as ScrollBehavior) });
  }, []);

  // Open with today anchored at the left edge; earlier days stay one scroll away.
  useLayoutEffect(() => scrollToToday(false), [scrollToToday, today]);

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4 px-[30px] pt-[22px] pb-[18px] max-md:px-4 max-md:pt-3.5 max-md:pb-3">
        <div>
          <h1 className="m-0 text-[22px] font-bold tracking-tight text-ink max-sm:text-[19px]">{rangeTitle(today, addDaysISO(today, 6))}</h1>
          <div className="mt-0.5 text-[13px] text-muted">
            Today onwards. {pastDays.length ? 'Scroll left for earlier days this week.' : ''} Drag tasks between days.
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pastDays.length > 0 && (
            <button type="button" className="btn btn-ghost text-xs" onClick={() => scroller.current?.scrollTo({ left: 0, behavior: 'smooth' })}>
              ‹ Earlier
            </button>
          )}
          <button type="button" className="btn btn-accent-outline text-xs" onClick={() => scrollToToday(true)}>
            Today
          </button>
          <button type="button" className="btn btn-primary max-md:hidden" onClick={() => openNewTask()}>
            + New task
          </button>
        </div>
      </header>

      <div
        ref={scroller}
        className="flex items-stretch gap-3 overflow-x-auto overscroll-x-contain px-[30px] pb-6 max-md:px-4 max-md:pb-5 [scroll-padding-inline:30px] max-md:[scroll-padding-inline:16px]"
      >
        <UnassignedColumn tasks={byDate.get('') ?? []} />
        {pastDays.map((iso) => (
          <DayColumn key={iso} date={iso} tasks={byDate.get(iso) ?? []} kind="past" />
        ))}
        <DayColumn ref={todayCol} date={today} tasks={byDate.get(today) ?? []} kind="today" />
        {comingDays.map((iso, i) => (
          <DayColumn key={iso} date={iso} tasks={byDate.get(iso) ?? []} kind={i === 0 ? 'tomorrow' : 'future'} />
        ))}
      </div>
    </div>
  );
}

function UnassignedColumn({ tasks }: { tasks: Task[] }) {
  const { openEditTask, openNewTask } = usePlanner();
  const { setNodeRef, isOver } = useDropTarget('unassigned', { kind: 'unassigned' });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-[218px] shrink-0 flex-col rounded-[13px] border border-dashed bg-card p-3.5 transition-colors ${
        isOver ? 'border-accent bg-accent-soft' : 'border-line'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="label-mono tracking-[0.1em]">Unassigned</span>
        <AddButton label="Add unassigned task" onClick={() => openNewTask()} />
      </div>
      <div className="pt-1 pb-3 text-xs text-muted">
        {tasks.length === 1 ? '1 task waiting' : `${tasks.length} tasks waiting`}
      </div>
      <div className="flex flex-col gap-[7px]">
        {tasks.map((t) => (
          <DraggableTask
            key={t.id}
            task={t}
            onOpen={() => openEditTask(t.id)}
            className="flex cursor-grab items-center justify-between gap-1.5 rounded-[9px] px-[11px] py-[9px] text-[13px] font-medium active:cursor-grabbing"
          >
            <span className={`min-w-0 flex-1 ${t.done ? 'line-through' : ''}`}>{t.title}</span>
            <DeleteButton onDelete={() => void removeTask(t.id)} label={t.title} />
          </DraggableTask>
        ))}
      </div>
    </div>
  );
}

interface DayColumnProps {
  date: ISODate;
  tasks: Task[];
  kind: 'past' | 'today' | 'tomorrow' | 'future';
  ref?: React.Ref<HTMLDivElement>;
}

function DayColumn({ date, tasks, kind, ref }: DayColumnProps) {
  const { openDay, openEditTask, openNewTask } = usePlanner();
  const { setNodeRef, isOver } = useDropTarget(`day:${date}`, { kind: 'day', date });
  const today = kind === 'today';
  const badge = kind === 'today' ? 'TODAY' : kind === 'tomorrow' ? 'TOMORROW' : kind === 'past' ? 'PAST' : '';

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        if (typeof ref === 'function') ref(el);
        else if (ref) (ref as React.RefObject<HTMLDivElement | null>).current = el;
      }}
      data-testid={`week-day-${date}`}
      className={`flex min-w-[165px] flex-[1_1_165px] flex-col rounded-[13px] px-3 py-3.5 transition-[opacity,box-shadow] ${
        today
          ? 'border-2 border-accent bg-col-today shadow-[0_2px_8px_rgb(47_68_200/0.12)]'
          : 'border border-line bg-col'
      } ${kind === 'past' && !isOver ? 'opacity-70' : ''} ${isOver ? 'ring-2 ring-accent/50' : ''}`}
    >
      <div className="flex items-baseline justify-between gap-1">
        <button type="button" onClick={() => openDay(date)} className="flex items-baseline gap-[7px] text-left" title="Open day">
          <span className="font-mono text-[10px] tracking-[0.1em] text-muted">{dowShort(date)}</span>
          <span className={`text-[15px] font-bold ${today ? 'text-accent dark:text-[#9AA8FF]' : 'text-ink'}`}>{dayNumber(date)}</span>
        </button>
        <div className="flex items-center gap-1">
          {badge && (
            <span
              className={`font-mono text-[9.5px] font-semibold ${
                today ? 'rounded bg-accent-soft px-1.5 py-px font-bold text-accent dark:text-[#9AA8FF]' : 'text-muted'
              }`}
            >
              {badge}
            </span>
          )}
          <AddButton label={`Add task on ${date}`} onClick={() => openNewTask({ date })} />
        </div>
      </div>
      <div className="pt-[5px] pb-3 text-[11.5px] text-muted">{tasks.length === 1 ? '1 task' : `${tasks.length} tasks`}</div>
      <div className="flex flex-1 flex-col gap-1.5">
        {tasks.map((t) => (
          <DraggableTask
            key={t.id}
            task={t}
            onOpen={() => openEditTask(t.id)}
            className="cursor-grab rounded-lg px-2.5 py-2 active:cursor-grabbing"
          >
            <div className={`text-[12.5px] leading-snug font-semibold ${t.done ? 'line-through' : ''}`}>{t.title}</div>
            <div className="mt-0.5 font-mono text-[10px] opacity-80">{t.start != null ? formatRange(t.start, t.end) : 'Unscheduled'}</div>
          </DraggableTask>
        ))}
        {!tasks.length && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-line-soft py-4 text-[11.5px] text-muted">
            Drop tasks here
          </div>
        )}
      </div>
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title="Add task"
      onClick={onClick}
      className="flex size-5 items-center justify-center rounded text-muted hover:bg-hover hover:text-ink"
    >
      <PlusIcon size={13} />
    </button>
  );
}
