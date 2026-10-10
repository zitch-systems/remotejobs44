import { test, expect } from '@playwright/test';

// Google Play's Data safety form needs a public "Delete account" URL that works
// for someone who has already uninstalled the app — so this page must load
// without signing in, and it has to say how to delete an account and what that
// removes.
test.describe('Delete account page', () => {
  test('is public and explains how to delete an account', async ({ page }) => {
    const response = await page.goto('/delete-account');
    expect(response?.status()).toBe(200);
    // Not bounced to the login page.
    expect(new URL(page.url()).pathname).toBe('/delete-account');

    await expect(page.getByRole('heading', { level: 1, name: 'Delete your account' })).toBeVisible();
    for (const heading of ['In the Android app', 'On the website', 'What is deleted', 'What we keep, and why']) {
      await expect(page.getByRole('heading', { level: 2, name: new RegExp(heading) })).toBeVisible();
    }
  });

  test('gives the in-app steps and a way to ask when you cannot sign in', async ({ page }) => {
    await page.goto('/delete-account');
    const inApp = page.locator('section#in-the-app');
    await expect(inApp).toContainText('Settings');
    await expect(inApp).toContainText('Danger zone');
    await expect(inApp).toContainText('Delete account');

    const email = page.locator('section#cannot-sign-in a[href^="mailto:hello@remotejobs44.com"]');
    await expect(email).toBeVisible();
  });

  test('says the CV and profile photos are deleted, and what is kept', async ({ page }) => {
    await page.goto('/delete-account');
    await expect(page.locator('section#what-is-deleted')).toContainText(/CV/);
    await expect(page.locator('section#what-is-deleted')).toContainText(/profile photos/i);
    await expect(page.locator('section#what-we-keep')).toContainText(/payment records/i);
  });
});
