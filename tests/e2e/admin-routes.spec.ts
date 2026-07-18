import { test, expect } from '@playwright/test';

// The /admin pages have been removed from the public site. They live behind a
// private, env-configured "knock" link (ADMIN_PORTAL_SLUG) and answer 404 to
// anyone who has not opened it — so an anonymous visitor gets a 404, NOT a
// redirect to /login (which would reveal the admin area exists). We can't
// exercise the unlocked flow here without knowing the (secret) slug + a fixture
// admin, so this covers the public-facing guarantee: /admin is a 404.

test.describe('Admin area is hidden from the public (anonymous)', () => {
  test('/admin returns 404', async ({ page }) => {
    const res = await page.goto('/admin');
    expect(res?.status()).toBe(404);
    expect(page.url()).toMatch(/\/admin$/);
  });

  test('/admin/users returns 404', async ({ page }) => {
    const res = await page.goto('/admin/users');
    expect(res?.status()).toBe(404);
  });

  test('/admin/users/[id] returns 404', async ({ page }) => {
    const res = await page.goto('/admin/users/00000000-0000-0000-0000-000000000000');
    expect(res?.status()).toBe(404);
  });

  test('/admin/companies returns 404', async ({ page }) => {
    const res = await page.goto('/admin/companies');
    expect(res?.status()).toBe(404);
  });
});

test.describe('Admin API routes (anonymous)', () => {
  test('GET /api/admin/users/:id returns 401', async ({ request }) => {
    const res = await request.get('/api/admin/users/00000000-0000-0000-0000-000000000000');
    expect(res.status()).toBe(401);
  });

  test('PATCH /api/admin/users/:id returns 401', async ({ request }) => {
    const res = await request.patch('/api/admin/users/00000000-0000-0000-0000-000000000000', {
      data: { plan: 'pro' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/admin/users/:id/reset-password returns 401', async ({ request }) => {
    const res = await request.post('/api/admin/users/00000000-0000-0000-0000-000000000000/reset-password');
    // All admin routes now use the shared requireAdmin helper: 401 for
    // missing session, 403 only when a real user is authed-but-not-admin.
    expect(res.status()).toBe(401);
  });

  test('GET /api/admin/companies returns 401', async ({ request }) => {
    const res = await request.get('/api/admin/companies');
    expect(res.status()).toBe(401);
  });

  test('POST /api/admin/companies/refresh returns 401', async ({ request }) => {
    const res = await request.post('/api/admin/companies/refresh', { data: {} });
    expect(res.status()).toBe(401);
  });
});

test.describe('Profile self-service routes (anonymous)', () => {
  test('GET /api/profile/billing returns 401', async ({ request }) => {
    const res = await request.get('/api/profile/billing');
    expect(res.status()).toBe(401);
  });

  test('GET /api/profile/email-prefs returns 401', async ({ request }) => {
    const res = await request.get('/api/profile/email-prefs');
    expect(res.status()).toBe(401);
  });

  test('POST /api/profile/cancel-subscription returns 401', async ({ request }) => {
    const res = await request.post('/api/profile/cancel-subscription');
    expect(res.status()).toBe(401);
  });

  test('POST /api/profile/delete-account returns 401', async ({ request }) => {
    const res = await request.post('/api/profile/delete-account', {
      data: { confirm: 'DELETE' },
    });
    expect(res.status()).toBe(401);
  });

  test('/profile/billing redirects unauth to /login', async ({ page }) => {
    await page.goto('/profile/billing');
    // 15s rather than 8s — the redirect fires from a client useEffect AFTER
    // Zustand rehydrates, and on a cold dev server /login also has to compile.
    await page.waitForURL(/\/login/, { timeout: 15000 });
  });
});
