// lib/scam-detect.ts
// First-pass scam screen for jobs being ingested.
//
// Goal: catch the most obvious scam patterns BEFORE they reach the public
// /jobs feed. Heuristic, not perfect — we mark suspicious rows `flagged`
// in the DB so an admin can sweep them at /admin/jobs. False positives
// are recoverable (admin clears the flag); false negatives are the real
// risk we're guarding against ("I paid for Pro and the jobs are scams"
// → reputational death for a Paystack-billing platform).
//
// Patterns covered (priority-ordered):
//   1. Apply instructions naming Telegram, WhatsApp, Signal, CashApp,
//      Venmo, Zelle, BTC/ETH/crypto wallets — all hallmarks of advance-
//      fee / fake-recruiter fraud.
//   2. MLM marker phrases (downline, recruit team, your own business,
//      earn passive income, get paid daily).
//   3. apply_email on a free webmail domain (gmail/yahoo/outlook/proton)
//      — legit small employers do use these, so this alone only
//      contributes; we need at least one other signal to flag.
//   4. "No experience required" + impossible pay (e.g. >$10k/week claim).
//   5. Salary sanity bounds: > $1M/yr or > $5000/hour without context.
//
// Returns null when clean, or {flagged_reason} when suspicious. The
// reason string is `<class>:<detail>` so /admin/jobs can group it.

export interface ScamCheckInput {
  title?: string | null;
  description?: string | null;
  apply_url?: string | null;
  apply_email?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  company?: string | null;
}

const FREE_WEBMAIL = /@(gmail|googlemail|yahoo|hotmail|outlook|live|aol|protonmail|proton\.me|icloud|mail\.ru|yandex)\.[a-z.]{2,8}$/i;

const APPLY_VIA_OFF_PLATFORM = [
  /\btelegram\s*(?:me|@|chat|channel|group)?/i,
  /\bt\.me\/[a-z0-9_]+/i,
  /\bwhats?app(?:\s*me|\s*\+?\d|\.com\/\+?\d)/i,
  /\bsignal\s*(?:me|@|chat)/i,
  /\bcash\s*app\b/i,
  /\bzelle\b/i,
  /\bvenmo\b/i,
  /\bbtc\s*(?:wallet|address)/i,
  /\beth(ereum)?\s*(?:wallet|address)/i,
  /\bcrypto\s*(?:wallet|payment)/i,
];

const MLM_MARKERS = [
  /\bdownline\b/i,
  /\brecruit(?:ing)?\s+(?:your|a)\s+team\b/i,
  /\bbe\s+your\s+own\s+boss\b/i,
  /\bunlimited\s+earning\s+potential\b/i,
  /\bget\s+paid\s+daily\b/i,
  /\bpassive\s+income\b/i,
  /\bmulti-?level\s+marketing\b/i,
  /\bteam\s+builder\b/i,
];

const TOO_GOOD_PAY = [
  /\bearn\s*\$?\d{4,}\s*(?:per|\/|a)\s*(?:day|week)\b/i,
  /\$\d{3,}\s*\/?\s*hour\b/i, // "$500/hour"
  /\bno\s+experience\s+(?:required|needed)\b.*\$\d{3,}/i,
  /\$\d{3,}.*\bno\s+experience\b/i,
];

const SALARY_CEILING_USD_YEAR  = 1_500_000; // not impossible for tech execs but suspicious if title doesn't match
const SALARY_CEILING_USD_HOUR  = 2_000;     // anything beyond is almost certainly fake

export function detectScam(job: ScamCheckInput): { flagged: true; flagged_reason: string } | null {
  const reasons: string[] = [];
  const haystack = `${job.title ?? ''}\n${job.description ?? ''}`.toLowerCase();

  // 1. Off-platform apply instructions — strong signal. Single hit flags.
  for (const re of APPLY_VIA_OFF_PLATFORM) {
    const m = re.exec(haystack);
    if (m) {
      const tag = (m[0] ?? '').replace(/\W+/g, '_').slice(0, 30);
      return { flagged: true, flagged_reason: `apply_off_platform:${tag}` };
    }
  }

  // 2. MLM markers — strong signal. Single hit flags.
  for (const re of MLM_MARKERS) {
    const m = re.exec(haystack);
    if (m) {
      return { flagged: true, flagged_reason: `mlm_marker:${(m[0] ?? '').replace(/\W+/g, '_').slice(0, 30)}` };
    }
  }

  // 3. Too-good pay claims combined with "no experience" — strong signal.
  for (const re of TOO_GOOD_PAY) {
    if (re.test(haystack)) {
      return { flagged: true, flagged_reason: 'too_good_pay' };
    }
  }

  // 4. Salary sanity bounds.
  if (typeof job.salary_max === 'number') {
    if (job.salary_max > SALARY_CEILING_USD_YEAR) reasons.push('salary_max_implausible');
  }
  if (typeof job.salary_min === 'number') {
    if (job.salary_min > SALARY_CEILING_USD_HOUR && job.salary_min < SALARY_CEILING_USD_YEAR) {
      // Looks like an hourly value way too high (we don't know the unit
      // for sure — flagged for review, not auto-rejected).
      reasons.push('salary_hourly_suspicious');
    }
  }

  // 5. Free-webmail apply_email is a soft signal — only flag when paired
  // with something else (eg. an extra reason from above, OR no apply_url
  // at all, which suggests an email-only contact from a non-corporate
  // address).
  const webmail = job.apply_email && FREE_WEBMAIL.test(job.apply_email);
  if (webmail) {
    if (!job.apply_url || reasons.length > 0) {
      reasons.push('webmail_apply_email');
    }
  }

  if (reasons.length === 0) return null;
  return { flagged: true, flagged_reason: reasons.join(',') };
}
