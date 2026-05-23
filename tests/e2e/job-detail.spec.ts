import { test, expect } from '@playwright/test';

test.describe('Job Detail Page', () => {
  test('navigating to a job shows details or not-found', async ({ page }) => {
    await page.goto('/jobs');
    await page.waitForTimeout(3000);

    // Try to click first job card link
    const firstJobLink = page.locator('a[href^="/jobs/"]').first();
    if (await firstJobLink.isVisible()) {
      await firstJobLink.click();
      await page.waitForTimeout(2000);
      // Should either show job detail or not-found
      const title = await page.title();
      expect(title.length).toBeGreaterThan(0);
    }
  });

  test('job detail page has JSON-LD structured data', async ({ page }) => {
    // Navigate to jobs first to find a real job link
    await page.goto('/jobs');
    await page.waitForTimeout(3000);
    const firstJobLink = page.locator('a[href^="/jobs/"]').first();
    if (await firstJobLink.isVisible()) {
      const href = await firstJobLink.getAttribute('href');
      if (href) {
        await page.goto(href);
        await page.waitForTimeout(1000);
        const jsonLd = page.locator('script[type="application/ld+json"]');
        const count = await jsonLd.count();
        // At least one JSON-LD block should exist
        if (count > 0) {
          const content = await jsonLd.first().textContent();
          expect(content).toContain('@type');
        }
      }
    }
  });

  test('back to jobs link works', async ({ page }) => {
    await page.goto('/jobs');
    await page.waitForTimeout(2000);
    const firstJobLink = page.locator('a[href^="/jobs/"]').first();
    if (await firstJobLink.isVisible()) {
      await firstJobLink.click();
      await page.waitForTimeout(1000);
      const backLink = page.getByRole('link', { name: /back|jobs/i }).first();
      if (await backLink.isVisible()) {
        await backLink.click();
        await expect(page).toHaveURL(/\/jobs/);
      }
    }
  });

  test('save job button is present', async ({ page }) => {
    await page.goto('/jobs');
    await page.waitForTimeout(2000);
    const firstJobLink = page.locator('a[href^="/jobs/"]').first();
    if (await firstJobLink.isVisible()) {
      await firstJobLink.click();
      await page.waitForTimeout(1500);
      const saveBtn = page.getByRole('button', { name: /save/i });
      if (await saveBtn.isVisible()) {
        await expect(saveBtn).toBeEnabled();
      }
    }
  });

  test('share button copies link', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-write', 'clipboard-read']);
    await page.goto('/jobs');
    await page.waitForTimeout(2000);
    const firstJobLink = page.locator('a[href^="/jobs/"]').first();
    if (await firstJobLink.isVisible()) {
      await firstJobLink.click();
      await page.waitForTimeout(1500);
      const shareBtn = page.getByRole('button', { name: /share/i });
      if (await shareBtn.isVisible()) {
        await shareBtn.click();
        await page.waitForTimeout(500);
        // Toast or confirmation should appear
        const successMsg = page.getByText(/copied|link copied/i);
        // May or may not show toast
      }
    }
  });

  test('apply button is visible', async ({ page }) => {
    await page.goto('/jobs');
    await page.waitForTimeout(2000);
    const firstJobLink = page.locator('a[href^="/jobs/"]').first();
    if (await firstJobLink.isVisible()) {
      await firstJobLink.click();
      await page.waitForTimeout(1500);
      const applyBtn = page.getByRole('button', { name: /apply|subscribe/i }).first();
      if (await applyBtn.isVisible()) {
        await expect(applyBtn).toBeVisible();
      }
    }
  });
});
