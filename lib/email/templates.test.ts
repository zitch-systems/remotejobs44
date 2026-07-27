import { describe, it, expect } from 'vitest';
import {
  welcomeEmail,
  paymentSuccessEmail,
  paymentFailedEmail,
  jobAlertEmail,
  adminLoginCodeEmail,
  contactMessageEmail,
} from './templates';
import { htmlToText } from './send';

const JOBS = Array.from({ length: 10 }, (_, i) => ({
  id:       `job-${i}`,
  title:    `Role ${i}`,
  company:  `Company ${i}`,
  location: 'Remote',
}));

const ALL = () => [
  welcomeEmail('Ada'),
  paymentSuccessEmail('Ada', 'pro_annual', '₦25,000'),
  paymentFailedEmail('Ada', 'Pro Monthly'),
  jobAlertEmail('Ada', JOBS, 'https://remotejobs44.com/api/email/unsubscribe?u=1&t=job_alerts&s=x'),
  adminLoginCodeEmail('418293'),
  contactMessageEmail({ name: 'Grace', email: 'g@example.com', subject: 'Hi', message: 'Hello' }),
];

// Word (the Outlook rendering engine) supports none of these. Each one shipped
// in a template at some point and silently degraded: the receipt rows were
// `display:flex; justify-content:space-between`, which Outlook collapsed into
// two runs of text with no alignment at all.
describe('Outlook-safe markup', () => {
  it('uses no flexbox, grid, or float positioning', () => {
    for (const { html } of ALL()) {
      expect(html).not.toMatch(/display\s*:\s*(flex|grid|inline-flex)/i);
      expect(html).not.toMatch(/justify-content|align-items|flex-direction/i);
    }
  });

  it('pins the body width for Word, which ignores max-width', () => {
    for (const { html } of ALL()) {
      expect(html).toContain('<!--[if mso]>');
      expect(html).toContain('width="560"');
    }
  });

  it('puts button padding on the <td>, not the inline <a>', () => {
    // Word drops padding from inline elements — padding on the anchor alone
    // rendered the CTA as bare blue text with no button shape.
    const { html } = welcomeEmail('Ada');
    expect(html).toMatch(/<td align="center" bgcolor="#2563eb" style="border-radius:8px;padding:14px 28px;">/);
  });

  it('repeats the font stack on copy cells, since Word resets it per cell', () => {
    for (const { html } of ALL()) {
      expect((html.match(/font-family:-apple-system/g) ?? []).length).toBeGreaterThan(2);
    }
  });
});

describe('accessibility and client hints', () => {
  it('declares a viewport and colour scheme on every message', () => {
    for (const { html } of ALL()) {
      expect(html).toContain('name="viewport"');
      expect(html).toContain('name="color-scheme"');
      expect(html).toContain('name="supported-color-schemes"');
    }
  });

  it('marks layout tables as presentational', () => {
    for (const { html } of ALL()) {
      // Every <table> is layout, not data — unmarked ones get announced as
      // data tables with meaningless row/column counts.
      const tables = html.match(/<table\b/g) ?? [];
      const marked = html.match(/<table role="presentation"/g) ?? [];
      expect(tables.length).toBeGreaterThan(1);
      expect(marked.length).toBe(tables.length);
    }
  });

  it('does not use stone-400 for body or footer copy', () => {
    // #a8a29e on white is 2.5:1 — under the 4.5:1 WCAG AA floor, and it was
    // the colour of the unsubscribe link.
    for (const { html } of ALL()) {
      expect(html.toLowerCase()).not.toContain('#a8a29e');
    }
  });

  it('gives every message exactly one <h1>', () => {
    for (const { html } of ALL()) {
      expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
    }
  });
});

describe('preheader', () => {
  it('sets a distinct inbox preview line per template', () => {
    const previews = ALL().map(({ html }) => html.match(/data-preheader="1"[^>]*>([^&<]*)/)?.[1]);
    expect(previews.every(Boolean)).toBe(true);
    expect(new Set(previews).size).toBe(previews.length);
  });

  it('is stripped from the plain-text part along with its padding', () => {
    for (const { html } of ALL()) {
      const text = htmlToText(html);
      expect(text).not.toContain('zwnj');
      expect(text).not.toContain('&#847;');
    }
  });

  it('keeps the admin 2FA code out of both the subject and the preview', () => {
    // Subjects and preview lines render on a locked phone and are retained in
    // mail-server logs — a second factor visible there is not a second factor.
    const { subject, html } = adminLoginCodeEmail('418293');
    const preview = html.match(/data-preheader="1"[^>]*>([^&<]*)/)?.[1] ?? '';
    expect(subject).not.toContain('418293');
    expect(preview).not.toContain('418293');
    expect(html).toContain('418293'); // but it is in the body
  });
});

