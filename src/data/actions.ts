import { toast } from '../hooks/useToasts';
import { deleteTask, restoreTask, toggleDone, updateTask } from './tasks';
import type { TaskFields } from './types';

/** UI-facing task operations: same as the repository, plus toasts and undo. */

export async function removeTask(id: string): Promise<void> {
  const snapshot = await deleteTask(id);
  if (!snapshot) return;
  toast({
    message: `Deleted “${snapshot.title}”`,
    action: { label: 'Undo', run: () => void restoreTask(snapshot) },
  });
}

export async function changeTask(id: string, patch: Partial<TaskFields>, message?: string): Promise<void> {
  const before = await updateTask(id, patch);
  if (before && message) {
    toast({ message, action: { label: 'Undo', run: () => void restoreTask(before) } });
  }
}

export async function toggleTask(id: string): Promise<void> {
  await toggleDone(id);
}
