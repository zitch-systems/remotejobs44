import { describe, it, expect } from 'vitest';
import { ATS_PLATFORMS, isValidATSPlatform, detectATSFromUrl, normaliseAshbyBoardSlug } from './ats-detect';

// The /api/ats GET handler accepts a `platform=<x>` query param and
// builds an upstream URL from it. Without this allow-list it would have
// been a 1-step SSRF pivot — `platform=internal.example.com/x#` would
// coerce the fetch to anywhere. These tests pin the allow-list so a
// well-meaning refactor that swaps `Set` for `Array.includes` (or vice
// versa) can't accidentally widen the surface.

describe('isValidATSPlatform', () => {
  it('accepts every entry in ATS_PLATFORMS', () => {
    for (const p of ATS_PLATFORMS) {
      expect(isValidATSPlatform(p)).toBe(true);
    }
  });

  it('rejects URL-fragment-shaped inputs (SSRF pivot attempt)', () => {
    expect(isValidATSPlatform('internal.example.com/x#')).toBe(false);
    expect(isValidATSPlatform('greenhouse.io/foo')).toBe(false);
    expect(isValidATSPlatform('169.254.169.254')).toBe(false);
    expect(isValidATSPlatform('greenhouse?evil')).toBe(false);
    expect(isValidATSPlatform('greenhouse/jobs')).toBe(false);
  });

  it('rejects case-mutated variants (exact-match required)', () => {
    // The whitelist is case-sensitive. The route's only consumer always
    // sends lowercase; tightening here means a query like
    // `platform=GREENHOUSE` is rejected before it hits the URL builder.
    expect(isValidATSPlatform('Greenhouse')).toBe(false);
    expect(isValidATSPlatform('GREENHOUSE')).toBe(false);
    expect(isValidATSPlatform('LEVER')).toBe(false);
  });

  it('rejects unknown / unrelated strings', () => {
    expect(isValidATSPlatform('unknown_platform')).toBe(false);
    expect(isValidATSPlatform('madeup')).toBe(false);
    expect(isValidATSPlatform('')).toBe(false);
    expect(isValidATSPlatform(null)).toBe(false);
    expect(isValidATSPlatform(undefined)).toBe(false);
  });

  it('does include the special "unknown" sentinel (documented intent)', () => {
    // detectATSFromUrl returns platform: 'unknown' when it can't classify
    // a URL; the allow-list must include it so /api/ats can pass-through
    // the sentinel without rejecting itself.
    expect(isValidATSPlatform('unknown')).toBe(true);
  });

  it('covers all 54 expected platforms', () => {
    // Snapshot-style check that the list hasn't silently shrunk. If you
    // intentionally remove a platform, drop the expected count too.
    expect(ATS_PLATFORMS.length).toBe(53);
  });
});

describe('detectATSFromUrl — high-traffic platforms', () => {
  // Smoke-test a representative subset of patterns. Not every platform
  // — there are 50+ adapters and pinning each is more boilerplate than
  // payoff. These are the four the audit's source-trust badge surfaces
  // as "Verified ATS", so they're the load-bearing detections.

  it('detects Greenhouse job-boards URLs', () => {
    const r = detectATSFromUrl('https://boards.greenhouse.io/stripe');
    expect(r?.platform).toBe('greenhouse');
    expect(r?.slug).toBe('stripe');
  });

  it('detects Lever URLs', () => {
    const r = detectATSFromUrl('https://jobs.lever.co/netflix');
    expect(r?.platform).toBe('lever');
    expect(r?.slug).toBe('netflix');
  });

  it('detects Ashby URLs', () => {
    const r = detectATSFromUrl('https://jobs.ashbyhq.com/openai');
    expect(r?.platform).toBe('ashby');
    expect(r?.slug).toBe('openai');
  });

  it('keeps an encoded Ashby board name intact', () => {
    const r = detectATSFromUrl('https://jobs.ashbyhq.com/scale%20army%20careers/16907f84-05a5-4c06-98f5-eeceef3d1512');
    expect(r).toMatchObject({
      platform: 'ashby',
      slug: 'scale%20army%20careers',
      apiEndpoint: 'https://api.ashbyhq.com/posting-api/job-board/scale%20army%20careers?includeCompensation=true',
    });
    expect(normaliseAshbyBoardSlug('scale army careers')).toBe('scale%20army%20careers');
  });

  it('rejects encoded path delimiters instead of importing a different board', () => {
    expect(detectATSFromUrl('https://jobs.ashbyhq.com/scale%2Farmy/jobs')).toBeNull();
    expect(normaliseAshbyBoardSlug('scale%252Farmy')).toBeNull();
  });

  it('detects Workable URLs', () => {
    const r = detectATSFromUrl('https://apply.workable.com/some-company/');
    expect(r?.platform).toBe('workable');
    expect(r?.slug).toBe('some-company');
  });

  it('returns null for non-ATS URLs', () => {
    expect(detectATSFromUrl('https://example.com/')).toBeNull();
    expect(detectATSFromUrl('https://google.com/jobs')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(detectATSFromUrl('')).toBeNull();
    expect(detectATSFromUrl('not-a-url')).toBeNull();
  });
});
