/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
    // @sparticuz/chromium ships a Chromium binary that Webpack must NOT try
    // to bundle — keep it as an external server-side dependency so it lives
    // in node_modules in the Vercel function and gets loaded at runtime.
    serverComponentsExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
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
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://vercel.live https://js.paystack.co",
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
          // X-XSS-Protection intentionally removed — deprecated and harmful
          // on some Safari versions. CSP above is the actual defence.
          { key: 'Referrer-Policy',         value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',      value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        source: '/jobs/:id',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
