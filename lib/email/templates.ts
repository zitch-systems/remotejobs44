// lib/email/templates.ts — Email HTML templates
//
// Design constraints these templates are built against:
//
//   * Outlook (Windows) renders through Word, which ignores `max-width`,
//     `margin:auto`, flexbox, and padding on inline elements. Layout is
//     therefore tables + `align="center"`, buttons put their padding on the
//     `<td>`, and an MSO conditional pins the fixed 560px width.
//   * Gmail strips `<head>` styles in some contexts, so every rule that
//     matters is inline. The `<style>` block only carries the mobile
//     media query and progressive niceties — nothing load-bearing.
//   * Word resets `font-family` on table cells, so the stack is repeated on
//     every cell that holds copy rather than set once on <body>.
//   * Dark-mode clients auto-invert unlabelled light backgrounds, which
//     turns dark ink on a white card into dark-on-dark. Declaring
//     color-scheme lets Apple Mail / Outlook.com skip the forced inversion.

// Normalize once at module load. A trailing slash on NEXT_PUBLIC_APP_URL
// would produce `https://remotejobs44.com//logo-white.png` after our
// `${APP_URL}/path` interpolation — most clients tolerate but Outlook
// mangles. Strip it here so all template strings just concat safely.
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://remotejobs44.com').replace(/\/+$/, '');

// Repeated on every cell that holds copy — see the Word note above.
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const C = {
  blue:     '#2563eb',
  blueSoft: '#bfdbfe', // legible on the blue band; rgba() is ignored by Word
  blueInk:  '#1d4ed8',
  blueTint: '#eff6ff',
  red:      '#dc2626',
  redSoft:  '#fecaca',
  ink:      '#1c1917',
  body:     '#57534e',
  // #a8a29e (stone-400) sits at 2.5:1 on white — under the 4.5:1 WCAG AA
  // floor for the 12-13px footer copy it was used for. stone-500 clears it
  // at 4.6:1 without changing the visual register.
  muted:    '#78716c',
  hairline: '#e7e5e4',
  canvas:   '#f5f5f4',
  panel:    '#fafaf9',
  card:     '#ffffff',
} as const;

const ACCENT = {
  blue: { bg: C.blue, soft: C.blueSoft },
  red:  { bg: C.red,  soft: C.redSoft  },
} as const;

// HTML-escape every user-/ATS-supplied value before splicing into a
// template string. Two attacker paths motivate this:
//   1. profile.name is user-controlled and lands in welcome / payment /
//      alert emails — `<script>` or `<img onerror=…>` would render raw.
//   2. jobs.title / jobs.company come from external ATS feeds and can
//      contain HTML. Inline through the alert template they'd reach
//      every Pro subscriber's inbox.
// Gmail/Outlook strip <script>, but inline-event handlers, phishing
// markup, and homograph attacks still slip past — escape unconditionally.
function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Subject lines are header values, not markup — escaping them would render a
 * "Pro & Team" plan as the literal "Pro &amp; Team" in the recipient's inbox
 * list. Strip tags and control characters from the raw value instead, which
 * is the actual concern for a header, and cap the length so one ATS feed with
 * a 300-character job title can't push the useful part out of the preview.
 */
