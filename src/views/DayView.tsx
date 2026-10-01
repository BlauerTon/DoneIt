import { useMemo, useState } from 'react';
import { usePlanner } from '../app/PlannerContext';
import { ChevronLeftIcon, ChevronRightIcon } from '../components/icons';
import { QuickAdd } from '../components/QuickAdd';
import { DeleteButton, DraggableTask, TaskCheckbox } from '../components/TaskChip';
import { removeTask, toggleTask } from '../data/actions';
import type { Task } from '../data/types';
import { useDropTarget } from '../dnd/PlannerDnd';
import { COLOR_BAR } from '../lib/colors';
import { addDaysISO, dowLong, longLabel, relativeLabel } from '../lib/dates';
import { isScheduled, type ScheduledTask } from '../lib/schedule';
import { formatTime } from '../lib/time';
import { Timeline } from './Timeline';

export function DayView() {
  const { visible, date, today, openDay } = usePlanner();
  const [showAllHours, setShowAllHours] = useState(false);

  const { scheduled, unscheduled } = useMemo(() => {
    const onDay = visible.filter((t) => t.date === date);
    return {
      scheduled: onDay.filter(isScheduled).sort((a, b) => a.start - b.start) as ScheduledTask[],
      unscheduled: onDay.filter((t) => !isScheduled(t)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    };
  }, [visible, date]);

  const isToday = date === today;
  const rel = relativeLabel(date, today);

  return (
    <div className="flex min-h-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 px-[30px] pt-[22px] pb-4 max-md:px-4 max-md:pt-3.5 max-md:pb-2.5">
        <div className="flex items-center gap-3">
          <button type="button" className="btn btn-ghost size-8 p-0" aria-label="Previous day" onClick={() => openDay(addDaysISO(date, -1))}>
            <ChevronLeftIcon size={16} />
          </button>
          <div>
            <h1 className="m-0 flex items-baseline gap-2 text-[22px] font-bold tracking-tight text-ink max-sm:text-[19px]">
              {longLabel(date)}
              {(rel === 'Today' || rel === 'Tomorrow' || rel === 'Yesterday') && (
                <span className="rounded bg-accent-soft px-1.5 py-px font-mono text-[9.5px] font-bold tracking-wider text-accent uppercase dark:text-[#9AA8FF]">
                  {rel}
                </span>
              )}
            </h1>
            <div className="mt-0.5 text-[13px] text-muted">
              {scheduled.length} scheduled · {unscheduled.length} unscheduled
            </div>
          </div>
          <button type="button" className="btn btn-ghost size-8 p-0" aria-label="Next day" onClick={() => openDay(addDaysISO(date, 1))}>
            <ChevronRightIcon size={16} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-ghost text-xs" onClick={() => setShowAllHours((v) => !v)} aria-pressed={showAllHours}>
            {showAllHours ? '24h view' : 'Standard 6–23h'}
          </button>
          {!isToday && (
            <button type="button" className="btn btn-accent-outline" onClick={() => openDay(today)}>
              Today
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-start gap-6 px-[30px] pt-1 pb-10 max-md:flex-col max-md:gap-4 max-md:px-4">
        <section className="card min-w-0 flex-[1_1_460px] px-[18px] pt-3.5 pb-[18px] max-md:w-full max-md:flex-auto max-sm:px-3">
          <div className="flex items-center justify-between pb-2.5">
            <span className="label-mono">Schedule</span>
            <span className="font-mono text-[10px] text-muted max-sm:hidden">Tap a slot to add · drag to move · drag edges to resize</span>
          </div>
          <Timeline date={date} scheduled={scheduled} showAllHours={showAllHours} />
        </section>

        {/* On phones the panels join the parent column so "Unscheduled" can sit above the timeline. */}
        <section className="flex min-w-[260px] flex-[0_1_300px] flex-col gap-3 max-md:contents">
          <UnscheduledPanel date={date} tasks={unscheduled} />
          <NextUp />
        </section>
      </div>
    </div>
  );
}

function UnscheduledPanel({ date, tasks }: { date: string; tasks: Task[] }) {
  const { openEditTask } = usePlanner();
  const { setNodeRef, isOver } = useDropTarget(`unscheduled:${date}`, { kind: 'unscheduled', date });
  return (
    <div
      ref={setNodeRef}
      className={`card px-[18px] py-4 transition-shadow max-md:order-first max-md:w-full ${isOver ? 'ring-2 ring-accent/40' : ''}`}
    >
      <div className="label-mono pb-1">Unscheduled</div>
      <div className="pb-3 text-xs text-muted">Drag onto a time slot to schedule.</div>
      <div className="flex flex-col gap-[7px]">
        {tasks.map((t) => (
          <DraggableTask
            key={t.id}
            task={t}
            onOpen={() => openEditTask(t.id)}
            className="flex cursor-grab items-center gap-2.5 rounded-[9px] px-[11px] py-[9px] active:cursor-grabbing"
          >
            <TaskCheckbox done={t.done} onToggle={() => void toggleTask(t.id)} label={t.title} />
            <span className={`min-w-0 flex-1 text-[13.5px] font-medium ${t.done ? 'line-through' : ''}`}>{t.title}</span>
            <DeleteButton onDelete={() => void removeTask(t.id)} label={t.title} />
          </DraggableTask>
        ))}
        {!tasks.length && <div className="py-1 text-[13px] text-muted">Nothing waiting. Day is fully planned.</div>}
      </div>
      <div className="mt-3 border-t border-line-soft pt-3">
        <QuickAdd defaultDate={date} placeholder="Add to this day…" compact />
      </div>
    </div>
  );
}

function NextUp() {
  const { visible, date, today, openDay } = usePlanner();
  const days = [1, 2].map((n) => {
    const iso = addDaysISO(date, n);
    const list = visible.filter((t) => t.date === iso);
    const timed = list.filter(isScheduled).sort((a, b) => a.start - b.start) as ScheduledTask[];
    const rest = list.length - Math.min(timed.length, 3);
    return { iso, timed: timed.slice(0, 3), rest, total: list.length };
  });

  return (
    <div className="card px-[18px] py-4 max-md:w-full">
      <div className="label-mono pb-2.5">Next up</div>
      <div className="flex flex-col gap-3">
        {days.map((d, i) => (
          <div key={d.iso}>
            <button
              type="button"
              onClick={() => openDay(d.iso)}
              className="pb-1.5 text-left text-[12.5px] font-semibold text-ink hover:text-accent"
            >
              {i === 0 && date === today ? 'Tomorrow' : dowLong(d.iso)}
            </button>
            <div className="flex flex-col gap-[5px]">
              {d.timed.map((t) => (
                <div key={t.id} className="flex items-center gap-[9px]">
                  <span className="size-[7px] shrink-0 rounded-full" style={{ background: COLOR_BAR[t.color] }} />
                  <span className="w-10 shrink-0 font-mono text-[11px] text-muted">{formatTime(t.start)}</span>
                  <span className={`truncate text-[13px] text-ink-2 ${t.done ? 'line-through opacity-60' : ''}`}>{t.title}</span>
                </div>
              ))}
              <div className="text-[11.5px] text-muted">
                {d.rest > 0
                  ? `${d.rest} more ${d.rest === 1 ? 'task' : 'tasks'}`
                  : d.total
                    ? ''
                    : 'Nothing planned yet'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
