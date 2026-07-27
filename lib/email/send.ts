// lib/email/send.ts — Email sending via Resend API
// Get free API key at resend.com (100 emails/day free)
import { logError, logWarn } from '@/lib/log';

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const FROM_EMAIL     = process.env.RESEND_FROM_EMAIL ?? 'RemoteJobs44 <hello@remotejobs44.com>';

// Resend's API accepts a request in well under a second in the normal case.
// Without an explicit deadline a hung connection keeps the whole invocation
// alive — and every caller here runs inside waitUntil() or a cron loop, so a
// stalled send would burn the function's entire time budget and take the
// remaining recipients down with it.
const REQUEST_TIMEOUT_MS = 10_000;

// Resend rate-limits by REQUESTS PER SECOND on the API key, not by daily
// volume. The broadcast fan-out fires 100 sends concurrently per chunk and
// the daily-alert cron loops without pause, so 429s are an expected steady
// state rather than an anomaly. Previously a 429 was logged and reported as
// a hard failure, silently dropping that recipient's mail. One bounded
// retry that honours Retry-After recovers those without turning a real
// outage into a long stall.
const RATE_LIMIT_RETRIES   = 2;
const RATE_LIMIT_BACKOFF_MS = 1_100;

interface SendEmailOptions {
  to:       string;
  subject:  string;
  html:     string;
  /**
   * Plain-text alternative. Optional — when omitted we derive one from the
   * HTML. Sending an HTML-only body is a well-known spam-filter penalty
   * (and leaves plain-text mail clients with an empty message), so every
   * message we send gets a multipart body whether the caller thought about
   * it or not.
   */
  text?:    string;
  replyTo?: string;
  /**
   * Extra SMTP headers. Used for List-Unsubscribe / List-Unsubscribe-Post
   * on bulk mail — see lib/email/unsubscribe.ts.
   */
  headers?: Record<string, string>;
}

/**
 * Best-effort HTML → text. Not a general-purpose converter: our templates are
 * hand-written table markup with no scripts or CSS blocks beyond inline
 * style attributes, so stripping tags and collapsing whitespace produces a
 * readable message. Anchor hrefs are kept inline so links survive.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    // The inbox-preview block is visually hidden and padded with a run of
    // zero-width joiners, so leaving it in would open every text part with
    // the preview line followed by ~30 stray "&zwnj;" artifacts.
    .replace(/<div[^>]*\bdata-preheader\b[^>]*>[\s\S]*?<\/div>/gi, '')
    // Keep the destination of every link — a text part whose links have been
    // stripped is worse than no text part at all.
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
      const text = String(label).replace(/<[^>]+>/g, '').trim();
      return text && text !== href ? `${text} (${href})` : String(href);
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    // Table-based layouts indent every cell, so each `</tr>` newline arrives
    // followed by the next row's leading whitespace. Without trimming per
    // line, the blank-run collapse below sees "\n \n \n" — lines that are not
    // empty, only spaces — and leaves the text part full of gaps.
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function sendEmail(opts: SendEmailOptions): Promise<boolean> {
  if (!RESEND_API_KEY) {
    logWarn({ event: 'email.skipped_no_key', detail: 'RESEND_API_KEY missing' });
    return false;
  }

  const payload: Record<string, unknown> = {
    from:    FROM_EMAIL,
    to:      [opts.to],
    subject: opts.subject,
    html:    opts.html,
    text:    opts.text ?? htmlToText(opts.html),
  };
  // Only include the optional keys when set. `reply_to: undefined` survives
  // JSON.stringify as an absent key today, but spelling it out keeps the
  // request body honest and avoids sending `headers: {}`.
  if (opts.replyTo) payload.reply_to = opts.replyTo;
  if (opts.headers && Object.keys(opts.headers).length > 0) payload.headers = opts.headers;

  for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt++) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (res.ok) return true;

      // 429 (rate limit) and 5xx (transient upstream) are worth one more
      // shot; 4xx of any other kind means the request itself is wrong and
      // retrying would just repeat the same rejection.
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < RATE_LIMIT_RETRIES) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 5_000)
          : RATE_LIMIT_BACKOFF_MS * (attempt + 1);
        logWarn({ event: 'email.resend_retry', status: res.status, attempt, wait_ms: waitMs });
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      const body = await res.text();
      logError({ event: 'email.resend_error', status: res.status, attempt, body });
      return false;
    } catch (err) {
      // AbortSignal.timeout rejects with a TimeoutError DOMException; a
      // network blip throws TypeError. Both are worth one retry.
      const message = (err as Error)?.message ?? String(err);
      if (attempt < RATE_LIMIT_RETRIES) {
        logWarn({ event: 'email.send_retry', attempt, error: message });
        await new Promise(r => setTimeout(r, RATE_LIMIT_BACKOFF_MS * (attempt + 1)));
        continue;
      }
      logError({ event: 'email.send_failed', error: message });
      return false;
    }
  }
  return false;
}
