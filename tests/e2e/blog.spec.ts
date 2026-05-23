import { test, expect } from '@playwright/test';

test.describe('Blog', () => {
  test('blog index loads', async ({ page }) => {
    await page.goto('/blog');
    await expect(page).toHaveTitle(/blog|remote work|RemoteJobs44/i);
  });

  test('blog posts are listed', async ({ page }) => {
    await page.goto('/blog');
    const postLinks = page.getByRole('link').filter({ hasText: /job|remote|tips|beginners|Nigeria/i });
    const count = await postLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Nigeria blog post loads and has SEO meta', async ({ page }) => {
    await page.goto('/blog/how-to-find-remote-jobs-in-nigeria');
    const title = await page.title();
    expect(title.length).toBeGreaterThan(10);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('interview tips blog post loads', async ({ page }) => {
    await page.goto('/blog/remote-job-interview-tips');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('beginners blog post loads', async ({ page }) => {
    await page.goto('/blog/best-remote-jobs-for-beginners');
    await expect(page.locator('h1