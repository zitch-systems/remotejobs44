import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { requireCronSecret } from './cron-auth';

// Build a fake NextRequest carrying a single Authorization header.
function makeReq(authHeader?: string): NextRequest {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set('authorization', authHeader);
  return new NextRequest(new URL('http://test/api/cron/x'), { headers });
}

describe('requireCronSecret', () => {
  const ORIGINAL_SECRET = process.env.CRON_SECRET;
  beforeEach(() => { delete process.env.CRON_SECRET; });
  afterEach(()  => {
    if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_SECRET;
  });

  it('fails closed with 503 when CRON_SECRET is unset', async () => {
    const out = requireCronSecret(makeReq('Bearer anything'), 'test.unset');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.res.status).toBe(503);
  });

  it('fails closed with 503 when CRON_SECRET is too short', async () => {
    process.env.CRON_SECRET = 'short';
    const out = requireCronSecret(makeReq('Bearer short'), 'test.short');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.res.status).toBe(503);
  });

  it('returns 401 when header is missing', async () => {
    process.env.CRON_SECRET = 'abcdef0123456789ZZZ';
    const out = requireCronSecret(makeReq(undefined), 'test.missing');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.res.status).toBe(401);
  });

  it('returns 401 when header has wrong scheme', async () => {
    process.env.CRON_SECRET = 'abcdef0123456789ZZZ';
    const out = requireCronSecret(makeReq('Basic abcdef0123456789ZZZ'), 'test.scheme');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.res.status).toBe(401);
  });

  it('returns 401 when token does not match', async () => {
    process.env.CRON_SECRET = 'abcdef0123456789ZZZ';
    const out = requireCronSecret(makeReq('Bearer wrongsecretvalue000'), 'test.wrong');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.res.status).toBe(401);
  });

  it('returns ok when secret matches exactly', async () => {
    process.env.CRON_SECRET = 'abcdef0123456789ZZZ';
    const out = requireCronSecret(makeReq('Bearer abcdef0123456789ZZZ'), 'test.match');
    expect(out.ok).toBe(true);
  });

  // Length mismatch is the common attacker probe (sending short tokens to
  // discover the secret length). Must return 401 without ever calling
  // timingSafeEqual (which would throw on different-length buffers and
  // could turn into a 500 the attacker can distinguish from a 401).
  it('returns 401 (not 500) when header length differs', async () => {
    process.env.CRON_SECRET = 'abcdef0123456789ZZZ';
    const out = requireCronSecret(makeReq('Bearer x'), 'test.length');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.res.status).toBe(401);
  });
});
