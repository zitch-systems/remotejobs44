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
  it('accepts ordinary apply addresses, including plus-tags and subdomains', () => {
    for (const email of ['jobs+remote@acme.com', 'first.last@careers.acme-corp.co.uk', 'HR_Team@Acme.IO']) {
      expect(applyTarget(job({ applyEmail: email }))).toEqual({ type: 'email', value: email });
    }
    expect(applyTarget(job({ applyEmail: '  careers@acme.com \n' }))).toEqual({ type: 'email', value: 'careers@acme.com' });
  });
  it('refuses anything that would change a mailto: link beyond one recipient', () => {
    // Each of these is spliced into `mailto:<value>?subject=…`: they would add
    // headers (bcc/cc/body), extra recipients, or hide either behind %-encoding.
    for (const email of [
      'hr@acme.com?bcc=attacker@evil.test',
      'hr@acme.com&cc=attacker@evil.test',
      'hr@acme.com,attacker@evil.test',
      'hr@acme.com;attacker@evil.test',
      'hr@acme.com%2Cattacker@evil.test',
      'hr%40acme.com',
      'hr@acme.com\r\nbcc: attacker@evil.test',
      '<hr@acme.com>',
      '"hr"@acme.com',
      'hr@acme',
      'hr@@acme.com',
      'hr@acme.c',
    ]) {
      expect(applyTarget(job({ applyEmail: email }))).toBeNull();
    }
  });
  it('returns null when neither is present', () => {
    expect(applyTarget(job({}))).toBeNull();
    expect(applyTarget(job({ applyUrl: '   ' }))).toBeNull();
  });
});
