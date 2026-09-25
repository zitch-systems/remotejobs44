import { describe, expect, it } from 'vitest';
import { formatSalary } from './utils';

describe('formatSalary', () => {
  it('formats ranges with their supplied currency and annual period', () => {
    const formatted = formatSalary(72_500, 98_250, 'EUR');
    expect(formatted).toContain('€');
    expect(formatted).toContain('72.5k');
    expect(formatted).toContain('98.3k');
    expect(formatted).toMatch(/\/yr$/);
  });

  it('preserves a legitimate zero floor and formats a single bound', () => {
    expect(formatSalary(0, 50_000, 'USD')).toContain('$0');
    expect(formatSalary(undefined, 50_000, 'USD')).toContain('Up to $50.0k');
    expect(formatSalary(50_000, undefined, 'USD')).toMatch(/\+\/yr$/);
  });

  it('does not invent salary details when both bounds are missing', () => {
    expect(formatSalary(undefined, undefined, 'GBP')).toBe('');
    expect(formatSalary(0, 0, 'USD')).toBe('');
  });

  it('does not label ambiguous legacy low-rate values as annual salary', () => {
    expect(formatSalary(33, 280, 'USD')).toBe('$33–$280');
  });
});
