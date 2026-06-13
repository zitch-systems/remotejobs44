import { describe, it, expect } from 'vitest';
import { destinationForRole, resolveRole } from './redirect';
import { isHardcodedAdmin } from '@/lib/admin-emails';

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
    it('agent → /agent', () => {
      expect(destinationForRole('agent')).toBe('/agent');
      expect(destinationForRole('agent', null)).toBe('/agent');
      expect(destinationForRole('agent', '')).toBe('/agent');
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
    it('member/agent surfaces are mutually exclusive with /admin', () => {
      expect(destinationForRole('agent', '/admin')).toBe('/agent');
      expect(destinationForRole('agent', '/admin/users')).toBe('/agent');
      expect(destinationForRole('user', '/agent')).toBe('/dashboard');
      expect(destinationForRole('admin', '/agent')).toBe('/admin');
    });
    it('agents may still reach the member dashboard (they are members too)', () => {
      expect(destinationForRole('agent', '/dashboard')).toBe('/dashboard');
      expect(destinationForRole('agent', '/jobs')).toBe('/jobs');
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

// Pins resolveRole — the function at the heart of the admin sign-in saga
// (PRs #27/#28). The whole "DB-admin bounced to /dashboard → session expired"
// bug came from how a MISSING profile resolves here, so these cases are the
// regression guard.
describe('resolveRole', () => {
  it('DB role admin → admin (even for a non-hardcoded email)', () => {
    expect(resolveRole({ profileRole: 'admin', email: 'jane@example.com' })).toBe('admin');
  });

  it('honours the hardcoded-admin list without any profile role (case-insensitive)', () => {
    // Cross-check against isHardcodedAdmin rather than hard-coding the email,
    // so this can't go flaky if HARDCODED_ADMIN_EMAILS overrides the
    // compile-time fallback in some environment. The point is that resolveRole
    // is wired to the hardcoded list, and is case-insensitive.
    const email = 'admin@remotejobs44.com';
    const expected = isHardcodedAdmin(email) ? 'admin' : 'user';
    expect(resolveRole({ profileRole: undefined, email })).toBe(expected);
    expect(resolveRole({ profileRole: undefined, email: email.toUpperCase() })).toBe(expected);
  });

  it('regular member → user', () => {
    expect(resolveRole({ profileRole: 'user', email: 'jane@example.com' })).toBe('user');
  });

  it('DB role agent → agent', () => {
    expect(resolveRole({ profileRole: 'agent', email: 'jane@example.com' })).toBe('agent');
  });

  it('admin signal still wins over an agent DB role', () => {
    // A hardcoded-admin email tagged 'agent' in the DB is treated as admin —
    // the platform owner promoting their own account shouldn't lose /admin.
    const email = 'admin@remotejobs44.com';
    const expected = isHardcodedAdmin(email) ? 'admin' : 'agent';
    expect(resolveRole({ profileRole: 'agent', email })).toBe(expected);
  });

  // THE REGRESSION INVARIANT behind #28: a failed/missing profile fetch leaves
  // profileRole undefined, which for a non-hardcoded email resolves to 'user'.
  // That is correct — and it is precisely why the /admin gate must only bounce
  // to /dashboard on a POSITIVELY-read non-admin profile, never on a null
  // fetch. (A DB-only admin whose profile fetch times out is still an admin.)
  it('undefined/null profileRole + non-hardcoded email → user (a failed fetch is NOT proof of non-admin)', () => {
    expect(resolveRole({ profileRole: undefined, email: 'jane@example.com' })).toBe('user');
    expect(resolveRole({ profileRole: null, email: 'jane@example.com' })).toBe('user');
  });

  it('missing email → user', () => {
    expect(resolveRole({ profileRole: undefined, email: null })).toBe('user');
    expect(resolveRole({ profileRole: undefined, email: undefined })).toBe('user');
  });
});
