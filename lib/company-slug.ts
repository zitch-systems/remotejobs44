// lib/company-slug.ts
//
// Canonical URL slug for a company name. Two different inputs that
// normalise to the same slug (Acme vs ACME, foo  bar vs foo-bar) are
// treated as the same company on /companies/[slug].
//
// We don't store the slug in the jobs table — slugs are derived on the
// fly because jobs.company is the source of truth and a CSV import
// might use a slightly different casing/spacing. To resolve a slug
// back to a company name, query jobs WHERE lower(replace(company, ' ',
// '-')) = $1, then use the most common spelling from the result rows.

export function companySlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')   // non-alphanum → dash
    .replace(/^-+|-+$/g, '')        // trim leading/trailing dashes
    .slice(0, 100);                  // safety cap
}
