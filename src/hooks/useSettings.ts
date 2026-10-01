import { useEffect, useSyncExternalStore } from 'react';

export type ThemeSetting = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact';

export interface Settings {
  theme: ThemeSetting;
  density: Density;
  showCompleted: boolean;
  /** The user switched reminders on (permission may still be revoked in the browser). */
  notifications: boolean;
  /** Reminder applied to new timed tasks, in minutes before start; null = none. */
  defaultReminder: number | null;
}

const KEY = 'doneit_settings';
const DEFAULTS: Settings = {
  theme: 'system',
  density: 'comfortable',
  showCompleted: true,
  notifications: false,
  defaultReminder: null,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
    // Carry over the v1 theme preference.
    const legacy = localStorage.getItem('doneit_theme');
    if (legacy === 'dark' || legacy === 'light') return { ...DEFAULTS, theme: legacy };
  } catch {
    /* fall through */
  }
  return DEFAULTS;
}

let settings = load();
const listeners = new Set<() => void>();

export function updateSettings(patch: Partial<Settings>): void {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function getSettings(): Settings {
  return settings;
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => settings,
  );
}

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

export function resolveDark(theme: ThemeSetting): boolean {
  return theme === 'dark' || (theme === 'system' && darkQuery().matches);
}

/** Keeps the <html class="dark"> flag and browser chrome colour in step with the setting. */
export function useApplyTheme(): boolean {
  const { theme } = useSettings();
  const systemDark = useSyncExternalStore(
    (l) => {
      const q = darkQuery();
      q.addEventListener('change', l);
      return () => q.removeEventListener('change', l);
    },
    () => darkQuery().matches,
  );
  const dark = theme === 'dark' || (theme === 'system' && systemDark);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#16161B' : '#2F44C8');
  }, [dark]);
  return dark;
}

export function hourHeight(density: Density): number {
  return density === 'compact' ? 52 : 70;
}
