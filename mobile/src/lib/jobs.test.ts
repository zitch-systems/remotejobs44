jest.mock('./api', () => ({ apiFetch: jest.fn() }));
jest.mock('./feed-cache', () => ({ loadFeedCache: jest.fn(), saveFeedCache: jest.fn() }));
jest.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { onAuthStateChange: jest.fn(), getSession: jest.fn() }, rpc: jest.fn() },
}));

import { rowToJob, scheduleAfterAuth } from './jobs';

describe('trusted jobs API adapter', () => {
  it('maps current camelCase API fields and workplace metadata', () => {
    const job = rowToJob({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Platform Engineer', company: 'Hidden Company', logo: null,
      category: 'engineering', type: 'full-time', level: 'senior',
      location: 'Berlin', applyUrl: null, applyEmail: null,
      description: 'Build reliable distributed systems for global users.',
      requirements: ['Own services in production'], skills: ['TypeScript'],
      salaryMin: 100000, salaryMax: 140000, currency: 'USD', remote: false,
      featured: true, posted: '2026-10-01T00:00:00.000Z',
      workplaceType: 'onsite', relocationSupported: true, visaSponsorship: true,
      source: 'greenhouse',
    });

    expect(job.salary).toBe('$100k–$140k');
    expect(job.location).toBe('Berlin');
    expect(job.workplaceType).toBe('onsite');
    expect(job.relocationSupported).toBe(true);
    expect(job.visaSponsorship).toBe(true);
    expect(job.verified).toBe(true);
    expect(job.company).toBe('Hidden Company');
  });

  it('labels remote API results without duplicating identity fields', () => {
    const job = rowToJob({
      id: '22222222-2222-4222-8222-222222222222', title: 'Designer', company: 'Acme', logo: null,
      category: null, type: null, level: null, location: 'Worldwide', description: null,
      requirements: null, skills: null, salaryMin: null, salaryMax: null, currency: null,
      remote: true, featured: false, posted: null, workplaceType: 'remote',
      source: 'manual',
    });
    expect(job.location).toBe('Remote · Worldwide');
    expect(job.applyUrl).toBeUndefined();
    expect(job.verified).toBe(false);
  });
});

describe('auth refresh scheduling', () => {
  it('does not run Supabase-dependent refresh work inside the auth callback', () => {
    jest.useFakeTimers();
    const work = jest.fn();
    scheduleAfterAuth(work);
    expect(work).not.toHaveBeenCalled();
    jest.runOnlyPendingTimers();
    expect(work).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
