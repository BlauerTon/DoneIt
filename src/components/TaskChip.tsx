import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import type { Task } from '../data/types';
import { useDraggableTask } from '../dnd/PlannerDnd';
import { chipClass } from '../lib/colors';
import { CheckIcon, XIcon } from './icons';

interface DraggableTaskProps {
  task: Task;
  className?: string;
  children: ReactNode;
  onOpen?: () => void;
}

/** A task card that can be dragged (mouse, long-press, or Space key) and opened (click / Enter). */
export function DraggableTask({ task, className = '', children, onOpen }: DraggableTaskProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggableTask(task.id);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={task.title}
      onClick={onOpen}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onOpen?.();
        else listeners?.onKeyDown?.(e);
      }}
      className={`chip ${chipClass(task.color)} select-none [-webkit-touch-callout:none] touch-manipulation ${
        isDragging ? 'opacity-40' : ''
      } ${task.done ? 'opacity-60' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

const stop = (e: MouseEvent | React.PointerEvent | React.TouchEvent) => e.stopPropagation();

export function TaskCheckbox({
  done,
  onToggle,
  size = 15,
  tone = 'chip',
  label,
}: {
  done: boolean;
  onToggle: () => void;
  size?: number;
  tone?: 'chip' | 'accent';
  label: string;
}) {
  const accent = tone === 'accent';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Mark “${label}” as not done` : `Mark “${label}” as done`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onMouseDown={stop}
      onTouchStart={stop}
      onKeyDown={(e) => e.stopPropagation()}
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-[4px] border-[1.5px] p-0 transition-colors ${
        accent
          ? done
            ? 'border-accent bg-accent text-white'
            : 'border-muted bg-transparent text-transparent hover:border-accent'
          : 'border-current bg-transparent'
      }`}
    >
      {done && <CheckIcon size={size - 5} />}
    </button>
  );
}

export function DeleteButton({ onDelete, label, className = '' }: { onDelete: () => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      aria-label={`Delete “${label}”`}
      title="Delete"
      onClick={(e) => {
        e.stopPropagation();
        onDelete();
      }}
      onMouseDown={stop}
      onTouchStart={stop}
      onKeyDown={(e) => e.stopPropagation()}
      className={`shrink-0 rounded p-0.5 opacity-50 hover:opacity-100 ${className}`}
    >
      <XIcon size={13} />
    </button>
  );
}
