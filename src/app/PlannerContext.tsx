import { createContext, useContext } from 'react';
import type { Profile } from '../auth/profile';
import type { Task, TaskFields } from '../data/types';
import type { ISODate } from '../lib/dates';

export type View = 'tasks' | 'today' | 'week';

export type TaskDialog =
  | { mode: 'new'; defaults: Partial<TaskFields> }
  | { mode: 'edit'; taskId: string };

export interface PlannerContextValue {
  profile: Profile;
  /** Every live task for this user (completed included). */
  tasks: Task[];
  /** Tasks after applying the "show completed" preference. */
  visible: Task[];
  today: ISODate;
  view: View;
  date: ISODate;
  setView(view: View): void;
  /** Opens the day view on a date. */
  openDay(date: ISODate): void;
  openNewTask(defaults?: Partial<TaskFields>): void;
  openEditTask(id: string): void;
}

export const PlannerContext = createContext<PlannerContextValue | null>(null);

export function usePlanner(): PlannerContextValue {
  const ctx = useContext(PlannerContext);
  if (!ctx) throw new Error('usePlanner must be used inside the planner');
  return ctx;
}
