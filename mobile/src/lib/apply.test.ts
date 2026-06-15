import { applyTarget } from './apply';
import type { Job } from './types';

const job = (over: Partial<Job>): Pick<Job, 'applyUrl' | 'applyEmail'> => ({ applyUrl: undefined, applyEmail: undefined, ...over });

describe('applyTarget', () => {
  it('prefers a valid http(s) url', () => {
    expect(applyTarget(job({ applyUrl: 'https://acme.com/jobs/1' }))).toEqual({ type: 'url', value: 'https://acme.com/jobs/1' });
    expect(applyTarget(job({ applyUrl: 'http://acme.com/jobs/1', applyEmail: 'jobs@acme.com' }))).toEqual({ type: 'url', value: 'http://acme.com/jobs/1' });
  });
  it('falls back to a valid email', () => {
    expect(applyTarget(job({ applyEmail: 'careers@acme.com' }))).toEqual({ type: 'email', value: 'careers@acme.com' });
  });
  it('rejects non-http urls and malformed emails', () => {
    expect(applyTarget(job({ applyUrl: 'javascript:alert(1)' }))).toBeNull();
    expect(applyTarget(job({ applyUrl: 'ftp://x/y' }))).toBeNull();
    expect(applyTarget(job({ applyEmail: 'not-an-email' }))).toBeNull();
  });
  it('returns null when neither is present', () => {
    expect(applyTarget(job({}))).toBeNull();
    expect(applyTarget(job({ applyUrl: '   ' }))).toBeNull();
  });
});
