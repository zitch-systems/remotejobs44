/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Disable font optimization to prevent build failures when Google Fonts is unreachable
  optimizeFonts: false,
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
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options',  value: 'nosniff' },
          { key: 'X-Frame-Options',         value: 'DENY' },
          { key: 'X-XSS-Protection',        value: '1; mode=block' },
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
