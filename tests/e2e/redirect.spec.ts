// Smoke tests for the post-login routing rules. These hit the running app and
// verify that (a) unauthenticated users get sent to /login with ?next set, and
// (b) the /login form is wired up correctly.
import { test, expect } from '@playwright/test';

test.describe('Route-level role enforcement', () => {
  test('unauthed visitor to /admin lands on /login with next=/admin', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login\?.*next=%2Fadmin/);
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
