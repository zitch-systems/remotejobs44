import { describe, it, expect } from 'vitest';
import { destinationForRole } from './redirect';

// Pins the open-redirect protection on destinationForRole. This is the
// gate that decides where /auth/callback and /login send the user after
// a successful sign-in — the `next` query-string value is attacker-
// controllable (any phishing link can plant `?next=…`), so this is the
// difference between same-origin nav and a third-party landing.

describe('destinationForRole', () => {
  describe('falls back to role home when next is missing', () => {
    it('admin → /admin', () => {
      expect(destinationForRole('admin')).toBe('/admin');
      expect(destinationForRole('admin', null)).toBe('/admin');
      expect(destinationForRole('admin', '')).toBe('/admin');
    });
    it('user → /dashboard', () => {
      expect(destinationForRole('user')).toBe('/dashboard');
      expect(destinationForRole('user', null)).toBe('/dashboard');
      expect(destinationForRole('user', '')).toBe('/dashboard');
    });
  });

  describe('rejects open-redirect payloads', () => {
    // Each of these is a known browser-URL-parser quirk that resolves
    // to an off-site host when planted in a Location header from
    // https://remotejobs44.com — see WHATWG URL spec §4.4.
    it.each([
      ['//evil.com'],                       // protocol-relative
      ['///evil.com'],                      // triple-slash, ditto
      ['//evil.com/path'],
      ['https://evil.com'],                 // absolute
      ['http://evil.com'],
      ['javascript:alert(1)'],              // colon-bearing scheme
      ['data:text/html,xss'],
      ['/\\evil.com'],                      // slash + backslash → //evil.com
      ['/\\\\evil.com'],
      ['\t//evil.com'],                     // tab-then-protocol-relative
      ['\n//evil.com'],
      ['/\t/evil.com'],                     // tab-strip → //evil.com
      ['login'],                            // no leading slash
      ['dashboard'],
    ])('user + next=%j → /dashboard', (next) => {
      expect(destinationForRole('user', next)).toBe('/dashboard');
    });
    it.each([
      ['//evil.com'],
      ['/\\evil.com'],
      ['https://evil.com/admin'],
    ])('admin + next=%j → /admin', (next) => {
      expect(destinationForRole('admin', next)).toBe('/admin');
    });
  });

  describe('redirects back to auth pages bounce home', () => {
    it.each([
      ['/login'],
      ['/register'],
      ['/auth/callback'],
      ['/auth/anything'],
    ])('user + next=%j → /dashboard', (next) => {
      expect(destinationForRole('user', next)).toBe('/dashboard');
    });
  });

  describe('cross-role next routes home', () => {
    it('member asking for /admin gets /dashboard', () => {
      expect(destinationForRole('user', '/admin')).toBe('/dashboard');
      expect(destinationForRole('user', '/admin/users')).toBe('/dashboard');
    });
    it('admin asking for /dashboard gets /admin', () => {
      expect(destinationForRole('admin', '/dashboard')).toBe('/admin');
      expect(destinationForRole('admin', '/dashboard/applications')).toBe('/admin');
    });
  });

  describe('passes through legitimate same-origin paths', () => {
    it.each([
      ['/jobs'],
      ['/jobs/some-uuid'],
      ['/profile'],
      ['/applications'],
      ['/pricing?upgrade=1'],
      ['/jobs?category=engineering&remote=true'],
    ])('user + next=%j → %j', (next) => {
      expect(destinationForRole('user', next)).toBe(next);
    });
    it.each([
      ['/admin/users'],
      ['/admin/jobs'],
      ['/admin/sources'],
    ])('admin + next=%j → %j', (next) => {
      expect(destinationForRole('admin', next)).toBe(next);
    });
  });
});
