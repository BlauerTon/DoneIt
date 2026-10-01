import { useEffect, useRef } from 'react';

export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'N', action: 'New task' },
  { keys: '1 / 2 / 3', action: 'Tasks / Today / Week' },
  { keys: 'T', action: 'Jump to today' },
  { keys: '← / →', action: 'Previous / next day (day view)' },
  { keys: '/', action: 'Search tasks' },
  { keys: 'Space', action: 'Pick up / drop a focused task' },
  { keys: 'Enter', action: 'Open a focused task' },
  { keys: 'Ctrl + Enter', action: 'Save the task form' },
  { keys: 'Esc', action: 'Close dialogs' },
  { keys: '?', action: 'Show shortcuts' },
];

type Handlers = Record<string, () => void>;

/** Single-key shortcuts, ignored while typing or when a dialog is open. */
export function useShortcuts(handlers: Handlers, enabled: boolean): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      const fn = ref.current[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
