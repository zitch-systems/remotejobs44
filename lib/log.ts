// lib/log.ts
//
// Structured logging — every log line is a single JSON object on one
// stdout line, so Vercel's Function Logs UI + any Log Drain consumer
// (Datadog, Logtail, Axiom, custom S3 sink) can parse it without
// fighting unstructured `console.error("msg", err)` strings.
//
// Migration pattern:
//
//   // Before
//   console.error('[webhook] payment-failed email send failed:', err);
//
//   // After
//   logError({
//     event:        'webhook.payment_failed_email',
//     error:        err.message,
//     user_id:      userId,
//   });
//
// Each emitted line has a canonical shape:
//   { ts, level, event, ...arbitraryFields }
//
// `event` is the canonical name in dot.namespace form so logs can be
// faceted/grouped in the drain UI. Avoid English sentences — those go
// in `message` if you really want a sentence.
//
// Level routing:
//   * info  → console.log    (Vercel shows green/grey)
//   * warn  → console.warn   (Vercel shows amber)
//   * error → console.error  (Vercel shows red, flags the function as
//                             having errored which surfaces in dashboards)
//
// Error reporting webhook:
//   When ERROR_REPORT_URL is set, logError() POSTs the same JSON payload
//   to that URL (fire-and-forget, never blocks the request). This is the
//   light-weight Sentry-equivalent — point it at a Discord/Slack webhook
//   or a custom collector. If you later wire @sentry/nextjs, swap the
//   reportToWebhook call below for Sentry.captureException.

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogPayload {
  /** Canonical event name in dot.namespace form. Required. */
  event: string;
  /** Optional free-text message — prefer fields over sentences. */
  message?: string;
  /** Arbitrary key/value fields. Avoid `error: <Error>` — pass
   *  `error: err.message` instead so the JSON stays serialisable. */
  [k: string]: unknown;
}

function emit(level: LogLevel, payload: LogPayload): void {
  // Avoid the JSON.stringify cost when nothing reads the output.
  // In practice we always want it — even in dev, JSON lines are easier
  // to grep — so the check is just defence against being imported in a
  // build phase where console isn't available (it always is).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj: Record<string, any> = {
    ts:    new Date().toISOString(),
    level,
    ...payload,
  };
  const line = safeStringify(obj);
  if (level === 'error')      console.error(line);
  else if (level === 'warn')  console.warn(line);
  else                        console.log(line);

  if (level === 'error') reportToWebhook(obj);
}

// Fire-and-forget POST to ERROR_REPORT_URL. The .catch absorbs every
// failure mode (DNS fail, 4xx/5xx, timeout) so a downed reporting
// endpoint never bubbles up into a request handler. Setting up:
//
//   * Discord:   create a channel webhook → ERROR_REPORT_URL = that URL.
//                Discord accepts { content: string } so set
//                ERROR_REPORT_FORMAT=discord to wrap.
//   * Slack:     same idea with Slack incoming webhooks (use
//                ERROR_REPORT_FORMAT=slack).
//   * Generic:   any endpoint that accepts the raw JSON line. Leave
//                ERROR_REPORT_FORMAT unset.
function reportToWebhook(obj: Record<string, unknown>): void {
  const url = process.env.ERROR_REPORT_URL;
  if (!url) return;
  const format = process.env.ERROR_REPORT_FORMAT;
  let body: string;
  // Trim the payload to avoid Discord's 2000-char message cap.
  const line = JSON.stringify(obj);
  const trimmed = line.length > 1800 ? line.slice(0, 1800) + '…' : line;
  if (format === 'discord') {
    body = JSON.stringify({ content: '```json\n' + trimmed + '\n```' });
  } else if (format === 'slack') {
    body = JSON.stringify({ text: '```' + trimmed + '```' });
  } else {
    body = line;
  }
  try {
    // Don't await — request handlers shouldn't hang on a slow reporter.
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(3000),
    }).catch(() => { /* swallow — reporter never breaks the request */ });
  } catch {
    // fetch can throw synchronously in some edge environments; same policy.
  }
}

// Defensive stringify so a circular field in the payload can't crash a
// request handler. Falls back to a marker string per cyclic key.
function safeStringify(obj: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(obj, (_k, v) => {
      if (v && typeof v === 'object') {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      // Errors aren't JSON-serialisable by default — surface message.
      if (v instanceof Error) return { name: v.name, message: v.message };
      return v;
    });
  } catch {
    return JSON.stringify({ ts: new Date().toISOString(), level: 'error', event: 'log.stringify_failed' });
  }
}

export function logInfo(payload: LogPayload):  void { emit('info',  payload); }
export function logWarn(payload: LogPayload):  void { emit('warn',  payload); }
export function logError(payload: LogPayload): void { emit('error', payload); }

/** Single function form for callers that want to compute level dynamically. */
export function logEvent(level: LogLevel, payload: LogPayload): void {
  emit(level, payload);
}
