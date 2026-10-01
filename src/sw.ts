/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

// ── Offline app shell ────────────────────────────────────────────────────────────────────────
// Everything the app needs (code, styles, fonts, images) is precached at install, so it boots
// with no network. Task data is not cached here: it lives in IndexedDB.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// The page asks the waiting worker to take over when the user accepts "Reload" for an update.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

// ── Reminders ────────────────────────────────────────────────────────────────────────────────
interface ReminderPayload {
  title?: string;
  body?: string;
  tag?: string;
  url?: string;
  taskId?: string;
  at?: number;
}

const ICON = 'icon-192.png';

self.addEventListener('push', (event) => {
  let data: ReminderPayload = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const focused = windows.find((w) => (w as WindowClient).focused);
      if (focused) {
        // The user is looking at DoneIt: let the page show it in-app instead of a system banner.
        focused.postMessage({ type: 'reminder', ...data });
        return;
      }
      await self.registration.showNotification(data.title ?? 'DoneIt reminder', {
        body: data.body,
        // Same tag as the on-device scheduler uses, so a reminder is never shown twice.
        tag: data.tag,
        icon: ICON,
        badge: ICON,
        data: { url: data.url ?? '' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data?.url as string) || '', self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) as WindowClient[];
      const existing = windows.find((w) => w.url.startsWith(self.registration.scope));
      if (existing) {
        await existing.focus();
        // Only the hash changes, so the open app just switches to the task's day.
        existing.postMessage({ type: 'navigate', url: target });
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
