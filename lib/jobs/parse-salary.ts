/** The jobs schema/UI stores annual pay. Never label hourly/monthly pay /yr. */
export function parseAnnualSalary(raw: unknown): { min: number | null; max: number | null; currency: string } {
  const text = typeof raw === 'string' ? raw.trim() : '';
  const currency = /\bCAD\b|C\$/i.test(text) ? 'CAD'
    : /\bAUD\b|A\$/i.test(text) ? 'AUD'
    : /€|\bEUR\b/i.test(text) ? 'EUR'
    : /£|\bGBP\b/i.test(text) ? 'GBP'
    : /₦|\bNGN\b/i.test(text) ? 'NGN' : 'USD';
  const empty = { min: null, max: null, currency };
  if (!/\b(year|yearly|annual|annually|annum|yr)\b/i.test(text)
    || /\b(hour|hourly|hr|month|monthly|week|weekly|day|daily)\b/i.test(text)) return empty;
  const matches = [...text.matchAll(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*([kKmM])?\b/g)];
  if (!matches.length || matches.length > 2) return empty;
  const values = matches.map((m, index) => {
    // "$145–175K a year": the trailing multiplier applies to both bounds.
    const suffix = m[2] ?? (matches.length === 2 && index === 0 ? matches[1][2] : undefined);
    return Number(m[1].replace(/,/g, '')) * (suffix?.toLowerCase() === 'm' ? 1_000_000 : suffix?.toLowerCase() === 'k' ? 1_000 : 1);
  });
  if (values.some(n => !Number.isFinite(n) || n <= 0 || n > 2_147_483_647)
    || (values.length === 2 && values[1] < values[0])) return empty;
  return { min: values[0], max: values[1] ?? null, currency };
}
