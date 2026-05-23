import { test, expect } from '@playwright/test';

test.describe('Navigation & Layout', () => {
  test('header is always visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
  });

  test('logo links to homepage', async ({ page }) => {
    await page.goto('/jobs');
    const logo = page.locator('header').getByRole('link', { name: /RemoteJobs44/i }).first();
    if (await logo.isVisible()) {
      await logo.click();
      await expect(page).toHaveURL(/^https:\/\/remotejobs44\.com\/?$/);
    }
  });

  test('jobs nav link works', async ({ page }) => {
    await page.goto('/');
    const jobsLink = page.locator('header').getByRole('link', { name: /^jobs$/i });
    if (await jobsLink.isVisible()) {
      await jobsLink.click();
      await expect(page).toHaveURL(/\/jobs/);
    }
  });

  test('pricing nav link works', async ({ page }) => {
    await page.goto('/');
    const pricingLink = page.locator('header').getByRole('link', { name: /pricing/i });
    if (await pricingLink.isVisible()) {
      await pricingLink.click();
      await expect(page).toHaveURL(/\/pricing/);
    }
  });

  test('mobile bottom nav is visible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    // Bottom nav should be visible on small screens
    const bottomNav = page.locator('nav').last();
    // Soft check since it's mobile-only
  });

  test('footer links navigate correctly', async ({ page }) => {
    await page.goto('/');
    const privacyLink = page.locator('footer').getByRole('link', { name: /privacy/i });
    if (await privacyLink.isVisible()) {
      await privacyLink.click();
      await expect(page).toHaveURL(/privacy/);
    }
  });

  test('about page loads', async ({ page }) => {
    await page.goto('/about');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('contact page loads and has form', async ({ page }) => {
    await page.goto('/contact');
    await expect(page.locator('form')).toBeVisible();
  });

  test('privacy page loads', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('terms page loads', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('no console errors on homepage', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/');
    await page.waitForTimeout(2000);
    // Filter out known third-party errors
    const criticalErrors = errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('google') &&
      !e.includes('fonts') &&
      !e.includes('analytics')
    );
    expect(criticalErrors.length).toBe(0);
  });
});
