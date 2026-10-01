import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePlanner } from '../app/PlannerContext';
import { changeTask } from '../data/actions';
import type { Task } from '../data/types';
import { toast } from '../hooks/useToasts';
import { chipClass } from '../lib/colors';
import type { ISODate } from '../lib/dates';
import { planMoveToDay, planMoveToTime, planUnschedule, type MovePlan } from '../lib/moves';
import { formatRange } from '../lib/time';

export type DropTarget =
  | { kind: 'day'; date: ISODate }
  | { kind: 'unassigned' }
  | { kind: 'unscheduled'; date: ISODate }
  | { kind: 'timeline'; date: ISODate; originMinute: number; hourHeight: number };

interface DragData {
  taskId: string;
}

export interface DropPreview {
  date: ISODate;
  start: number;
  end: number;
  blocked: boolean;
}

const ActiveTaskContext = createContext<string | null>(null);
const PreviewContext = createContext<DropPreview | null>(null);

export const useActiveTaskId = () => useContext(ActiveTaskContext);
export const useDropPreview = () => useContext(PreviewContext);

/** Big targets (day columns, the timeline) work best with the pointer position; keyboard falls back. */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

function timelineMinute(event: DragMoveEvent | DragEndEvent, target: DropTarget): number | null {
  if (target.kind !== 'timeline' || !event.over) return null;
  const rect = event.active.rect.current.translated;
  if (!rect) return null;
  return target.originMinute + ((rect.top - event.over.rect.top) / target.hourHeight) * 60;
}

export function PlannerDnd({ children }: { children: ReactNode }) {
  const { tasks, today } = usePlanner();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [preview, setPreview] = useState<DropPreview | null>(null);
  const previewKey = useRef('');

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // Long-press on touch screens so normal swipes still scroll the page.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    // Space picks up / drops; Enter is left free to open the task.
    useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] } }),
  );

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const activeTask = activeId ? byId.get(activeId) : undefined;

  const plan = (event: DragMoveEvent | DragEndEvent): { task: Task; plan: MovePlan } | null => {
    const task = byId.get((event.active.data.current as DragData | undefined)?.taskId ?? '');
    const target = event.over?.data.current as DropTarget | undefined;
    if (!task || !target) return null;
    if (target.kind === 'unassigned') return { task, plan: planMoveToDay(tasks, task, null, today) };
    if (target.kind === 'day') return { task, plan: planMoveToDay(tasks, task, target.date, today) };
    if (target.kind === 'unscheduled') return { task, plan: planUnschedule(task, target.date) };
    const minute = timelineMinute(event, target);
    return minute == null ? null : { task, plan: planMoveToTime(tasks, task, target.date, minute) };
  };

  const updatePreview = (next: DropPreview | null) => {
    const key = next ? `${next.date}|${next.start}|${next.end}|${next.blocked}` : '';
    if (key === previewKey.current) return;
    previewKey.current = key;
    setPreview(next);
  };

  const onDragMove = (event: DragMoveEvent) => {
    const target = event.over?.data.current as DropTarget | undefined;
    const result = target?.kind === 'timeline' ? plan(event) : null;
    if (!result || target?.kind !== 'timeline') return updatePreview(null);
    const length = result.task.start != null && result.task.end != null ? result.task.end - result.task.start : 60;
    if (result.plan.ok) {
      const { start, end } = result.plan.patch as { start: number; end: number };
      updatePreview({ date: target.date, start, end, blocked: false });
    } else {
      const minute = timelineMinute(event, target) ?? 0;
      const start = Math.max(0, Math.round(minute / 15) * 15);
      updatePreview({ date: target.date, start, end: start + length, blocked: true });
    }
  };

  const reset = () => {
    setActiveId(null);
    updatePreview(null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const result = plan(event);
    reset();
    if (!result) return;
    const { task, plan: p } = result;
    if (!p.ok) {
      toast({ message: p.message, tone: 'error' });
      return;
    }
    const unchanged = Object.entries(p.patch).every(([k, v]) => task[k as keyof Task] === v);
    if (!unchanged) void changeTask(task.id, p.patch, p.message);
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(byId, active.data.current)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${titleOf(byId, active.data.current)} is over ${describe(over.data.current as DropTarget)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `${titleOf(byId, active.data.current)} dropped on ${describe(over.data.current as DropTarget)}.`
        : `${titleOf(byId, active.data.current)} dropped.`,
    onDragCancel: ({ active }) => `Moving ${titleOf(byId, active.data.current)} was cancelled.`,
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      accessibility={{ announcements }}
      onDragStart={(e: DragStartEvent) => setActiveId((e.active.data.current as DragData).taskId)}
      onDragMove={onDragMove}
      onDragOver={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
    >
      <ActiveTaskContext.Provider value={activeId}>
        <PreviewContext.Provider value={preview}>{children}</PreviewContext.Provider>
      </ActiveTaskContext.Provider>
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div
            className={`chip ${chipClass(activeTask.color)} w-[220px] rounded-[9px] px-3 py-2 shadow-xl ring-2 ring-accent/40 rotate-[1.5deg]`}
          >
            <div className="truncate text-[13px] font-semibold">{activeTask.title}</div>
            {activeTask.start != null && (
              <div className="mt-0.5 font-mono text-[10.5px] opacity-80">
                {formatRange(activeTask.start, activeTask.end)}
              </div>
            )}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function titleOf(byId: Map<string, Task>, data: unknown): string {
  return byId.get((data as DragData | undefined)?.taskId ?? '')?.title ?? 'task';
}

function describe(target: DropTarget | undefined): string {
  if (!target) return 'nothing';
  if (target.kind === 'unassigned') return 'Unassigned';
  if (target.kind === 'unscheduled') return `unscheduled on ${target.date}`;
  if (target.kind === 'day') return target.date;
  return `the ${target.date} schedule`;
}

export function useDraggableTask(taskId: string) {
  return useDraggable({ id: `task:${taskId}`, data: { taskId } satisfies DragData });
}

export function useDropTarget(id: string, target: DropTarget) {
  return useDroppable({ id, data: target });
}
