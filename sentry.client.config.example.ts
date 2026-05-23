// sentry.client.config.example.ts
// Rename to sentry.client.config.ts and `npm install @sentry/nextjs` to activate.
// Errors are reported only when NEXT_PUBLIC_SENTRY_DSN is set, so this file is a
// no-op in local/preview builds without a DSN.
//
// import * as Sentry from '@sentry/nextjs';
//
// if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
//   Sentry.init({
//     dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
//     tracesSampleRate: 0.1,
//     replaysSessionSampleRate: 0,
//     replaysOnErrorSampleRate: 1.0,
//     environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
//   });
// }