describe('jobAlertEmail', () => {
  it('leads the subject with the top role rather than a bare count', () => {
    const { subject } = jobAlertEmail('Ada', JOBS, null);
    expect(subject).toBe('Role 0 + 9 more remote jobs');
  });

  it('is grammatical for a single match', () => {
    // The count-only subject produced "1 new remote jobs matching your
    // interests" for every single-match alert.
    const { subject, html } = jobAlertEmail('Ada', JOBS.slice(0, 1), null);
    expect(subject).toBe('New remote job: Role 0');
    expect(htmlToText(html)).toContain('A new remote job was posted');
    expect(html).not.toContain('1 new remote jobs');
  });

  it('says "+ 1 more" without a stray plural at two matches', () => {
    expect(jobAlertEmail('Ada', JOBS.slice(0, 2), null).subject).toBe('Role 0 + 1 more remote job');
  });

  it('accounts for matches beyond the ones it lists', () => {
    // The old template quoted the full count in the lead line but sliced the
    // list to five, so a ten-match alert showed five with nothing to explain
    // the gap.
    const { html } = jobAlertEmail('Ada', JOBS, null);
    const text = htmlToText(html);
    expect(text).toContain('10 new remote jobs were posted');
    expect(text).toContain('…and 4 more matches waiting for you.');
    expect(text).toContain('View all 10 matches');
    expect(html).toContain('Role 5');
    expect(html).not.toContain('Role 6');
  });

  it('drops the "more" line when everything fits', () => {
    const { html } = jobAlertEmail('Ada', JOBS.slice(0, 3), null);
    expect(html).not.toContain('more matches waiting');
    expect(html).toContain('View all jobs');
  });

  it('truncates a runaway ATS title instead of flooding the subject', () => {
    const long = [{ ...JOBS[0], title: 'A'.repeat(300) }];
    expect(jobAlertEmail('Ada', long, null).subject.length).toBeLessThan(100);
  });

  it('renders the unsubscribe link only when one is signed', () => {
    expect(jobAlertEmail('Ada', JOBS, 'https://x.test/u')).toHaveProperty('html', expect.stringContaining('Unsubscribe'));
    expect(jobAlertEmail('Ada', JOBS, null).html).not.toContain('Unsubscribe');
  });
});

describe('escaping', () => {
  const XSS = '<img src=x onerror=alert(1)>';

  it('escapes user- and ATS-supplied values in the body', () => {
    const bodies = [
      welcomeEmail(XSS).html,
      paymentSuccessEmail(XSS, 'daily', XSS).html,
      paymentFailedEmail(XSS, XSS).html,
      jobAlertEmail(XSS, [{ id: 'a', title: XSS, company: XSS, location: XSS }], null).html,
      contactMessageEmail({ name: XSS, email: XSS, subject: XSS, message: XSS }).html,
    ];
    for (const html of bodies) {
      expect(html).not.toContain('onerror=alert(1)>');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    }
  });

  it('strips tags from subjects without entity-escaping them', () => {
    // A subject is a header value, not markup: escaping would render a
    // "Pro & Team" plan as the literal "Pro &amp; Team" in the inbox list.
    expect(paymentFailedEmail('Ada', 'Pro & Team').subject).toContain('Pro & Team');
    expect(paymentFailedEmail('Ada', 'Pro & Team').subject).not.toContain('&amp;');
    expect(paymentFailedEmail('Ada', '<b>Pro</b>').subject).toBe(
      'Action needed: your Pro renewal didn’t go through',
    );
  });

  it('keeps newlines out of subject lines', () => {
    const { subject } = contactMessageEmail({
      name: 'Bad\r\nBcc: victim@example.com',
      email: 'a@b.co',
      subject: 'Hi\nthere',
      message: 'x',
    });
    expect(subject).not.toMatch(/[\r\n]/);
  });
});

describe('paymentSuccessEmail', () => {
  it('labels the plan from the tier code', () => {
    expect(paymentSuccessEmail('A', 'daily', '₦500').subject).toContain('Day Pass');
    expect(paymentSuccessEmail('A', 'pro_annual', '₦25,000').subject).toContain('Pro Annual');
    expect(paymentSuccessEmail('A', 'pro', '₦2,500').subject).toContain('Pro Monthly');
  });

  it('right-aligns receipt values in a real table cell', () => {
    const { html } = paymentSuccessEmail('Ada', 'pro_annual', '₦25,000');
    expect(html).toMatch(/<td align="right"[^>]*>Pro Annual<\/td>/);
    expect(html).toMatch(/<td align="right"[^>]*>₦25,000<\/td>/);
  });
});
