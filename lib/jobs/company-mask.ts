// lib/jobs/company-mask.ts — server-side employer-identity masking.
//
// The employer's identity on the job detail page is a subscriber feature:
// only Pro (monthly / annual — both resolve to plan 'pro') and staff admins
// get the real name. For every other requester — anonymous, free, Day Pass —
// the server must not ship the name through ANY channel of the /jobs/[id]
// response: visible DOM text, the <title>/meta description in <head>, the
// JobPosting / BreadcrumbList JSON-LD, the RSC flight payload feeding the
// client islands, or link hrefs whose slug encodes the name.
//
// This replaces the old approach for that page (real name in the SSR HTML,
// hidden by a client-side CSS blur), which hid nothing from anyone who
// looked at the browser tab title, view-source, or the structured data.
// The deliberate SEO cost: crawlers are anonymous, so public copies of the
// page carry the masked name too — same trade the OG share image already
// made (see app/jobs/[id]/layout.tsx), now applied consistently.

/** Display label rendered in place of the employer name for masked viewers. */
export const HIDDEN_COMPANY_LABEL = 'Hidden Company';

/** Replacement for in-prose mentions, where a neutral noun reads naturally. */
const PROSE_REPLACEMENT = 'the company';

/**
 * Strips mentions of the employer's name from free-text fields (title,
 * description, requirements, benefits). A masked header over a description
 * that opens with "About Acme, Inc: …" is no mask at all.
 *
 * Deliberately conservative:
 *  - names shorter than 3 chars ("GO", "X") collide with ordinary words far
 *    too often to scrub safely, so they pass through untouched — the header
 *    mask still hides the canonical name;
 *  - matches are word-bounded (company "Acme" leaves "Acmeified" alone), but
 *    a boundary is only anchored against ends that are word characters, since
 *    `\b` next to "." or ")" (e.g. "Acme Inc.") can never match;
 *  - a trailing legal suffix (Inc, LLC, Ltd, …) is also tried without, so a
 *    row stored as "Acme Inc." still scrubs a prose mention of plain "Acme".
 */
export function scrubCompanyMentions(text: string, company: string | null | undefined): string {
  if (!text) return text;
  const name = (company ?? '').trim();
  if (name.length < 3) return text;

  const variants = new Set<string>([name]);
  const base = name.replace(/[,.]?\s+(inc|llc|ltd|limited|gmbh|corp|corporation|co)\.?$/i, '').trim();
  if (base.length >= 3) variants.add(base);

  let out = text;
  for (const variant of variants) {
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const lead = /^\w/.test(variant) ? '\\b' : '';
    const tail = /\w$/.test(variant) ? '\\b' : '';
    out = out.replace(new RegExp(`${lead}${escaped}${tail}`, 'gi'), PROSE_REPLACEMENT);
  }
  return out;
}


const PRIVATE_CHANNEL_REPLACEMENT = '[application details available after applying]';

/**
 * Removes indirect employer/application disclosures from public job copy.
 * Scraping commonly leaves career-site URLs and recruiter emails in the
 * description even when apply_url and the company header are masked.
 */
export function scrubCompanyIdentity(text: string, company: string | null | undefined): string {
  if (!text) return text;

  // Scrub complete channels before the company name. Otherwise a name inside
  // jobs@company.com is replaced first and the remaining malformed address can
  // evade the email/domain patterns below.
  const out = text
    // ATS feeds often HTML-encode URL separators inside anchor text/hrefs.
    // Decode only channel punctuation so the normal URL/email patterns see
    // the complete value before later description normalization.
    .replace(/(?:&#x2f;|&#47;|&sol;)/gi, '/')
    .replace(/(?:&#x3a;|&#58;|&colon;)/gi, ':')
    .replace(/(?:&#x40;|&#64;|&commat;)/gi, '@')
    .replace(/\bmailto:[^\s<>"')\]]+/gi, PRIVATE_CHANNEL_REPLACEMENT)
    .replace(/\bhttps?:\/\/[^\s<>"')\]]+/gi, PRIVATE_CHANNEL_REPLACEMENT)
    .replace(/\bwww\.[^\s<>"')\]]+/gi, PRIVATE_CHANNEL_REPLACEMENT)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, PRIVATE_CHANNEL_REPLACEMENT)
    .replace(
      /\b(?:[a-z0-9-]+\.)+(?:com|org|net|io|ai|co|jobs|careers|dev)(?:\/[^\s<>"')\]]*)?/gi,
      PRIVATE_CHANNEL_REPLACEMENT,
    )
    .replace(
      /\b(?:https?:\/\/|mailto:)(?=\[application details available after applying\])/gi,
      '',
    );

  return scrubCompanyMentions(out, company);
}
