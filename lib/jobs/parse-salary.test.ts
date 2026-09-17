import { describe, it, expect } from 'vitest';
import { parseAnnualSalary } from './parse-salary';

describe('annual salary import', () => {
  it.each(['$145K–175K a year', '$145–175K a year', 'USD 145,000 - 175,000 per year'])(
    'preserves thousands in %s', raw => expect(parseAnnualSalary(raw)).toEqual({ min: 145000, max: 175000, currency: 'USD' }));
  it('preserves decimals and currency', () => expect(parseAnnualSalary('£80.5K annually')).toEqual({ min: 80500, max: null, currency: 'GBP' }));
  it.each(['$25–30 an hour', '$5,000 per month', '$145–175', 'Competitive', null, '$175K–145K a year'])(
    'does not invent annual pay for %s', raw => expect(parseAnnualSalary(raw).min).toBeNull());
});
