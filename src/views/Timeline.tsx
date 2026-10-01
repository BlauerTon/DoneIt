import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { usePlanner } from '../app/PlannerContext';
import { BellIcon } from '../components/icons';
import { DraggableTask, TaskCheckbox } from '../components/TaskChip';
import { changeTask, toggleTask } from '../data/actions';
import { useDropPreview, useDropTarget } from '../dnd/PlannerDnd';
import { hourHeight, useSettings } from '../hooks/useSettings';
import { useNowMinutes } from '../hooks/useToday';
import type { ISODate } from '../lib/dates';
import { freeWindow, layoutLanes, type ScheduledTask } from '../lib/schedule';
import { DAY_MINUTES, MIN_DURATION, clamp, formatRange, formatTime, snap } from '../lib/time';

const DEFAULT_START_H = 6;
const DEFAULT_END_H = 23;
const GUTTER = 54;

interface TimelineProps {
  date: ISODate;
  scheduled: ScheduledTask[];
  showAllHours: boolean;
}

export function Timeline({ date, scheduled, showAllHours }: TimelineProps) {
  const { today, openNewTask } = usePlanner();
  const { density } = useSettings();
  const hh = hourHeight(density);
  const [earlier, setEarlier] = useState(false);
  const [later, setLater] = useState(false);
  const now = useNowMinutes();
  const isToday = date === today;

  // The visible range grows to include any scheduled task, and on request to the full day.
  let startH = showAllHours || earlier ? 0 : DEFAULT_START_H;
  let endH = showAllHours || later ? 24 : DEFAULT_END_H;
  for (const t of scheduled) {
    startH = Math.min(startH, Math.floor(t.start / 60));
    endH = Math.max(endH, Math.ceil(t.end / 60));
  }
  const origin = startH * 60;
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i);
  const lanes = useMemo(() => layoutLanes(scheduled), [scheduled]);

  const { setNodeRef, isOver } = useDropTarget(`timeline:${date}`, {
    kind: 'timeline',
    date,
    originMinute: origin,
    hourHeight: hh,
  });
  const preview = useDropPreview();
  const showPreview = isOver && preview && preview.date === date;

  // Bring the current time (or the first task) into view when opening a day.
  const scrollAnchor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollAnchor.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < 80 || rect.bottom > window.innerHeight - 80) {
      el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    }
  }, [date]);
  const anchorMinute = isToday ? now : scheduled[0]?.start;

  const createAt = (clientY: number, top: number) => {
    const minute = clamp(Math.floor((origin + ((clientY - top) / hh) * 60) / 30) * 30, 0, DAY_MINUTES - 30);
    openNewTask({ date, start: minute, end: Math.min(DAY_MINUTES, minute + 60) });
  };

  return (
    <div>
      {!showAllHours && startH > 0 && (
        <RangeButton onClick={() => setEarlier(true)}>▲ Show earlier hours (00:00 – {formatTime(origin)})</RangeButton>
      )}

      <div
        ref={setNodeRef}
        className={`relative rounded-lg transition-shadow ${isOver ? 'ring-2 ring-accent/30' : ''}`}
        style={{ height: hours.length * hh }}
      >
        {hours.map((h) => (
          <div
            key={h}
            className="flex cursor-copy items-start gap-3 border-t border-slot hover:bg-hover"
            style={{ height: hh }}
            onClick={(e) => createAt(e.clientY, e.currentTarget.parentElement!.getBoundingClientRect().top)}
          >
            <span className="w-[42px] shrink-0 pt-1 font-mono text-[11px] text-muted select-none">{formatTime(h * 60)}</span>
          </div>
        ))}
        <span className="absolute -bottom-2 left-0 w-[42px] font-mono text-[11px] text-muted select-none">
          {formatTime(endH * 60)}
        </span>

        <div className="pointer-events-none absolute inset-y-0 right-1.5" style={{ left: GUTTER }}>
          {anchorMinute != null && anchorMinute >= origin && anchorMinute <= endH * 60 && (
            <div ref={scrollAnchor} className="absolute h-px w-px" style={{ top: ((anchorMinute - origin) / 60) * hh }} />
          )}

          {isToday && now >= origin && now <= endH * 60 && (
            <div
              className="absolute right-0 z-20 flex items-center"
              style={{ top: ((now - origin) / 60) * hh, left: -8 }}
              aria-hidden
            >
              <span className="size-2.5 rounded-full bg-[#E5484D]" />
              <span className="h-[2px] flex-1 bg-[#E5484D]" />
            </div>
          )}

          {lanes.map(({ item, lane, lanes: count }) => (
            <TimelineBlock
              key={item.id}
              task={item}
              origin={origin}
              hh={hh}
              lane={lane}
              lanes={count}
            />
          ))}

          {showPreview && (
            <div
              className={`absolute inset-x-0 z-30 flex items-start rounded-[9px] border-2 border-dashed px-2.5 py-1 font-mono text-[11px] font-semibold ${
                preview.blocked ? 'border-danger bg-danger-bg/70 text-danger' : 'border-accent bg-accent-soft/80 text-accent dark:text-[#9AA8FF]'
              }`}
              style={{
                top: ((preview.start - origin) / 60) * hh,
                height: Math.max(26, ((preview.end - preview.start) / 60) * hh - 3),
              }}
            >
              {preview.blocked ? 'Slot taken' : formatRange(preview.start, preview.end)}
            </div>
          )}
        </div>
      </div>

      {!showAllHours && endH < 24 && (
        <RangeButton onClick={() => setLater(true)} className="mt-3">
          ▼ Show later hours ({formatTime(endH * 60)} – 24:00)
        </RangeButton>
      )}
    </div>
  );
}

