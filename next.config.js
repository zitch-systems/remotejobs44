/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Programmatic SEO slug pages (city, country, region, skill, industry,
  // timezone — ~250 paths) each fetch a jobs slice from Supabase at build
  // time. The default 60s per-page timeout was occasionally exhausted when
  // building from a high-latency network or under heavy Supabase load.
  // 180s headroom keeps Vercel + local builds reliable; pages still SSG
  // instantly at runtime.
  staticPageGenerationTimeout: 180,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'logo.clearbit.com' },
      { protocol: 'https', hostname: 'bookface-images.s3.amazonaws.com' },
      { protocol: 'https', hostname: 'cdn-customers.getro.com' },
      { protocol: 'https', hostname: 'cdn.filestackcontent.com' },
      { protocol: 'https', hostname: 'gnyilmahiyddplsrrhoq.supabase.co' },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  // Next 15 graduated `experimental.serverComponentsExternalPackages` to
  // top-level `serverExternalPackages`. @sparticuz/chromium ships a
  // Chromium binary that Webpack must NOT try to bundle — keep both as
  // external server-side deps so they live in node_modules in the
  // Vercel function and get loaded at runtime.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  // Canonical host. The project serves BOTH the apex (remotejobs44.com) and
  // www.remotejobs44.com. @supabase/ssr writes host-only auth cookies (no
  // Domain attribute), so a session established on one host isn't sent on the
  // other — a deterministic way to strand a logged-in user on "Verifying your
  // session…". Force one canonical host so there's a single cookie jar.
  // apex is already the SEO canonical (metadata alternates + sitemap) and apex
  // serves directly today (no platform apex→www redirect), so this www→apex
  // rule terminates and cannot loop.
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.remotejobs44.com' }],
        destination: 'https://remotejobs44.com/:path*',
        permanent: true,
      },
    ];
  },
  async headers() {
    // Content-Security-Policy is the meaningful XSS defence; X-XSS-Protection
    // is deprecated and some Safari versions can be tricked into XSS via it.
    //
    // Sources of inline content this site emits that the CSP must allow:
    //   - script-src 'unsafe-inline' — JSON-LD <script type="application/ld+json">
    //     blocks in app/layout.tsx and app/jobs/[id]/page.tsx, plus the
    //     theme-flash script next-themes injects synchronously.
    //   - style-src 'unsafe-inline' — Tailwind generates one inline style
    //     block for arbitrary-value classes; SVG inline styles in components.
    //   - connect-src — Supabase (.supabase.co), Paystack (api.paystack.co),
    //     Vercel Analytics (va.vercel-scripts.com, vercel.live), the same
    //     origin for /api/*.
    //   - img-src — data: URIs for inline SVGs, https: for arbitrary logos.
    //   - font-src — fonts are self-hosted via next/font now; keep 'self'
    //     plus data: for Tailwind's emoji rendering.
    //   - frame-ancestors 'none' — supersedes X-Frame-Options.
    //
    // unsafe-eval: production app code uses no eval / new Function (verified
    // with a repo-wide grep). HMR in `next dev` does, so we keep it in dev
    // only — prod CSP omits unsafe-eval, closing the most useful XSS pivot.
    // If this breaks something at runtime, restore 'unsafe-eval' here and
    // open an issue documenting which dep needs it.
    const isDev = process.env.NODE_ENV !== 'production';
    const scriptSrc = [
      "'self'",
      "'unsafe-inline'",
      ...(isDev ? ["'unsafe-eval'"] : []),
      'https://va.vercel-scripts.com',
      'https://vercel.live',
      'https://js.paystack.co',
    ].join(' ');
    const csp = [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.paystack.co https://va.vercel-scripts.com https://vercel.live",
      "frame-src 'self' https://js.paystack.co https://checkout.paystack.com",
      "frame-ancestors 'none'",
      "form-action 'self' https://checkout.paystack.com",
      "base-uri 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options',  value: 'nosniff' },
          { key: 'X-Frame-Options',         value: 'DENY' },
          // HSTS: tell browsers to only ever load this origin over HTTPS
          // for the next 2 years. `includeSubDomains` covers any future
          // subdomain (api., admin., status., …); `preload` opts us into
          // the browser-shipped HSTS preload list. The header is also a
          // ranking + trust signal — Google logs HSTS as part of the page
          // experience report. Only enable once HTTPS is locked in
          // permanently; rolling back HSTS after a long max-age is
          // painful.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Referrer-Policy',         value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',      value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      // NOTE: /jobs/:id used to ship `Cache-Control: public, max-age=3600`
      // here, from the era when the page was a static client shell. The
      // page is now server-rendered per request and its HTML VARIES BY
      // AUTH (paid users get apply_url baked in) — letting any shared/
      // public cache hold one user's variant is both a paywall leak (paid
      // HTML replayed to anon) and a staleness bug (anon HTML replayed to
      // a user who just paid). Caching for this route now lives server-
      // side in the tagged data cache (lib/jobs/job-detail.ts), which
      // stores only the auth-blind SAFE columns by design.
    ];
  },
};

module.exports = nextConfig;
