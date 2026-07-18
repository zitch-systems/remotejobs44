// Smoke tests for the post-login routing rules. These hit the running app and
// verify that (a) unauthenticated users get sent to /login with ?next set, and
// (b) the /login form is wired up correctly.
import { test, expect } from '@playwright/test';

test.describe('Route-level role enforcement', () => {
  // /admin has been removed from the public site: it now lives behind a
  // private, env-configured "knock" link and answers 404 to anyone who hasn't
  // opened it. An anonymous visitor must NOT be redirected to /login (that would
  // reveal the admin area exists) — they get a plain 404, staying on /admin.
  test('unauthed visitor to /admin gets 404, not a login redirect', async ({ page }) => {
    const res = await page.goto('/admin');
    expect(res?.status()).toBe(404);
    await expect(page).toHaveURL(/\/admin$/);
  });

  test('unauthed visitor to /dashboard lands on /login with next=/dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?.*next=%2Fdashboard/);
  });

  test('login page renders email + password inputs', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });
});
