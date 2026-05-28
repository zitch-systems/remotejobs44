import { describe, it, expect } from 'vitest';
import { companySlug } from './company-slug';

describe('companySlug', () => {
  it('lowercases and replaces non-alphanum with dashes', () => {
    expect(companySlug('Stripe')).toBe('stripe');
    expect(companySlug('GitHub')).toBe('github');
    expect(companySlug('Two Sigma')).toBe('two-sigma');
    expect(companySlug('AT&T')).toBe('at-t');
  });

  it('collapses runs of non-alphanum into a single dash', () => {
    expect(companySlug('Foo   Bar')).toBe('foo-bar');
    expect(companySlug('Foo, Bar & Baz')).toBe('foo-bar-baz');
  });

  it('trims leading/trailing dashes', () => {
    expect(companySlug('  Stripe  ')).toBe('stripe');
    expect(companySlug('-Stripe-')).toBe('stripe');
    expect(companySlug('!!!Stripe!!!')).toBe('stripe');
  });

  it('collapses casing differences — "Stripe" and "STRIPE" share a slug', () => {
    expect(companySlug('Stripe')).toBe(companySlug('STRIPE'));
    expect(companySlug('Acme')).toBe(companySlug('ACME'));
  });

  it('handles unicode by stripping it', () => {
    expect(companySlug('Café Inc')).toBe('caf-inc');
  });

  it('caps at 100 chars', () => {
    const long = 'a'.repeat(200);
    expect(companySlug(long)).toHaveLength(100);
  });

  it('returns empty string for non-alphanum input', () => {
    expect(companySlug('!!!')).toBe('');
    expect(companySlug('   ')).toBe('');
  });
});
