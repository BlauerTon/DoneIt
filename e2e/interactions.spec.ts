import { expect, test, type Locator, type Page } from '@playwright/test';

async function startAsGuest(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue without an account' }).click();
  await expect(page.getByRole('main')).toBeVisible();
}

async function quickAdd(page: Page, text: string) {
  await page.goto('/#/tasks');
  const input = page.getByRole('textbox', { name: 'New task' });
  await input.fill(text);
  await input.press('Enter');
  await expect(input).toHaveValue('');
}

/** Drags so the top edge of `source` lands `dy` pixels below the top of `target`. */
async function drag(page: Page, source: Locator, target: Locator, dy = 4, isTouch = false) {
  const s = (await source.boundingBox())!;
  const t = (await target.boundingBox())!;
  // Grab the middle of the card (its title), not the checkbox, which intentionally never drags.
  const grab = { x: s.x + s.width / 2, y: s.y + 6 };
  const drop = { x: t.x + Math.min(120, t.width / 2), y: t.y + dy + 6 };

  if (!isTouch) {
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(grab.x + ((drop.x - grab.x) * i) / 12, grab.y + ((drop.y - grab.y) * i) / 12);
    }
    await page.mouse.up();
    return;
  }

  // Long-press then move, the way a finger would.
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', p: { x: number; y: number }) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(p.x), y: Math.round(p.y) }],
    });
  await touch('touchStart', grab);
  await page.waitForTimeout(350);
  for (let i = 1; i <= 12; i++) {
    await touch('touchMove', { x: grab.x + ((drop.x - grab.x) * i) / 12, y: grab.y + ((drop.y - grab.y) * i) / 12 });
    await page.waitForTimeout(16);
  }
  await touch('touchEnd', drop);
}

test('schedule by dragging, resize, move between days, undo, and conflict blocking', async ({ page, isMobile }) => {
  await startAsGuest(page);
  await quickAdd(page, 'Pay bills today');

  // 1. Drag the unscheduled task onto 07:00 in the day timeline.
  await page.goto('/#/today');
  const chip = page.getByRole('button', { name: 'Pay bills', exact: true }).first();
  const row7 = page.getByText('07:00', { exact: true }).first();
  await page.evaluate(() => window.scrollTo(0, 0));
  await drag(page, chip, row7, 0, isMobile);
  await expect(page.getByText('07:00 – 08:00').first()).toBeVisible();

  // 2. Resize the block by dragging its bottom edge down one hour.
  const handle = page.getByRole('separator', { name: 'Drag to change end time' }).first();
  const box = (await handle.boundingBox())!;
  const hourPx = (await page.getByText('08:00', { exact: true }).first().boundingBox())!.y - (await row7.boundingBox())!.y;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + hourPx / 2, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + hourPx, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByText('07:00 – 09:00').first()).toBeVisible();

  // 3. A new task that overlaps is blocked with a clear message.
  await page.getByRole('button', { name: /New task|Task/ }).filter({ visible: true }).first().click();
  await page.getByRole('textbox', { name: 'What do you need to do?' }).fill('Overlapping');
  await page.getByLabel('Start hour').fill('08');
  await expect(page.getByRole('alert')).toContainText('Slot conflict: "Pay bills" is already scheduled (07:00 – 09:00)');
  await expect(page.getByRole('button', { name: 'Add task' })).toBeDisabled();
  await page.keyboard.press('Escape');

  // 4. Move it to tomorrow in the week view; the time is kept because the slot is free.
  await page.goto('/#/week');
  const today = page.locator('[data-testid^="week-day-"]').filter({ hasText: 'TODAY' });
  const tomorrow = page.locator('[data-testid^="week-day-"]').filter({ hasText: 'TOMORROW' });
  await drag(page, today.getByRole('button', { name: 'Pay bills' }), tomorrow, 60, isMobile);
  await expect(tomorrow.getByText('Pay bills')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Moved to Tomorrow at 07:00 – 09:00' })).toBeVisible();

  // 5. Undo puts it back.
  await page.getByRole('button', { name: 'Undo' }).last().click();
  await expect(today.getByText('Pay bills')).toBeVisible();
  await expect(tomorrow.getByText('Pay bills')).toHaveCount(0);
});
