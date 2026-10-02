import { describe, it, expect, vi } from 'vitest';
import { parseATSApiUrl, refreshStaleATSBoards } from './ats-refresh';

const fetchATSJobs = vi.hoisted(() => vi.fn());
vi.mock('./ats-engine', () => ({ fetchATSJobs }));

describe('parseATSApiUrl', () => {
  // Real source_url shapes observed in the jobs table — each must round-trip
  // back to the (platform, slug) that lib/ats-engine.ts rebuilds.
  const cases: Array<[string, string, string]> = [
    ['https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true', 'greenhouse', 'stripe'],
    ['https://api.lever.co/v0/postings/gopuff?mode=json', 'lever', 'gopuff'],
    ['https://api.ashbyhq.com/posting-api/job-board/deliveroo?includeCompensation=true', 'ashby', 'deliveroo'],
    ['https://api.ashbyhq.com/posting-api/job-board/scale%20army%20careers?includeCompensation=true', 'ashby', 'scale%20army%20careers'],
    ['https://apply.workable.com/api/v3/accounts/acme/jobs', 'workable', 'acme'],
    ['https://api.smartrecruiters.com/v1/companies/AcmeInc/postings?limit=100', 'smartrecruiters', 'AcmeInc'],
    ['https://acme.recruitee.com/api/offers', 'recruitee', 'acme'],
    ['https://acme.jobs.personio.de/xml', 'personio', 'acme'],
    ['https://beryl.bamboohr.com/careers/list', 'bamboohr', 'beryl'],
    ['https://unito.breezy.hr/json', 'breezy', 'unito'],
  ];

  it.each(cases)('parses %s', (url, platform, slug) => {
    expect(parseATSApiUrl(url)).toEqual({ platform, slug });
  });

  it('returns null for empty / invalid input', () => {
    expect(parseATSApiUrl(null)).toBeNull();
    expect(parseATSApiUrl(undefined)).toBeNull();
    expect(parseATSApiUrl('')).toBeNull();
    expect(parseATSApiUrl('not a url')).toBeNull();
  });

  it('returns null for unrecognised hosts', () => {
    expect(parseATSApiUrl('https://example.com/v1/boards/foo/jobs')).toBeNull();
    expect(parseATSApiUrl('https://remotive.com/api/remote-jobs')).toBeNull();
  });

  it('rejects a slug with path-traversal / unsafe characters', () => {
    // A host we recognise but a slug we can't trust must be skipped, not fetched.
    expect(parseATSApiUrl('https://api.lever.co/v0/postings/..%2f..%2fetc?mode=json')).toBeNull();
    expect(parseATSApiUrl('https://api.ashbyhq.com/posting-api/job-board/scale%2Farmy')).toBeNull();
  });

  it('does not confuse the greenhouse public board host with the api host', () => {
    // boards.greenhouse.io (no -api) is the human board, not the JSON endpoint.
    expect(parseATSApiUrl('https://boards.greenhouse.io/stripe')).toBeNull();
  });
});

describe('refreshStaleATSBoards scheduling', () => {
  it('does not start a board without fetch and DB headroom', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'acquire_cron_lock') return { data: true, error: null };
      if (name === 'stale_ats_boards') return { data: [{ source_url: 'https://api.lever.co/v0/postings/acme' }], error: null };
      return { data: true, error: null };
    });
    const result = await refreshStaleATSBoards({ rpc } as any, { budgetMs: 24_999 });
    expect(result.timedOut).toBe(true);
    expect(fetchATSJobs).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('release_owned_cron_lock', expect.objectContaining({ p_lock_name: 'ats-refresh' }));
  });

  it('backs off transient failures for one day and still releases its owned lock', async () => {
    fetchATSJobs.mockResolvedValueOnce({ jobs: [], total: 0, platform: 'lever', slug: 'acme', error: 'Lever 503' });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const rpc = vi.fn(async (name: string) => {
      if (name === 'acquire_cron_lock') return { data: true, error: null };
      if (name === 'stale_ats_boards') return { data: [{ source_url: 'https://api.lever.co/v0/postings/acme' }], error: null };
      return { data: true, error: null };
    });
    const now = Date.now();
    const result = await refreshStaleATSBoards({ rpc, from: () => ({ upsert }) } as any, { budgetMs: 50_000 });
    expect(result.errors).toBe(1);
    const payload = upsert.mock.calls[0][0];
    const delay = Date.parse(payload.retry_after) - now;
    expect(delay).toBeGreaterThanOrEqual(86_399_000);
    expect(delay).toBeLessThanOrEqual(86_401_000);
    expect(rpc).toHaveBeenCalledWith('release_owned_cron_lock', expect.anything());
  });
});


describe('ATS board completion checkpoint', () => {
  it('checkpoints a successful empty board independently of job timestamps', async () => {
    fetchATSJobs.mockResolvedValueOnce({ jobs: [], total: 0, platform: 'lever', slug: 'empty', complete: true });
    const checkpoint = vi.fn().mockResolvedValue({ error: null });
    const clear = vi.fn().mockResolvedValue({ error: null });
    const rpc = vi.fn(async (name: string) => {
      if (name === 'acquire_cron_lock') return { data: true, error: null };
      if (name === 'stale_ats_boards') return { data: [{ source_url: 'https://api.lever.co/v0/postings/empty' }], error: null };
      return { data: 0, error: null };
    });
    const from = (name: string) => name === 'ats_board_checks'
      ? { upsert: checkpoint } : { delete: () => ({ eq: clear }) };
    const result = await refreshStaleATSBoards({ rpc, from } as any, { budgetMs: 50_000 });
    expect(result).toMatchObject({ boardsRefreshed: 1, added: 0, errors: 0, timedOut: false });
    const payload = checkpoint.mock.calls[0][0];
    expect(Date.parse(payload.next_check_at) - Date.parse(payload.checked_at)).toBe(86_400_000);
    expect(rpc).toHaveBeenCalledWith('retire_missing_ats_jobs', expect.objectContaining({ p_seen_urls: [] }));
  });
});
