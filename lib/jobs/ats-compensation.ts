// ATS compensation is heterogeneous. Numeric Job salaries are annual amounts only;
// preserve the provider's own text when a rate or currency cannot be established.
export interface ATSCompensation {
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  salaryText?: string;
}

const currency = (value: unknown): string | undefined =>
  typeof value === 'string' && /^[A-Z]{3}$/.test(value.trim().toUpperCase())
    ? value.trim().toUpperCase() : undefined;
const INT4_MAX = 2_147_483_647;
const rawAmount = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
const integerAmount = (value: unknown): number | undefined => {
  const raw = rawAmount(value);
  if (raw === undefined) return undefined;
  const rounded = Math.round(raw);
  return rounded <= INT4_MAX ? rounded : undefined;
};
const plain = (value: unknown, maxLength = 20_000): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, maxLength) : undefined;
};
const annual = (value: unknown): boolean => /^(1 YEAR|per-year-salary|year|yearly|annual|annually|per year|\/year|\/yr)$/i.test(String(value ?? '').trim());

export function leverCompensation(posting: any): ATSCompensation {
  const range = posting.salaryRange;
  const salaryText = plain(posting.salaryDescriptionPlain, 240) ?? plain(posting.salaryDescription, 240);
  const base: ATSCompensation = { salaryText };
  if (!range || !annual(range.interval)) return base;
  const code = currency(range.currency);
  if (!code) return base;
  const min = integerAmount(range.min), max = integerAmount(range.max);
  if (min === undefined && max === undefined) return base;
  if (min !== undefined && max !== undefined && min > max) return base;
  return { ...base, salaryMin: min, salaryMax: max, currency: code };
}

export function ashbyCompensation(compensation: any): ATSCompensation {
  if (!compensation || typeof compensation !== 'object') return {};
  const salaryText = plain(compensation.compensationTierSummary, 240)
    ?? plain(compensation.scrapeableCompensationSalarySummary, 240);
  const base: ATSCompensation = { salaryText };
  const components = Array.isArray(compensation.summaryComponents)
    ? compensation.summaryComponents
    : Array.isArray(compensation.compensationTiers)
      ? compensation.compensationTiers.flatMap((tier: any) => tier.components ?? []) : [];
  const salaries = components.filter((component: any) =>
    /^(salary|base)$/i.test(String(component.compensationType ?? '')) &&
    annual(component.interval) && currency(component.currencyCode) &&
    (integerAmount(component.minValue) !== undefined || integerAmount(component.maxValue) !== undefined) &&
    (integerAmount(component.minValue) === undefined || integerAmount(component.maxValue) === undefined ||
      component.minValue <= component.maxValue));
  // Multiple location tiers or currencies cannot be collapsed to one honest range.
  if (salaries.length !== 1) return base;
  const salary = salaries[0];
  return { ...base, salaryMin: integerAmount(salary.minValue), salaryMax: integerAmount(salary.maxValue),
    currency: currency(salary.currencyCode) };
}

export function greenhouseCompensation(job: any): ATSCompensation {
  const ranges = Array.isArray(job.pay_input_ranges) ? job.pay_input_ranges : [];
  const texts: string[] = [];
  const annualRanges: ATSCompensation[] = [];
  for (const range of ranges) {
    const code = currency(range.currency_type);
    const min = rawAmount(range.min_cents), max = rawAmount(range.max_cents);
    const description = [plain(range.title), plain(range.blurb)].filter(Boolean).join(' — ');
    const values = [min, max].filter((v): v is number => v !== undefined)
      .map(v => (v / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }));
    if (values.length) texts.push(`${description ? `${description}: ` : ''}${code ? `${code} ` : ''}${values.join('–')}`);
    else if (description) texts.push(description);
    // Greenhouse exposes cents but has no machine-readable pay interval.
    // Require the pay input's own title/blurb to identify an annual base salary.
    if (!/\b(salary|base pay|base compensation)\b/i.test(description) ||
        !/\b(annual|annually|yearly|per year)\b|\/yr\b/i.test(description) ||
        /\b(hourly|per hour|per month|monthly|weekly)\b/i.test(description) ||
        !code || (!values.length) || (min !== undefined && max !== undefined && min > max)) continue;
    const salaryMin = min === undefined ? undefined : integerAmount(min / 100);
    const salaryMax = max === undefined ? undefined : integerAmount(max / 100);
    if ((salaryMin === undefined && salaryMax === undefined) ||
        (salaryMin !== undefined && salaryMax !== undefined && salaryMin > salaryMax)) continue;
    annualRanges.push({ salaryMin, salaryMax, currency: code });
  }
  const salaryText = texts.length ? texts.join(' • ').slice(0, 240) : undefined;
  if (annualRanges.length === 1) return { ...annualRanges[0], salaryText };
  if (ranges.length) return { salaryText };
  // Some boards put pay in the post body instead of publishing pay inputs.
  // Only parse a labeled, explicitly annual range with an ISO currency code.
  const description = plain(job.content);
  const match = description?.match(/\b(?:base salary|salary|base pay|base compensation)\b[^.;\n]{0,70}\b([A-Z]{3})\s+([\d,]{4,})(?:\s*(?:-|–|—|to)\s*(?:[A-Z]{3}\s+)?([\d,]{4,}))?[^.;\n]{0,30}\b(?:per year|annually|annual|yearly)\b/i);
  if (!match) return {};
  const min = Number(match[2].replaceAll(',', ''));
  const max = match[3] ? Number(match[3].replaceAll(',', '')) : undefined;
  const salaryMin = integerAmount(min);
  const salaryMax = max === undefined ? undefined : integerAmount(max);
  const code = currency(match[1]);
  const text = match[0].trim();
  if (!/^[A-Z]{3}$/.test(match[1]) || !code || salaryMin === undefined || salaryMin < 1000 ||
      (max !== undefined && (salaryMax === undefined || max < min))) return { salaryText: text };
  return { salaryMin, salaryMax, currency: code, salaryText: text };
}
