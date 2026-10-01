import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import type { Profile } from '../auth/profile';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { XIcon } from '../components/icons';
import { InstallModal } from '../components/InstallModal';
import { Modal } from '../components/Modal';
import { SettingsPanel } from '../components/SettingsPanel';
import { TaskModal } from '../components/TaskModal';
import { usePendingCount, useTasks } from '../data/tasks';
import type { TaskFields } from '../data/types';
import { PlannerDnd } from '../dnd/PlannerDnd';
import { useReminders } from '../reminders/useReminders';
import { useSettings } from '../hooks/useSettings';
import { useToday } from '../hooks/useToday';
import { addDaysISO, type ISODate } from '../lib/dates';
import { DayView } from '../views/DayView';
import { TasksView } from '../views/TasksView';
import { WeekView } from '../views/WeekView';
import { BottomNav, MobileHeader, Sidebar } from './Chrome';
import { PlannerContext, type PlannerContextValue, type TaskDialog, type View } from './PlannerContext';
import { SHORTCUTS, useShortcuts } from './useShortcuts';

interface Route {
  view: View;
  date: ISODate;
}

/** "#/week", "#/tasks", "#/today" or "#/day/2026-10-05". Survives reloads and app relaunches. */
function readRoute(today: ISODate): Route {
  const [, view, date] = window.location.hash.split('/');
  if (view === 'tasks' || view === 'week') return { view, date: today };
  if (view === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) return { view: 'today', date };
  return { view: 'today', date: today };
}

function writeRoute({ view, date }: Route, today: ISODate) {
  const hash = view === 'today' ? (date === today ? '#/today' : `#/day/${date}`) : `#/${view}`;
  if (window.location.hash !== hash) history.replaceState(null, '', hash);
}

export function Planner({ profile, onRequestSignIn }: { profile: Profile; onRequestSignIn: () => void }) {
  const { signOut } = useAuth();
  const today = useToday();
  const { showCompleted } = useSettings();
  const tasks = useTasks(profile.id);
  const pending = usePendingCount(profile.kind === 'cloud' ? profile.id : null);

  const [route, setRoute] = useState<Route>(() => readRoute(today));
  const [dialog, setDialog] = useState<TaskDialog | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => writeRoute(route, today), [route, today]);
  // Typed URLs, links and browser back/forward.
  useEffect(() => {
    const onHash = () => setRoute(readRoute(today));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [today]);

  const setView = useCallback(
    (view: View) => {
      setRoute((r) => ({ view, date: view === 'today' && r.view !== 'today' ? today : r.date }));
      window.scrollTo({ top: 0 });
    },
    [today],
  );
  const openDay = useCallback((date: ISODate) => setRoute({ view: 'today', date }), []);
  const openNewTask = useCallback(
    (defaults: Partial<TaskFields> = {}) =>
      setDialog({ mode: 'new', defaults: { date: route.view === 'today' ? route.date : undefined, ...defaults } }),
    [route],
  );
  const openEditTask = useCallback((taskId: string) => setDialog({ mode: 'edit', taskId }), []);
  const closeDialog = useCallback(() => setDialog(null), []);

  const all = useMemo(() => tasks ?? [], [tasks]);
  useReminders(all, profile, openDay);
  const visible = useMemo(() => (showCompleted ? all : all.filter((t) => !t.done)), [all, showCompleted]);

  const ctx = useMemo<PlannerContextValue>(
    () => ({
      profile,
      tasks: all,
      visible,
      today,
      view: route.view,
      date: route.date,
      setView,
      openDay,
      openNewTask,
      openEditTask,
    }),
    [profile, all, visible, today, route, setView, openDay, openNewTask, openEditTask],
  );

  useShortcuts(
    {
      n: () => openNewTask(),
      '1': () => setView('tasks'),
      '2': () => setView('today'),
      '3': () => setView('week'),
      t: () => openDay(today),
      ArrowLeft: () => route.view === 'today' && openDay(addDaysISO(route.date, -1)),
      ArrowRight: () => route.view === 'today' && openDay(addDaysISO(route.date, 1)),
      '/': () => {
        if (route.view !== 'tasks') setView('tasks');
        setTimeout(() => document.getElementById('task-search')?.focus(), 0);
      },
      '?': () => setShortcutsOpen(true),
    },
    !!tasks,
  );

  const requestSignOut = () => {
    setSettingsOpen(false);
    if (profile.kind === 'local' || pending > 0) setConfirmSignOut(true);
    else void signOut();
  };

  const panelProps = {
    onInstall: () => {
      setSettingsOpen(false);
      setInstallOpen(true);
    },
    onSignOut: requestSignOut,
    onSignIn: () => {
      setSettingsOpen(false);
      onRequestSignIn();
    },
    onShortcuts: () => setShortcutsOpen(true),
  };

  if (!tasks) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted" role="status">
        Loading your tasks…
      </div>
    );
  }

  return (
    <PlannerContext.Provider value={ctx}>
      <PlannerDnd>
        <div className="flex min-h-dvh flex-col">
          <MobileHeader />
          <div className="flex w-full items-start">
            <Sidebar {...panelProps} />
            <main className="min-w-0 flex-1 max-md:pb-[calc(84px+env(safe-area-inset-bottom))]">
              {route.view === 'today' && <DayView />}
              {route.view === 'week' && <WeekView />}
              {route.view === 'tasks' && <TasksView />}
            </main>
          </div>
          <BottomNav onSettings={() => setSettingsOpen(true)} />
        </div>
      </PlannerDnd>

      <TaskModal dialog={dialog} onClose={closeDialog} />

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} variant="sheet" labelledBy="settings-title">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="settings-title" className="text-[17px] font-bold text-ink">
            Settings
          </h2>
          <button type="button" aria-label="Close settings" onClick={() => setSettingsOpen(false)} className="p-1 text-muted">
            <XIcon size={18} />
          </button>
        </div>
        <SettingsPanel {...panelProps} onShortcuts={undefined} size="md" />
      </Modal>

      <InstallModal open={installOpen} onClose={() => setInstallOpen(false)} />

      <Modal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} labelledBy="shortcuts-title">
        <h2 id="shortcuts-title" className="mb-3 text-[17px] font-bold text-ink">
          Keyboard shortcuts
        </h2>
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="contents">
              <dt>
                <kbd className="rounded border border-line bg-field px-1.5 py-0.5 font-mono text-[11px] text-ink">{s.keys}</kbd>
              </dt>
              <dd className="m-0 text-ink-2">{s.action}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex justify-end">
          <button type="button" className="btn btn-ghost" onClick={() => setShortcutsOpen(false)}>
            Close
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmSignOut}
        title={profile.kind === 'local' ? 'Delete tasks on this device?' : 'Log out with unsynced changes?'}
        message={
          profile.kind === 'local'
            ? 'You are not signed in, so your tasks only exist on this device. Leaving will delete them. Sign in first to keep them.'
            : `${pending} ${pending === 1 ? 'change has' : 'changes have'} not reached the server yet (you may be offline). Logging out now will discard ${pending === 1 ? 'it' : 'them'}.`
        }
        confirmLabel={profile.kind === 'local' ? 'Delete & exit' : 'Log out anyway'}
        danger
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={() => {
          setConfirmSignOut(false);
          void signOut();
        }}
      />
    </PlannerContext.Provider>
  );
}
