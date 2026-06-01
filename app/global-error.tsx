'use client';
// app/global-error.tsx — last-resort error boundary.
//
// app/error.tsx catches errors in the page tree, but a throw in the ROOT
// layout itself (or in error.tsx) falls through to Next's unstyled default
// page. global-error replaces the root layout, so it must render its own
// <html>/<body> and can't rely on any app providers/CSS — hence inline
// styles.
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global-error]', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#0a1628', color: '#f1f5f9', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 40, maxWidth: 480 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px' }}>Something went wrong</h1>
          <p style={{ color: '#94a3b8', fontSize: 15, lineHeight: 1.6, margin: '0 0 24px' }}>
            An unexpected error occurred. Try again, or head back to the homepage.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => reset()} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- intentional hard navigation: this is the last-resort boundary, so force a full reload rather than client-routing with a possibly-broken app */}
            <a href="/" style={{ color: '#93c5fd', border: '1px solid #1e3a5f', padding: '10px 24px', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
