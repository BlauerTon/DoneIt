import { usePlanner, type View } from './PlannerContext';
import { CloudOffIcon, DayIcon, MoonIcon, PlusIcon, SettingsIcon, SunIcon, TasksIcon, WeekIcon } from '../components/icons';
import { SettingsPanel } from '../components/SettingsPanel';
import { addDaysISO, greeting } from '../lib/dates';
import { useOnline } from '../hooks/useOnline';
import { resolveDark, updateSettings, useSettings } from '../hooks/useSettings';

interface NavCounts {
  tasks: number;
  today: number;
  week: number;
}

function useCounts(): NavCounts {
  const { tasks, visible, today } = usePlanner();
  const weekEnd = addDaysISO(today, 6);
  return {
    tasks: tasks.filter((t) => !t.done).length,
    today: tasks.filter((t) => t.date === today && !t.done).length,
    week: visible.filter((t) => t.date && t.date >= today && t.date <= weekEnd).length,
  };
}

const NAV: { key: View; label: string; Icon: typeof TasksIcon }[] = [
  { key: 'tasks', label: 'Tasks', Icon: TasksIcon },
  { key: 'today', label: 'Today', Icon: DayIcon },
  { key: 'week', label: 'Week', Icon: WeekIcon },
];

interface SidebarProps {
  onInstall: () => void;
  onSignOut: () => void;
  onSignIn: () => void;
  onShortcuts: () => void;
}

export function Sidebar(props: SidebarProps) {
  const { profile, view, setView, openNewTask } = usePlanner();
  const counts = useCounts();
  return (
    <aside className="sticky top-0 z-10 flex h-dvh w-60 shrink-0 flex-col gap-[18px] overflow-y-auto border-r border-line bg-sidebar px-4 py-5 max-md:hidden">
      <div className="px-1 text-[17px] font-bold tracking-tight text-ink">{greeting(profile.name)}</div>
      <button type="button" className="btn btn-primary w-full text-[13.5px] shadow-[0_1px_3px_rgb(31_47_150/0.35)]" onClick={() => openNewTask()}>
        <PlusIcon size={15} strokeWidth={2.4} />
        New task
        <kbd className="ml-auto rounded bg-white/15 px-1.5 font-mono text-[10px] font-medium">N</kbd>
      </button>
      <nav className="flex flex-col gap-[3px]" aria-label="Views">
        {NAV.map(({ key, label, Icon }) => {
          const active = view === key;
          return (
            <button
              key={key}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => setView(key)}
              className={`flex items-center gap-2.5 rounded-[9px] px-3 py-[9px] text-left text-sm transition-colors ${
                active ? 'bg-accent-soft font-semibold text-accent dark:text-[#9AA8FF]' : 'font-medium text-ink-2 hover:bg-hover'
              }`}
            >
              <Icon size={16} />
              <span className="flex-1">{label}</span>
              <span className="font-mono text-[11px] text-muted">{counts[key]}</span>
            </button>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-2.5 border-t border-line-soft pt-4">
        <div className="label-mono px-1 font-semibold">Settings</div>
        <SettingsPanel {...props} />
      </div>
    </aside>
  );
}

export function MobileHeader() {
  const { openNewTask } = usePlanner();
  const settings = useSettings();
  const online = useOnline();
  const dark = resolveDark(settings.theme);
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-sidebar px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 md:hidden">
      <div className="flex items-center gap-2">
        <span className="text-[17px] font-bold tracking-tight text-ink">DoneIt Planner</span>
        {!online && (
          <span className="flex items-center gap-1 rounded-full bg-hover px-2 py-0.5 text-[10.5px] font-semibold text-ink-2" role="status">
            <CloudOffIcon size={11} /> Offline
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={() => updateSettings({ theme: dark ? 'light' : 'dark' })}
          className="flex size-[34px] items-center justify-center rounded-[9px] border border-line bg-card text-ink"
        >
          {dark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
        </button>
        <button type="button" className="btn btn-primary px-3" onClick={() => openNewTask()}>
          <PlusIcon size={14} strokeWidth={2.4} /> Task
        </button>
      </div>
    </header>
  );
}

export function BottomNav({ onSettings }: { onSettings: () => void }) {
  const { view, setView } = usePlanner();
  const counts = useCounts();
  return (
    <nav
      aria-label="Views"
      className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-line bg-sidebar px-2 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV.map(({ key, label, Icon }) => {
        const active = view === key;
        return (
          <button
            key={key}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => setView(key)}
            className={`relative flex h-16 flex-col items-center justify-center gap-[3px] px-3 ${active ? 'text-accent dark:text-[#9AA8FF]' : 'text-muted'}`}
          >
            <Icon size={19} />
            <span className="text-[10.5px] font-semibold">{label}</span>
            {key !== 'week' && counts[key] > 0 && (
              <span className="absolute top-2 right-1 min-w-4 rounded-full bg-accent px-1 text-center font-mono text-[9px] leading-4 font-bold text-white">
                {counts[key] > 99 ? '99+' : counts[key]}
              </span>
            )}
          </button>
        );
      })}
      <button type="button" onClick={onSettings} className="flex h-16 flex-col items-center justify-center gap-[3px] px-3 text-muted">
        <SettingsIcon size={19} />
        <span className="text-[10.5px] font-semibold">Settings</span>
      </button>
    </nav>
  );
}
