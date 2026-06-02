import { describe, it, expect } from 'vitest';
import { parseATSApiUrl } from './ats-refresh';

describe('parseATSApiUrl', () => {
  // Real source_url shapes observed in the jobs table — each must round-trip
  // back to the (platform, slug) that lib/ats-engine.ts rebuilds.
  const cases: Array<[string, string, string]> = [
    ['https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true', 'greenhouse', 'stripe'],
    ['https://api.lever.co/v0/postings/gopuff?mode=json', 'lever', 'gopuff'],
    ['https://api.ashbyhq.com/posting-api/job-board/deliveroo?includeCompensation=true', 'ashby', 'deliveroo'],
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
  });

  it('does not confuse the greenhouse public board host with the api host', () => {
    // boards.greenhouse.io (no -api) is the human board, not the JSON endpoint.
    expect(parseATSApiUrl('https://boards.greenhouse.io/stripe')).toBeNull();
  });
});
