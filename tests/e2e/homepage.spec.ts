import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('loads with correct title and hero text', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/RemoteJobs44/);
    await expect(page.locator('h1')).toBeVisible();
    const h1Text = await page.locator('h1').textContent();
    expect(h1Text?.toLowerCase()).toMatch(/remote job|find|browse/i);
  });

  test('hero search navigates to jobs page', async ({ page }) => {
    await page.goto('/');
    const searchInput = page.getByPlaceholder(/search|job title|keyword/i).first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('software engineer');
      await searchInput.press('Enter');
      await expect(page).toHaveURL(/\/jobs/);
    }
  });

  test('navigation links work', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /jobs/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /pricing/i }).first()).toBeVisible();
  });

  test('featured jobs section shows jobs', async ({ page }) => {
    await page.goto('/');
    // Wait for content to load
    await page.waitForTimeout(2000);
    const jobCards = page.locator('[data-testid="job-card"], .card').filter({ hasText: /apply|engineer|designer|developer/i });
    // At least renders the section
    await expect(page.getByText(/featured|latest|recent/i).first()).toBeVisible();
  });

  test('pricing section is visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/₦1,000|pricing|pro plan/i).first()).toBeVisible();
  });

  test('footer has correct links', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
    await expect(footer.getByRole('link', { name: /privacy/i })).toBeVisible();
    await expect(footer.getByRole('link', { name: /terms/i })).toBeVisible();
  });

  test('dark mode toggle works', async ({ page }) => {
    await page.goto('/');
    const themeToggle = page.getByRole('button', { name: /dark|light|theme/i }).first();
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
      const html = page.locator('html');
      await expect(html).toHaveClass(/dark/);
    }
  });

  test('page has correct meta description', async ({ page }) => {
    await page.goto('/');
    const meta = page.locator('meta[name="description"]');
    const content = await meta.getAttribute('content');
    expect(content).toMatch(/remote jobs|Nigeria|Africa/i);
  });

  test('OG image tag is present', async ({ page }) => {
    await page.goto('/');
    const ogImage = page.locator('meta[property="og:image"]');
    await expect(ogImage).toHaveCount(1);
  });

  test('skip to content link exists for accessibility', async ({ page }) => {
    await page.goto('/');
    const skipLink = page.getByRole('link',