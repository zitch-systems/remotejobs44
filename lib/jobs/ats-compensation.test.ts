import { describe, expect, it } from 'vitest';
import { ashbyCompensation, greenhouseCompensation, leverCompensation } from './ats-compensation';

describe('ATS compensation', () => {
  it('uses only an explicit annual Lever range with its own currency', () => {
    expect(leverCompensation({ salaryRange: { min: 90000, max: 120000, currency: 'EUR', interval: 'per-year-salary' } }))
      .toMatchObject({ salaryMin: 90000, salaryMax: 120000, currency: 'EUR' });
    expect(leverCompensation({ salaryRange: { min: 45, max: 65, currency: 'USD', interval: 'per-hour-wage' },
      salaryDescriptionPlain: '$45–65 per hour' })).toEqual({ salaryText: '$45–65 per hour' });
    expect(leverCompensation({ salaryRange: { min: 100000, max: 140000, interval: 'per-year-salary' } }))
      .toEqual({ salaryText: undefined });
  });

  it('selects annual Ashby salary and rejects equity, bonus, and multiple salary tiers', () => {
    const salary = { compensationType: 'Salary', interval: '1 YEAR', currencyCode: 'GBP', minValue: 70000, maxValue: 90000 };
    const bonus = { compensationType: 'Bonus', interval: '1 YEAR', currencyCode: 'GBP', minValue: 10000, maxValue: 12000 };
    expect(ashbyCompensation({ summaryComponents: [bonus, salary], compensationTierSummary: '£70k–90k plus bonus' }))
      .toEqual({ salaryText: '£70k–90k plus bonus', salaryMin: 70000, salaryMax: 90000, currency: 'GBP' });
    expect(ashbyCompensation({ compensationTiers: [{ components: [salary] }, { components: [salary] }] }))
      .toEqual({ salaryText: undefined });
    expect(ashbyCompensation({ summaryComponents: [{ ...salary, interval: '1 MONTH' }] }))
      .toEqual({ salaryText: undefined });
  });

  it('keeps Greenhouse cents as text unless the input explicitly specifies annual base salary', () => {
    expect(greenhouseCompensation({ pay_input_ranges: [{ title: 'Annual Base Salary', min_cents: 8100000,
      max_cents: 8700000, currency_type: 'CAD' }] })).toMatchObject({ salaryMin: 81000, salaryMax: 87000, currency: 'CAD' });
    const hourly = greenhouseCompensation({ pay_input_ranges: [{ title: 'Hourly wage', min_cents: 4500,
      max_cents: 6000, currency_type: 'USD' }] });
    expect(hourly).toEqual({ salaryText: 'Hourly wage: USD 45–60' });
    expect(greenhouseCompensation({ pay_input_ranges: [{ title: 'Annual Base Salary', min_cents: 10000000,
      max_cents: 12000000 }] })).not.toHaveProperty('currency');
    expect(greenhouseCompensation({ content: '<p>Base salary: CAD 100,000–140,000 per year.</p>' }))
      .toMatchObject({ salaryMin: 100000, salaryMax: 140000, currency: 'CAD' });
    expect(greenhouseCompensation({ content: '<p>Base salary: $100,000–140,000 per year.</p>' }))
      .not.toHaveProperty('currency');
  });
});
