import { expect, test, type Page } from '@playwright/test';

async function waitForServiceWorker(page: Page) {
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active && !!navigator.serviceWorker.controller;
  }, undefined, { timeout: 30_000 });
}

/** First visit: start without an account and wait until the app shell is cached. */
async function startAsGuest(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue without an account' }).click();
  await expect(page.getByText('Loading your tasks…')).toHaveCount(0);
  // The worker takes control on the next load after installing.
  await page.reload();
  await waitForServiceWorker(page);
}

async function addViaQuickAdd(page: Page, text: string) {
  await page.goto('/#/tasks');
  const input = page.getByRole('textbox', { name: 'New task' });
  await input.fill(text);
  await input.press('Enter');
}

test('the installed app opens and works with no internet connection', async ({ page, context }) => {
  await startAsGuest(page);
  await addViaQuickAdd(page, 'Buy groceries tomorrow 18:00');
  await expect(page.getByRole('button', { name: 'Buy groceries', exact: true })).toBeVisible();

  await context.setOffline(true);
  await page.reload();

  // App shell from the service worker, tasks from IndexedDB.
  await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buy groceries', exact: true })).toBeVisible();

  // Still fully usable offline.
  await addViaQuickAdd(page, 'Written while offline');
  await expect(page.getByRole('button', { name: 'Written while offline', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Written while offline', exact: true })).toBeVisible();
  await context.setOffline(false);
});

test('a signed-in user can open their tasks offline even without a live session', async ({ page, context }) => {
  await startAsGuest(page);
  const userId = '11111111-2222-4333-8444-555555555555';

  // Simulate a returning cloud user whose tasks were synced earlier: a cached profile and a task
  // in IndexedDB, but no Supabase session that could be refreshed (we are about to go offline).
  await page.evaluate(async (id) => {
    localStorage.setItem('doneit_profile', JSON.stringify({ id, kind: 'cloud', name: 'Sam Rivera', email: 'sam@example.com' }));
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('doneit');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction('tasks', 'readwrite');
        tx.objectStore('tasks').put({
          id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          userId: id,
          title: 'Synced standup',
          notes: '',
          color: 'purple',
          date: iso,
          start: 9 * 60,
          end: 9 * 60 + 30,
          done: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deleted: 0,
          dirty: 0,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  }, userId);

  await context.setOffline(true);
  await page.goto('/#/today');
  await page.reload();

  // Not bounced to the sign-in screen: the planner opens with the user's synced task.
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
  await expect(page.getByText('Synced standup').first()).toBeVisible();
  await expect(page.getByText('Offline', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await context.setOffline(false);
});
