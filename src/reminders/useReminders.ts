import { useEffect, useRef } from 'react';
import type { Profile } from '../auth/profile';
import type { Task } from '../data/types';
import { useOnline } from '../hooks/useOnline';
import { getSettings, useSettings } from '../hooks/useSettings';
import { toast } from '../hooks/useToasts';
import type { ISODate } from '../lib/dates';
import { dueReminders, nextReminderIn, reminderBody, reminderKey, reminderTag, type DueReminder } from '../lib/reminders';
import { ensurePushSubscription } from './push';

const FIRED_KEY = 'doneit_fired_reminders';
const MAX_WAIT_MS = 30_000;
const ICON = `${import.meta.env.BASE_URL}icon-192.png`;

/** Reminders already shown on this device, so a reload or a second tab does not repeat them. */
function loadFired(): Map<string, number> {
  try {
    return new Map(JSON.parse(localStorage.getItem(FIRED_KEY) ?? '[]') as [string, number][]);
  } catch {
    return new Map();
  }
}

function saveFired(fired: Map<string, number>, now: number) {
  const recent = [...fired].filter(([, at]) => now - at < 24 * 60 * 60 * 1000);
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(recent));
  } catch {
    /* ignore */
  }
}

async function showReminder({ task, at }: DueReminder, openDay: (date: ISODate) => void) {
  const body = reminderBody(task);
  const tag = reminderTag(task.id, at);

  if (document.visibilityState === 'visible') {
    // A push for this reminder may already be on screen (sent while the app was closed).
    const reg = await navigator.serviceWorker?.getRegistration();
    const shown = await reg?.getNotifications?.({ tag }).catch(() => []);
    if (shown?.length) return;
    toast({
      message: `Reminder: ${task.title} · ${body}`,
      duration: 15_000,
      action: { label: 'Open', run: () => openDay(task.date!) },
    });
    return;
  }

  if (!getSettings().notifications || Notification.permission !== 'granted') return;
  const options: NotificationOptions = { body, tag, icon: ICON, badge: ICON, data: { url: `#/day/${task.date}` } };
  const reg = await navigator.serviceWorker?.getRegistration();
  if (reg) await reg.showNotification(task.title, options);
  else new Notification(task.title, options);
}

/**
 * On-device reminder scheduler. Works offline and for device-only users. While the page is
 * visible reminders appear as in-app toasts; when it is hidden they become system notifications.
 * Reminders while the app is fully closed come from Web Push (see supabase/functions).
 */
export function useReminders(tasks: Task[], profile: Profile, openDay: (date: ISODate) => void): void {
  const { notifications } = useSettings();
  const online = useOnline();
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const openDayRef = useRef(openDay);
  openDayRef.current = openDay;

  // Keep this device's push subscription registered (it can rotate, or the user may switch accounts).
  useEffect(() => {
    if (notifications && profile.kind === 'cloud' && online) {
      ensurePushSubscription().catch((err) => console.warn('[push] could not refresh subscription:', err));
    }
  }, [notifications, profile.kind, profile.id, online]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      clearTimeout(timer);
      const now = Date.now();
      const fired = loadFired();
      const due = dueReminders(tasksRef.current, now, new Set(fired.keys()));
      for (const reminder of due) {
        fired.set(reminderKey(reminder.task.id, reminder.at), reminder.at);
        void showReminder(reminder, openDayRef.current);
      }
      if (due.length) saveFired(fired, now);
      const next = nextReminderIn(tasksRef.current, now);
      timer = setTimeout(tick, Math.min(MAX_WAIT_MS, next ?? MAX_WAIT_MS) + 50);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [tasks]);

  // Messages from the service worker: a push that arrived while DoneIt was focused, or a
  // notification click that should take the open app to the task's day.
  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string; title?: string; body?: string; taskId?: string; at?: number };
      if (data?.type === 'navigate' && data.url) {
        window.location.assign(data.url);
      } else if (data?.type === 'reminder' && data.taskId && data.at != null) {
        const key = reminderKey(data.taskId, data.at);
        const fired = loadFired();
        if (fired.has(key)) return;
        fired.set(key, data.at);
        saveFired(fired, Date.now());
        toast({ message: `Reminder: ${data.title} · ${data.body}`, duration: 15_000 });
      }
    };
    sw.addEventListener('message', onMessage);
    return () => sw.removeEventListener('message', onMessage);
  }, []);
}