function subjectSafe(s: unknown, max = 70): string {
  const flat = String(s ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/**
 * The inbox preview line. Without one, Gmail/Apple Mail scrape the first
 * visible text — which for every template here was the logo alt and the
 * "Your global remote career starts here" tagline, i.e. the same string on
 * every message we send.
 *
 * Padded with zero-width joiners so the client can't pull body copy in after
 * the intended text. `data-preheader` marks the block for htmlToText() in
 * ./send.ts, which strips it so the padding never reaches the text part.
 */
function preheader(text: string): string {
  if (!text) return '';
  return `<div data-preheader="1" style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.canvas};opacity:0;">${escapeHtml(text)}${'&#847;&zwnj;&nbsp;'.repeat(30)}</div>`;
}

/**
 * Padding lives on the <td>, not the <a>: Word drops padding from inline
 * elements, which collapsed the old `display:inline-block` anchors into bare
 * blue text with no button shape at all in Outlook.
 */
function button(href: string, label: string, bg: string = C.blue): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="rj-btn"><tr>
        <td align="center" bgcolor="${bg}" style="border-radius:8px;padding:14px 28px;">
          <a href="${href}" style="font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;display:inline-block;line-height:1.2;">${label}</a>
        </td>
      </tr></table>`;
}

interface ShellOptions {
  /** <title> and the accessible document name. Plain text. */
  title: string;
  /** Inbox preview line. Plain text. */
  preview: string;
  accent?: keyof typeof ACCENT;
  /** Small line under the wordmark, e.g. "Job alert". Pre-escaped HTML. */
  eyebrow?: string | null;
  /** Card contents. Pre-escaped HTML. */
  body: string;
  /** Fine print below the card. Pre-escaped HTML. */
  footer?: string;
}

function shell(o: ShellOptions): string {
  const accent = ACCENT[o.accent ?? 'blue'];
  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(o.title)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  @media only screen and (max-width:600px) {
    .rj-pad { padding-left:24px !important; padding-right:24px !important; }
    .rj-body { padding-top:28px !important; padding-bottom:28px !important; }
    .rj-btn, .rj-btn td { width:100% !important; }
    .rj-btn a { display:block !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.canvas};">
${preheader(o.preview)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.canvas};">
  <tr>
    <td align="center" style="padding:32px 12px 40px;">
      <!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${C.card};border:1px solid ${C.hairline};border-radius:12px;overflow:hidden;">
        <tr>
          <td class="rj-pad" style="background:${accent.bg};padding:28px 40px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="padding:0 12px 0 0;vertical-align:middle;line-height:1;">
                <img src="${APP_URL}/logo-white.png" alt="" width="36" height="36" style="display:block;border-radius:8px;">
              </td>
              <td style="vertical-align:middle;font-family:${FONT};">
                <span style="color:#ffffff;font-size:21px;font-weight:700;letter-spacing:-0.2px;line-height:1;">RemoteJobs44</span>
              </td>
            </tr></table>${o.eyebrow ? `
            <div style="margin:10px 0 0;font-family:${FONT};font-size:13px;line-height:1.4;color:${accent.soft};">${o.eyebrow}</div>` : ''}
          </td>
        </tr>
        <tr>
          <td class="rj-pad rj-body" style="padding:40px;font-family:${FONT};">
${o.body}
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <tr>
          <td class="rj-pad" style="padding:20px 40px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted};">
${o.footer ?? ''}
            <div style="margin-top:10px;">
              <a href="${APP_URL}" style="color:${C.muted};text-decoration:underline;">RemoteJobs44</a> — remote jobs, worldwide.
            </div>
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body></html>`;
}

export function welcomeEmail(name: string) {
  const safeName = escapeHtml(name);
  return {
    subject: 'Welcome to RemoteJobs44 🌍',
    html: shell({
      title: 'Welcome to RemoteJobs44',
      preview: '70,000+ remote jobs in one place — here’s how to get started.',
      eyebrow: 'Your global remote career starts here',
      body: `
            <h1 style="margin:0 0 14px;color:${C.ink};font-size:22px;line-height:1.3;font-weight:700;">Welcome, ${safeName}! 👋</h1>
            <p style="margin:0 0 24px;color:${C.body};font-size:15px;line-height:1.65;">You’re now part of RemoteJobs44 — your platform for finding the best remote jobs worldwide.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.blueTint};border-radius:10px;margin:0 0 28px;">
              <tr><td style="padding:20px 22px;font-family:${FONT};">
                <div style="margin:0 0 10px;color:${C.blue};font-weight:700;font-size:13px;letter-spacing:0.4px;text-transform:uppercase;">What you can do for free</div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${['Browse 70,000+ remote jobs', 'Save your favourite listings', 'Explore company profiles'].map(item => `                  <tr>
                    <td width="22" style="padding:5px 0;font-family:${FONT};font-size:14px;line-height:1.5;color:${C.blue};vertical-align:top;">&#10003;</td>
                    <td style="padding:5px 0;font-family:${FONT};font-size:14px;line-height:1.5;color:${C.blueInk};">${item}</td>
                  </tr>`).join('\n')}
                </table>
              </td></tr>
            </table>
            ${button(`${APP_URL}/jobs`, 'Browse jobs →')}`,
      footer: `<div>Follow us for daily job drops: <a href="https://instagram.com/remotejobs_44" style="color:${C.muted};text-decoration:underline;">@remotejobs_44 on Instagram</a></div>`,
    }),
  };
}

export function paymentSuccessEmail(name: string, plan: string, amount: string) {
  const planLabel = plan === 'daily' ? 'Day Pass' : plan === 'pro_annual' ? 'Pro Annual' : 'Pro Monthly';
  const safeName   = escapeHtml(name);
  const safeAmount = escapeHtml(amount);

  // The receipt rows were `display:flex; justify-content:space-between`,
  // which Word ignores outright — Outlook rendered the label and value as
  // two runs of text jammed together on one line. A two-column table row
  // with an aligned value cell is the portable equivalent.
  const row = (label: string, value: string, last = false) => `
                  <tr>
                    <td style="padding:10px 0;${last ? '' : `border-bottom:1px solid ${C.hairline};`}font-family:${FONT};font-size:14px;color:${C.muted};">${label}</td>
                    <td align="right" style="padding:10px 0;${last ? '' : `border-bottom:1px solid ${C.hairline};`}font-family:${FONT};font-size:14px;font-weight:600;color:${C.ink};">${value}</td>
                  </tr>`;

  return {
    subject: `Payment confirmed — ${planLabel} ✅`,
    html: shell({
      title: 'Payment confirmed',
      preview: `Your ${planLabel} is active. Here’s your receipt.`,
      eyebrow: 'Receipt',
      body: `
            <div style="text-align:center;margin:0 0 28px;">
              <div style="font-size:44px;line-height:1;">✅</div>
              <h1 style="margin:14px 0 6px;color:${C.ink};font-size:22px;line-height:1.3;font-weight:700;">Payment confirmed</h1>
              <p style="margin:0;color:${C.body};font-size:15px;line-height:1.6;">Thank you, ${safeName} — your plan is active.</p>
            </div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.panel};border:1px solid ${C.hairline};border-radius:10px;margin:0 0 28px;">
              <tr><td style="padding:6px 22px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${row('Plan', planLabel)}
${row('Amount', safeAmount, true)}
                </table>
              </td></tr>
            </table>
            ${button(`${APP_URL}/dashboard`, 'Go to dashboard →')}`,
      footer: `<div>Need help with this payment? <a href="${APP_URL}/contact" style="color:${C.muted};text-decoration:underline;">Contact us</a>.</div>`,
    }),
  };
}

export function paymentFailedEmail(name: string, planLabel: string) {
  const safeName  = escapeHtml(name);
  const safeLabel = escapeHtml(planLabel);
  return {
    subject: `Action needed: your ${subjectSafe(planLabel, 40)} renewal didn’t go through`,
    html: shell({
      title: 'Payment didn’t go through',
      preview: 'Update your payment method to keep your access uninterrupted.',
      accent: 'red',
      eyebrow: 'Payment didn’t go through',
      body: `
            <h1 style="margin:0 0 14px;color:${C.ink};font-size:22px;line-height:1.3;font-weight:700;">Hi ${safeName},</h1>
            <p style="margin:0 0 16px;color:${C.body};font-size:15px;line-height:1.65;">
              Your scheduled payment for <strong style="color:${C.ink};">${safeLabel}</strong> couldn’t be processed. This is usually a card-expiry, insufficient-funds, or bank-decline issue.
            </p>
            <p style="margin:0 0 28px;color:${C.body};font-size:15px;line-height:1.65;">
              Paystack will retry automatically for a few days. To keep your access uninterrupted, please update your payment method now:
            </p>
            ${button(`${APP_URL}/profile/billing`, 'Update payment method →')}`,
      footer: `<div>If you no longer want to renew, no action is needed — your plan will downgrade to Free after the current period ends. Need help? <a href="${APP_URL}/contact" style="color:${C.muted};text-decoration:underline;">Contact us</a>.</div>`,
    }),
  };
}

export function jobAlertEmail(
  name: string,
  jobs: Array<{ title: string; company: string; location: string; id: string }>,
  // Signed one-click link from lib/email/unsubscribe.ts. Null when no signing
  // key is configured, in which case we fall back to the (login-gated)
  // /profile link rather than printing a URL that would 400.
  unsubscribeLink?: string | null,
) {
  // Each value is ATS-supplied (title / company / location) or
  // user-supplied (name) — they MUST be escaped before splicing into
  // the HTML template. j.id is treated as URL-safe since it's UUID-
  // validated upstream but we still escape it as defense-in-depth.
  const safeName = escapeHtml(name);
  const total    = jobs.length;

  // The old template sliced to 5 while the subject and lead line both quoted
  // the full match count, so a 10-match alert advertised ten jobs and showed
  // five with nothing to explain the gap. Show six and account for the rest.
  const SHOWN  = 6;
  const shown  = jobs.slice(0, SHOWN);
  const hidden = Math.max(0, total - shown.length);

  const jobCards = shown.map(j => `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.panel};border:1px solid ${C.hairline};border-radius:10px;margin:0 0 10px;">
              <tr><td style="padding:14px 16px;font-family:${FONT};">
                <a href="${APP_URL}/jobs/${encodeURIComponent(j.id)}" style="color:${C.ink};font-size:15px;font-weight:700;line-height:1.35;text-decoration:none;">${escapeHtml(j.title)}</a>
                <div style="margin-top:4px;color:${C.muted};font-size:13px;line-height:1.45;">${escapeHtml(j.company)} · ${escapeHtml(j.location)}</div>
              </td></tr>
            </table>`).join('');

  // Lead with the strongest match instead of a count. "5 new remote jobs
  // matching your interests" is the same subject every day and reads as
  // batch mail; the role title is the thing that earns the open. Also fixes
  // the "1 new remote jobs" plural bug the count-only subject had.
  const topTitle = subjectSafe(shown[0]?.title ?? '');
  const subject =
    total === 0 || !topTitle ? 'New remote jobs matching your alert'
    : total === 1            ? `New remote job: ${topTitle}`
    : `${topTitle} + ${total - 1} more remote job${total - 1 === 1 ? '' : 's'}`;

  const lead = total === 1
    ? 'A new remote job was posted that matches your alert:'
    : `${total} new remote jobs were posted that match your alert:`;

  return {
    subject,
    html: shell({
      title: 'New remote jobs for you',
      preview: shown.slice(0, 3).map(j => subjectSafe(j.title, 44)).filter(Boolean).join(' · ')
        || 'New remote jobs matching your alert.',
      eyebrow: 'Job alert',
      body: `
            <h1 style="margin:0 0 8px;color:${C.ink};font-size:22px;line-height:1.3;font-weight:700;">Hi ${safeName},</h1>
            <p style="margin:0 0 22px;color:${C.body};font-size:15px;line-height:1.6;">${lead}</p>
${jobCards}${hidden > 0 ? `
            <p style="margin:14px 0 0;color:${C.muted};font-size:13px;line-height:1.5;">…and ${hidden} more match${hidden === 1 ? '' : 'es'} waiting for you.</p>` : ''}
            <div style="margin:28px 0 0;">
              ${button(`${APP_URL}/jobs`, hidden > 0 ? `View all ${total} matches →` : 'View all jobs →')}
            </div>`,
      footer: `<div>You’re receiving this because you have job alerts enabled. <a href="${APP_URL}/profile" style="color:${C.muted};text-decoration:underline;">Manage alerts</a>${
        unsubscribeLink
          ? ` · <a href="${escapeHtml(unsubscribeLink)}" style="color:${C.muted};text-decoration:underline;">Unsubscribe</a>`
          : ''
      }</div>`,
    }),
  };
}

/**
 * Admin 2FA code. Lived inline in app/api/admin/2fa/send/route.ts as an
 * unstyled <div> — the one message where "is this really from us?" matters
 * most was the one with no branding to check against.
 *
 * The code stays OUT of the subject and out of the preheader: both render on
 * a locked phone and get retained in mail-server logs and search indexes.
 */
export function adminLoginCodeEmail(code: string, ttlMinutes = 10) {
  const safeCode = escapeHtml(code);
  return {
    subject: 'RemoteJobs44 admin login code',
    html: shell({
      title: 'Admin login code',
      preview: 'Finish signing in to the RemoteJobs44 admin area.',
      eyebrow: 'Admin sign-in',
      body: `
            <h1 style="margin:0 0 14px;color:${C.ink};font-size:22px;line-height:1.3;font-weight:700;">Your login code</h1>
            <p style="margin:0 0 24px;color:${C.body};font-size:15px;line-height:1.65;">Use this code to finish signing in to the admin area. It expires in ${ttlMinutes} minutes.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.blueTint};border:1px solid ${C.blueSoft};border-radius:10px;margin:0 0 24px;">
              <tr><td align="center" style="padding:24px 16px;font-family:${FONT};font-size:34px;font-weight:800;letter-spacing:10px;color:${C.blueInk};line-height:1.1;">${safeCode}</td></tr>
            </table>
            <p style="margin:0;color:${C.body};font-size:14px;line-height:1.6;">If you didn’t try to sign in, ignore this email and consider changing the admin password.</p>`,
      footer: '<div>This is an automated security message — nobody from RemoteJobs44 will ever ask you for this code.</div>',
    }),
  };
}

/**
 * Contact-form relay to the site owner. Also previously an inline unstyled
 * <div>, on a different palette (slate) from every other message we send.
 *
 * Every field here is submitter-controlled and public — escape, always.
 */
export function contactMessageEmail(input: {
  name: string;
  email: string;
  subject?: string;
  message: string;
}) {
  const safeName    = escapeHtml(input.name);
  const safeEmail   = escapeHtml(input.email);
  const safeSubject = escapeHtml(input.subject?.trim() || 'New contact form message');
  const safeMessage = escapeHtml(input.message);

  const row = (label: string, value: string) => `
                  <tr>
                    <td width="88" style="padding:8px 0;font-family:${FONT};font-size:13px;color:${C.muted};vertical-align:top;">${label}</td>
                    <td style="padding:8px 0;font-family:${FONT};font-size:14px;color:${C.ink};vertical-align:top;">${value}</td>
                  </tr>`;

  return {
    subject: `[Contact] ${subjectSafe(input.subject?.trim() || 'New contact form message', 80)} — from ${subjectSafe(input.name, 60)}`,
    html: shell({
      title: 'New contact message',
      preview: `${subjectSafe(input.name, 40)}: ${subjectSafe(input.message, 90)}`,
      eyebrow: 'Contact form',
      body: `
            <h1 style="margin:0 0 20px;color:${C.ink};font-size:22px;line-height:1.3;font-weight:700;">New contact message</h1>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.panel};border:1px solid ${C.hairline};border-radius:10px;margin:0 0 24px;">
              <tr><td style="padding:8px 20px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${row('From', safeName)}
${row('Email', `<a href="mailto:${safeEmail}" style="color:${C.blue};text-decoration:underline;">${safeEmail}</a>`)}
${row('Subject', safeSubject)}
                </table>
              </td></tr>
            </table>
            <div style="margin:0 0 8px;color:${C.muted};font-size:13px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;">Message</div>
            <p style="margin:0;color:${C.body};font-size:15px;line-height:1.7;white-space:pre-wrap;">${safeMessage}</p>`,
      footer: `<div>Reply directly to this email to respond to ${safeName}.</div>`,
    }),
  };
}
