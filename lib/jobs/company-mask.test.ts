import { describe, it, expect } from 'vitest';
import { HIDDEN_COMPANY_LABEL, scrubCompanyIdentity, scrubCompanyMentions } from './company-mask';

// These tests pin the server-side employer mask used by /jobs/[id]: for
// non-subscribers the company name must not survive into the description,
// requirements, benefits, or metadata text the page ships.
describe('scrubCompanyMentions', () => {
  it('replaces a plain mention', () => {
    expect(scrubCompanyMentions('Acme is hiring a senior engineer.', 'Acme'))
      .toBe('the company is hiring a senior engineer.');
  });

  it('is case-insensitive and replaces every occurrence', () => {
    expect(scrubCompanyMentions('Join ACME. At acme we ship.', 'Acme'))
      .toBe('Join the company. At the company we ship.');
  });

  it('respects word boundaries', () => {
    expect(scrubCompanyMentions('Acmeified pipelines at Acme.', 'Acme'))
      .toBe('Acmeified pipelines at the company.');
  });

  it('escapes regex metacharacters in the name', () => {
    expect(scrubCompanyMentions('Work at Ernst & Young (EY) today', 'Ernst & Young (EY)'))
      .toBe('Work at the company today');
  });

  it('matches a name ending in punctuation (no impossible trailing \\b)', () => {
    expect(scrubCompanyMentions('Acme Inc. builds rockets', 'Acme Inc.'))
      .toBe('the company builds rockets');
  });

  it('also scrubs the base name when the row carries a legal suffix', () => {
    expect(scrubCompanyMentions('About Acme: Acme Inc. is a lab.', 'Acme Inc.'))
      .toBe('About the company: the company is a lab.');
  });

  it('leaves names shorter than 3 chars alone (too collision-prone)', () => {
    const text = 'GO programmers welcome to go far';
    expect(scrubCompanyMentions(text, 'GO')).toBe(text);
  });

  it('passes through empty/absent inputs', () => {
    expect(scrubCompanyMentions('', 'Acme')).toBe('');
    expect(scrubCompanyMentions('hello', null)).toBe('hello');
    expect(scrubCompanyMentions('hello', undefined)).toBe('hello');
    expect(scrubCompanyMentions('hello', '  ')).toBe('hello');
  });

  it('exports a non-empty display label', () => {
    expect(HIDDEN_COMPANY_LABEL.length).toBeGreaterThan(0);
  });
});


describe('scrubCompanyIdentity', () => {
  it('removes career URLs, bare domains, and recruiter emails', () => {
    const text = [
      'Apply at https://acme.com/careers/42?ref=board.',
      'Questions: jobs@acme.com or www.acme.io/jobs.',
      'Mirror: careers.acme.jobs/openings/42',
    ].join(' ');
    const result = scrubCompanyIdentity(text, 'Acme');
    expect(result).not.toMatch(/acme\.(com|io|jobs)/i);
    expect(result).not.toContain('jobs@');
    expect(result).not.toContain('https://');
    expect(result).toContain('application details available after applying');
  });

  it('scrubs the company name and mailto links together', () => {
    const result = scrubCompanyIdentity(
      '<a href="mailto:careers@acme.com">Email Acme</a>',
      'Acme',
    );
    expect(result).not.toMatch(/acme/i);
    expect(result).not.toMatch(/careers@/i);
  });
});
