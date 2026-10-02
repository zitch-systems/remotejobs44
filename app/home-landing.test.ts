import { describe, expect, it } from 'vitest';
import { payCompact, payLabel, toPublicLandingJob, workplaceLabel } from '@/components/home/deep-ocean/helpers';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1', title: 'Engineer at Acme', company: 'Acme', location: 'Mountain View, CA',
    category: 'engineering', type: 'full-time', salary_min: null, salary_max: null,
    currency: 'USD', posted_at: '2026-10-01T00:00:00Z', featured: false,
    workplace_type: 'onsite', remote: false, relocation_supported: false,
    ...overrides,
  };
}

describe('anonymous homepage jobs', () => {
  it('removes employer identity from text and logo fallbacks', () => {
    const job = toPublicLandingJob(row());
    expect(job.company).toBe('Hidden Company');
    expect(job.title).toBe('Engineer at the company');
    expect(job.logo).toBe('RJ');
    expect(JSON.stringify(job)).not.toContain('Acme');
  });

  it('masks short employer names when they appear as title tokens', () => {
    const job = toPublicLandingJob(row({ title: 'Designer at X', company: 'X' }));
    expect(job.title).toBe('Designer at the company');
    expect(JSON.stringify(job)).not.toMatch(/"X"/);
  });

  it('does not label an on-site role as remote when salary is absent', () => {
    const job = toPublicLandingJob(row());
    expect(workplaceLabel(job)).toBe('On-site');
    expect(payCompact(job)).toBe('On-site');
    expect(payLabel(job)).toBeNull();
  });

  it('uses explicit hybrid and remote classifications', () => {
    expect(workplaceLabel(toPublicLandingJob(row({ workplace_type: 'hybrid' })))).toBe('Hybrid');
    expect(workplaceLabel(toPublicLandingJob(row({ workplace_type: null, remote: true })))).toBe('Remote');
  });

  it('keeps salary as the compact primary label when disclosed', () => {
    const job = toPublicLandingJob(row({ salary_min: 100000, salary_max: 140000 }));
    expect(payCompact(job)).toMatch(/^\$100/);
  });
});
