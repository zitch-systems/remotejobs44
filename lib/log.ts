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
// Sentry integration is a no-op today (no SDK installed, no DSN). When
// @sentry/nextjs is wired up later, the `level === 'error'` branch in
// emit() is the right hook point — add Sentry.captureException there.

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
