import { useSyncExternalStore } from 'react';

export interface Toast {
  id: number;
  message: string;
  tone: 'default' | 'error' | 'success';
  action?: { label: string; run: () => void };
  /** Milliseconds before auto-dismiss; 0 keeps it until dismissed. */
  duration: number;
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function toast(input: Partial<Omit<Toast, 'id'>> & { message: string }): number {
  const t: Toast = { tone: 'default', duration: 5000, ...input, id: nextId++ };
  toasts = [...toasts.slice(-2), t];
  emit();
  if (t.duration > 0) setTimeout(() => dismissToast(t.id), t.duration);
  return t.id;
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
  );
}
