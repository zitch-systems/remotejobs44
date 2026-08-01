import { describe, it, expect } from 'vitest';
import { normaliseJobSpyJob, jobSpyJobToDbRow, jobSpySourceUrl, isPermanentJobSpyHttpStatus } from './jobspy';

describe('normaliseJobSpyJob', () => {
  it('normalises a typical JobSpy record', () => {
    const j = normaliseJobSpyJob({
      site: 'linkedin',
      title: 'Senior Backend Engineer',
      company: 'Acme',
      location: 'Remote, US',
      job_type: 'fulltime',
      description: 'Own our backend services and APIs.',
      job_url: 'https://linkedin.com/jobs/123',
      job_url_direct: 'https://acme.com/careers/123',
      date_posted: '2026-07-01',
      min_amount: 120000,
      max_amount: 160000,
      currency: 'usd',
      is_remote: true,
    });
    expect(j).not.toBeNull();
    expect(j!.title).toBe('Senior Backend Engineer');
    expect(j!.company).toBe('Acme');
    expect(j!.category).toBe('engineering');
    expect(j!.level).toBe('senior');
    expect(j!.type).toBe('full-time');
    expect(j!.currency).toBe('USD');
    expect(j!.salaryMin).toBe(120000);
    expect(j!.salaryMax).toBe(160000);
    expect(j!.remote).toBe(true);
    expect(j!.source).toBe('jobspy');
    expect(j!.site).toBe('linkedin');
  });

  it('prefers the direct apply URL over the board URL', () => {
    const j = normaliseJobSpyJob({
      title: 'Dev', company: 'X',
      job_url: 'https://board.example/abc',
      job_url_direct: 'https://employer.example/apply',
    });
    expect(j!.applyUrl).toBe('https://employer.example/apply');
    // sourceUrl keeps the board link for provenance
    expect(j!.sourceUrl).toBe('https://board.example/abc');
  });

  it('returns null when there is no usable apply URL', () => {
    expect(normaliseJobSpyJob({ title: 'X', company: 'Y' })).toBeNull();
    // non-http(s) schemes are rejected
    expect(normaliseJobSpyJob({ title: 'X', company: 'Y', job_url: 'javascript:alert(1)' })).toBeNull();
  });

  it('flattens a location object into a string', () => {
    const j = normaliseJobSpyJob({
      title: 'X', company: 'Y', job_url: 'https://e.com/1',
      location: { city: 'Lagos', state: '', country: 'Nigeria' },
    });
    expect(j!.location).toBe('Lagos, Nigeria');
  });

  it('falls back to Worldwide when location is missing', () => {
    const j = normaliseJobSpyJob({ title: 'X', company: 'Y', job_url: 'https://e.com/1' });
    expect(j!.location).toBe('Worldwide');
  });

  it('coerces string / dirty salary values to numbers or null', () => {
    const j = normaliseJobSpyJob({
      title: 'X', company: 'Y', job_url: 'https://e.com/1',
      min_amount: '$90,000', max_amount: '',
    });
    expect(j!.salaryMin).toBe(90000);
    expect(j!.salaryMax).toBeNull();
  });

  it('treats missing is_remote as remote (remote-first default)', () => {
    const j = normaliseJobSpyJob({ title: 'X', company: 'Y', job_url: 'https://e.com/1' });
    expect(j!.remote).toBe(true);
    const off = normaliseJobSpyJob({ title: 'X', company: 'Y', job_url: 'https://e.com/1', is_remote: false });
    expect(off!.remote).toBe(false);
  });

  it('parses epoch-second timestamps into ISO dates', () => {
    const j = normaliseJobSpyJob({
      title: 'X', company: 'Y', job_url: 'https://e.com/1',
      date_posted: 1751328000, // 2025-07-01 in seconds
    });
    expect(j!.posted.startsWith('2025-07-01')).toBe(true);
  });

  it('does not throw on garbage input', () => {
    expect(normaliseJobSpyJob(null)).toBeNull();
    expect(normaliseJobSpyJob('nope' as any)).toBeNull();
    expect(normaliseJobSpyJob(42 as any)).toBeNull();
  });
});

describe('jobSpyJobToDbRow', () => {
  it('produces a snake_case jobs-table row without flagged fields', () => {
    const j = normaliseJobSpyJob({
      title: 'Data Analyst', company: 'Beta',
      job_url: 'https://e.com/da', min_amount: 50000, currency: 'eur',
    })!;
    const row = jobSpyJobToDbRow(j);
    expect(row.apply_url).toBe('https://e.com/da');
    expect(row.source).toBe('jobspy');
    expect(row.category).toBe('data');
    expect(row.logo).toBe('B');
    expect(row.salary_min).toBe(50000);
    expect(row.currency).toBe('EUR');
    expect(row.is_active).toBe(true);
    // The pipeline sets flagged/flagged_reason after the scam screen.
    expect(row).not.toHaveProperty('flagged');
  });
});

describe('jobSpySourceUrl', () => {
  it('is deterministic and carries the query as a param', () => {
    const a = jobSpySourceUrl('remote designer');
    const b = jobSpySourceUrl('remote designer');
    expect(a).toBe(b);
    expect(a).toContain('search_term=remote+designer');
    expect(jobSpySourceUrl('remote engineer')).not.toBe(a);
  });
});


describe('JobSpy HTTP retries', () => {
  it('treats missing/auth endpoints as permanent configuration failures', () => {
    expect(isPermanentJobSpyHttpStatus(401)).toBe(true);
    expect(isPermanentJobSpyHttpStatus(404)).toBe(true);
  });

  it('keeps rate limits and server errors retryable', () => {
    expect(isPermanentJobSpyHttpStatus(408)).toBe(false);
    expect(isPermanentJobSpyHttpStatus(429)).toBe(false);
    expect(isPermanentJobSpyHttpStatus(503)).toBe(false);
  });
});
