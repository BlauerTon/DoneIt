import { expect, test, type Page } from '@playwright/test';

// Supabase is mocked at the network level, so no real emails are sent and no account is needed.
// page.route cannot see requests a service worker handles, so keep it out of the way.
test.use({ serviceWorkers: 'block' });

const user = {
  id: '6f1c3a52-0b8e-4f7a-9d2e-1a2b3c4d5e6f',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'reset-me@example.com',
  app_metadata: { provider: 'email' },
  user_metadata: { full_name: 'Reset Tester' },
  created_at: '2026-01-01T00:00:00Z',
};

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** The URL a Supabase password reset email sends the user to (implicit flow). */
function recoveryLink(): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = [
    base64url({ alg: 'HS256', typ: 'JWT' }),
    base64url({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp }),
    'signature',
  ].join('.');
  const params = new URLSearchParams({
    access_token: token,
    expires_at: String(exp),
    expires_in: '3600',
    refresh_token: 'refresh-token',
    token_type: 'bearer',
    type: 'recovery',
  });
  return `/#${params}`;
}

/** Answers the auth calls the reset flow makes, and keeps sync quiet once the planner opens. */
async function mockSupabase(page: Page) {
  const calls = { recover: [] as { body: unknown; url: string }[], passwords: [] as string[], logouts: 0 };
  await page.route('**/auth/v1/recover**', async (route) => {
    calls.recover.push({ body: route.request().postDataJSON(), url: route.request().url() });
    await route.fulfill({ json: {} });
  });
  await page.route('**/auth/v1/user**', async (route) => {
    if (route.request().method() === 'PUT') calls.passwords.push(route.request().postDataJSON().password);
    await route.fulfill({ json: user });
  });
  await page.route('**/auth/v1/logout**', async (route) => {
    calls.logouts++;
    await route.fulfill({ status: 204 });
  });
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }));
  return calls;
}

test('a signed-out user can request a password reset email', async ({ page }) => {
  const calls = await mockSupabase(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);

  await page.getByLabel('Email address').fill('reset-me@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'reset-me@example.com' })).toBeVisible();
  expect(calls.recover).toHaveLength(1);
  expect(calls.recover[0].body).toMatchObject({ email: 'reset-me@example.com' });
  // The email link must bring the user back to this app.
  const redirect = new URL(calls.recover[0].url).searchParams.get('redirect_to');
  expect(redirect).toBe(new URL('/', page.url()).toString());

  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await expect(page.getByRole('tab', { name: 'Sign in' })).toBeVisible();
});

test('opening the reset link asks for a new password, then opens the planner', async ({ page }) => {
  const calls = await mockSupabase(page);
  await page.goto(recoveryLink());

  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await expect(page.getByText(user.email)).toBeVisible();
  // The tokens must not stay in the address bar.
  await expect.poll(() => page.url()).not.toContain('access_token');

  await page.getByLabel('New password', { exact: true }).fill('brand-new-pass');
  await page.getByLabel('Confirm new password').fill('different-pass');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('alert')).toHaveText("The passwords don't match.");
  expect(calls.passwords).toHaveLength(0);

  await page.getByLabel('Confirm new password').fill('brand-new-pass');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('main')).toBeVisible();
  expect(calls.passwords).toEqual(['brand-new-pass']);

  // Signed in for good: a reload opens the planner, not the reset screen.
  await page.reload();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toHaveCount(0);
});

test('cancelling a reset signs the link out again', async ({ page }) => {
  const calls = await mockSupabase(page);
  await page.goto(recoveryLink());
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('tab', { name: 'Sign in' })).toBeVisible();
  expect(calls.logouts).toBe(1);
  expect(calls.passwords).toHaveLength(0);
});

test('an expired reset link explains what happened', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await expect(page.getByRole('alert')).toContainText('invalid or has expired');
  await expect.poll(() => page.url()).not.toContain('error');
});
