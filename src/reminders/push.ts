import { getSettings, updateSettings } from '../hooks/useSettings';
import { isIOS, isStandalone } from '../hooks/useInstall';
import { supabase } from '../lib/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

/** Background (app closed) reminders need Web Push, a VAPID key, and an account to deliver to. */
export const pushAvailable = () =>
  !!VAPID_PUBLIC_KEY && !!supabase && 'serviceWorker' in navigator && 'PushManager' in window;

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** The active worker registration, or undefined (dev server, unsupported browser). Never waits. */
async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  return navigator.serviceWorker?.getRegistration();
}

/**
 * Makes sure this device has a push subscription registered to the signed-in user.
 * Safe to call on every launch: it also refreshes subscriptions the browser rotated.
 */
export async function ensurePushSubscription(): Promise<boolean> {
  if (!pushAvailable() || Notification.permission !== 'granted') return false;
  const reg = await registration();
  if (!reg) return false;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY!) }));
  const keys = sub.toJSON().keys ?? {};
  const { error } = await supabase!.rpc('register_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_user_agent: navigator.userAgent.slice(0, 200),
  });
  if (error) throw new Error(error.message);
  return true;
}

/** Stops push delivery to this device (on turning reminders off, or logging out). */
export async function removePushSubscription(): Promise<void> {
  const reg = await registration();
  const sub = await reg?.pushManager?.getSubscription();
  if (!sub) return;
  if (supabase) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', sub.endpoint)
      .then(
        () => undefined,
        () => undefined,
      );
  }
  await sub.unsubscribe().catch(() => undefined);
}

export interface EnableResult {
  ok: boolean;
  /** True when reminders will also arrive while the app is closed. */
  background: boolean;
  message?: string;
}

/** Must be called from a user gesture (a tap or click): browsers require that for the prompt. */
export async function enableNotifications(cloudAccount: boolean): Promise<EnableResult> {
  if (!notificationsSupported()) {
    const message =
      isIOS() && !isStandalone()
        ? 'On iPhone and iPad, add DoneIt to your Home Screen first, then turn on reminders in the installed app.'
        : "This browser can't show notifications. Reminders will still appear inside DoneIt.";
    return { ok: false, background: false, message };
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      background: false,
      message: 'Notifications are blocked for DoneIt. Allow them in your browser or system settings, then try again.',
    };
  }
  updateSettings({ notifications: true, defaultReminder: getSettings().defaultReminder ?? 10 });
  if (!cloudAccount || !pushAvailable()) return { ok: true, background: false };
  try {
    return { ok: true, background: await ensurePushSubscription() };
  } catch (err) {
    console.warn('[push] subscription failed:', err);
    return {
      ok: true,
      background: false,
      message: 'Reminders are on while DoneIt is open. Background reminders could not be set up right now.',
    };
  }
}

export async function disableNotifications(): Promise<void> {
  updateSettings({ notifications: false });
  await removePushSubscription().catch(() => undefined);
}
