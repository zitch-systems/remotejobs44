// lib/source-trust.ts
//
// Honest source-trust badge for each job. Three tiers:
//
//   * verified     — straight from the employer's ATS (greenhouse, lever,
//                    ashby, workable). The most trustworthy signal we have
//                    short of a manual review, because the ATS only lets
//                    the company itself publish through it.
//   * aggregator   — re-published via a third-party board (remotive,
//                    jobicy, remoteok, arbeitnow, findwork, serpapi). Still
//                    typically legit, but the original employer might not
//                    have set the listing live themselves.
//   * unverified   — scrape / rss / manual / custom feeds. Treat with the
//                    same care you'd treat a Craigslist post.
//
// Two reasons to surface this at all:
//   1. Trust signal — the audit flagged the absence of any verification UI
//      as a top reputational risk for a Paystack-billed platform.
//   2. Honest expectations — we DON'T do per-company verification, and
//      claiming "Verified Employer" would be a lie. "Verified ATS" is
//      directionally accurate: the publishing channel is verified, not
//      the company.

export type SourceTrust = 'verified' | 'aggregator' | 'unverified';

const VERIFIED_ATS  = new Set(['greenhouse', 'lever', 'ashby', 'workable']);
const AGGREGATORS   = new Set([
  'remotive', 'jobicy', 'remoteok', 'arbeitnow',
  'findwork', 'serpapi', 'api',
]);

export function getSourceTrust(source: string | null | undefined): SourceTrust {
  if (!source) return 'unverified';
  const s = source.toLowerCase();
  if (VERIFIED_ATS.has(s)) return 'verified';
  if (AGGREGATORS.has(s))  return 'aggregator';
  return 'unverified';
}

export interface SourceTrustDisplay {
  label:    string;
  tooltip:  string;
  tone:     'green' | 'blue' | 'stone';
}

export function describeSourceTrust(trust: SourceTrust): SourceTrustDisplay {
  switch (trust) {
    case 'verified':
      return {
        label:   'Verified ATS',
        tooltip: 'Published directly through the employer\'s applicant tracking system (Greenhouse, Lever, Ashby or Workable).',
        tone:    'green',
      };
    case 'aggregator':
      return {
        label:   'Aggregator',
        tooltip: 'Re-published from a third-party remote-jobs board. The original employer didn\'t list it on RemoteJobs44 directly.',
        tone:    'blue',
      };
    case 'unverified':
      return {
        label:   'Unverified',
        tooltip: 'Source not independently verified. Confirm the employer and apply link before submitting personal info.',
        tone:    'stone',
      };
  }
}
