import { expect, test } from '@playwright/test';

test.use({ permissions: ['notifications'] });

const pad = (n: number) => String(n).padStart(2, '0');

test('a reminder fires on the device at its time, even offline', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue without an account' }).click();
  await expect(page.getByRole('main')).toBeVisible();
  // Let the service worker take control so the offline reload below is served from cache.
  await page.reload();
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.ready).active && !!navigator.serviceWorker.controller);
  await context.setOffline(true);

  // A task starting this very minute with an "at start time" reminder is due immediately.
  const now = new Date();
  await page.getByRole('button', { name: /New task|Task/ }).filter({ visible: true }).first().click();
  await page.getByRole('textbox', { name: 'What do you need to do?' }).fill('Standup call');
  await page.getByLabel('Start hour').fill(pad(now.getHours()));
  await page.getByLabel('Start minute').fill(pad(now.getMinutes()));
  await page.getByLabel('Reminder', { exact: true }).selectOption({ label: 'At start time' });
  await page.getByRole('button', { name: 'Add task' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Reminder: Standup call' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Starting now' })).toBeVisible();

  // Shown once: a reload does not repeat it.
  await page.reload();
  await page.waitForTimeout(1500);
  await expect(page.getByRole('status').filter({ hasText: 'Reminder: Standup call' })).toHaveCount(0);
  await context.setOffline(false);
});

test('the service worker turns a push message into a reminder', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'uses Chrome DevTools to deliver the push');
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue without an account' }).click();
  await page.reload();
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.ready).active && !!navigator.serviceWorker.controller);

  const cdp = await context.newCDPSession(page);
  const registrationId = new Promise<string>((resolve) => {
    cdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations }) => {
      const reg = registrations.find((r: { isDeleted: boolean }) => !r.isDeleted);
      if (reg) resolve(reg.registrationId);
    });
  });
  await cdp.send('ServiceWorker.enable');

  const payload = {
    title: 'Dentist',
    body: 'In 15m · 10:00 – 10:30',
    tag: 'reminder:test-task:123',
    url: '#/day/2026-10-05',
    taskId: 'test-task',
    at: 123,
  };
  await cdp.send('ServiceWorker.deliverPushMessage', {
    origin: new URL(page.url()).origin,
    registrationId: await registrationId,
    data: JSON.stringify(payload),
  });

  // Focused app: shown in-app. Otherwise: a system notification with the shared tag.
  await expect
    .poll(
      async () => {
        const toast = await page.getByRole('status').filter({ hasText: 'Reminder: Dentist' }).count();
        const shown = await page.evaluate(async (tag) => {
          const reg = await navigator.serviceWorker.ready;
          return (await reg.getNotifications({ tag })).length;
        }, payload.tag);
        return toast + shown;
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);
});
