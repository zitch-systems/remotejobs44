// src/lib/sentry.ts — crash/error reporting (no-op until a DSN is configured).
//
// Set EXPO_PUBLIC_SENTRY_DSN to enable. Sentry.init installs global JS error +
// unhandled-rejection handlers; native crash capture + source maps additionally
// need the '@sentry/react-native/expo' config plugin in app.json with your
// org/project (and SENTRY_AUTH_TOKEN at build time) — documented in README.
import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initSentry(): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    tracesSampleRate: 0.2,
    sendDefaultPii: false,
  });
}

/** Report a handled error (no-op without a DSN; warns in dev). */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (dsn) {
    Sentry.captureException(err, context ? { extra: context } : undefined);
  } else if (__DEV__) {
    console.warn('[captureError]', err, context ?? '');
  }
}

// Routing/touch instrumentation HOC for the root layout (no-op without a DSN).
export const withSentry = Sentry.wrap;