function RangeButton({ onClick, children, className = 'mb-2' }: { onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border border-dashed border-line py-1.5 font-mono text-[11.5px] text-muted hover:border-muted hover:text-ink ${className}`}
    >
      {children}
    </button>
  );
}

interface BlockProps {
  task: ScheduledTask;
  origin: number;
  hh: number;
  lane: number;
  lanes: number;
}

function TimelineBlock({ task, origin, hh, lane, lanes }: BlockProps) {
  const { tasks, openEditTask } = usePlanner();
  const [live, setLive] = useState<{ start: number; end: number } | null>(null);
  const start = live?.start ?? task.start;
  const end = live?.end ?? task.end;
  const top = ((start - origin) / 60) * hh;
  const height = Math.max(28, ((end - start) / 60) * hh - 3);
  const short = height < 46;

  /** Drag the top or bottom edge in 15-minute steps, clamped so it never overlaps a neighbour. */
  const beginResize = (edge: 'top' | 'bottom') => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const bounds = freeWindow(tasks, task.date!, task);
    let latest = { start: task.start, end: task.end };

    const move = (ev: PointerEvent) => {
      const delta = snap(((ev.clientY - startY) / hh) * 60);
      latest =
        edge === 'bottom'
          ? { start: task.start, end: clamp(task.end + delta, task.start + MIN_DURATION, bounds.end) }
          : { start: clamp(task.start + delta, bounds.start, task.end - MIN_DURATION), end: task.end };
      setLive(latest);
    };
    const finish = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', finish);
      setLive(null);
      if (latest.start !== task.start || latest.end !== task.end) {
        void changeTask(task.id, latest, `Now ${formatRange(latest.start, latest.end)}`);
      }
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  };

  const width = 100 / lanes;
  return (
    <div
      className="pointer-events-auto absolute"
      style={{ top, height, left: `calc(${lane * width}% + ${lane ? 2 : 0}px)`, width: `calc(${width}% - ${lanes > 1 ? 2 : 0}px)` }}
    >
      <DraggableTask
        task={task}
        onOpen={() => openEditTask(task.id)}
        className={`group relative flex h-full cursor-grab flex-col overflow-hidden rounded-[9px] border-l-[3.5px] px-2.5 shadow-[0_1px_3px_rgb(0_0_0/0.06)] active:cursor-grabbing ${
          short ? 'justify-center py-0.5' : 'py-1.5'
        } ${live ? 'z-10 ring-2 ring-accent/40' : ''}`}
      >
        <ResizeHandle edge="top" onPointerDown={beginResize('top')} />
        <div className={`flex min-w-0 gap-2 ${short ? 'items-center' : 'items-start'}`}>
          <TaskCheckbox done={task.done} onToggle={() => void toggleTask(task.id)} label={task.title} size={14} />
          <div className={`min-w-0 flex-1 ${short ? 'flex items-baseline gap-2' : ''}`}>
            <div className={`truncate text-[13.5px] leading-tight font-semibold ${task.done ? 'line-through' : ''}`}>
              {task.title}
            </div>
            <div className={`flex items-center gap-1 font-mono text-[10.5px] whitespace-nowrap opacity-80 ${short ? '' : 'mt-0.5'}`}>
              {formatRange(start, end)}
              {task.remindBefore != null && !task.done && <BellIcon size={10} aria-label="Has reminder" />}
            </div>
            {!short && height > 70 && task.notes && (
              <div className="mt-1 line-clamp-2 text-[11.5px] opacity-75">{task.notes}</div>
            )}
          </div>
        </div>
        <ResizeHandle edge="bottom" onPointerDown={beginResize('bottom')} />
      </DraggableTask>
    </div>
  );
}

function ResizeHandle({ edge, onPointerDown }: { edge: 'top' | 'bottom'; onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void }) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div
      role="separator"
      aria-label={edge === 'top' ? 'Drag to change start time' : 'Drag to change end time'}
      title={edge === 'top' ? 'Drag to change start time' : 'Drag to extend'}
      onPointerDown={onPointerDown}
      onMouseDown={stop}
      onTouchStart={stop}
      onClick={stop}
      className={`absolute inset-x-0 z-10 flex h-2.5 cursor-ns-resize touch-none items-center justify-center ${
        edge === 'top' ? 'top-0' : 'bottom-0'
      }`}
    >
      <span className="h-[2.5px] w-[26px] rounded-sm bg-(--chip-bar) opacity-50 transition-opacity group-hover:opacity-90" />
    </div>
  );
}

