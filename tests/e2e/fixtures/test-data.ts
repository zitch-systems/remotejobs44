// Shared test data and helpers

export const TEST_USER = {
  email: 'test.playwright@remotejobs44.com',
  password: 'PlaywrightTest123!',
  name: 'Playwright Test',
};

export const SITE_URL = process.env.BASE_URL ?? 'https://remotejobs44.com';

export const SELECTORS = {
  jobCard: '.card',
  searchInput: 'input[placeholder*="Search"], input[placeholder*="search"]',
  applyBtn: 'button:has-text("Apply"), button:has-text("Subscribe")',
  saveBtn: 'button:has-text("Save")',
  loginForm: 'form',
};

export async function waitForJobs(page: any, timeout = 5000) {
  await page.waitF