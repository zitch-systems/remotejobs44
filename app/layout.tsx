import type { Metadata, Viewport } from 'next';
import { Sora, DM_Sans } from 'next/font/google';
import './globals.css';
import './deep-ocean.css';
import { Analytics }      from '@vercel/analytics/next';
import { SpeedInsights }  from '@vercel/speed-insights/next';
import { ThemeProvider }  from '@/components/providers/ThemeProvider';
import { AuthSyncProvider } from '@/components/providers/AuthSyncProvider';
import { Header }         from '@/components/layout/Header';
import { Footer }         from '@/components/layout/Footer';
import { BottomNav }      from '@/components/layout/BottomNav';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { ModalRoot }      from '@/components/ui/Modal';
import { PWAInstall }     from '@/components/ui/PWAInstall';

// next/font self-hosts the woff2 files at build time and inlines the
// @font-face declarations into the document, eliminating the
// render-blocking round trips to fonts.googleapis.com + fonts.gstatic.com
// that were the single biggest LCP contributor (~1.6s of blocking time
// per the Lighthouse report). `display: 'swap'` shows the system fallback
// immediately and swaps in the web font when it lands.
const fontSora = Sora({
  subsets: ['latin'],
  weight:  ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-sora',
  fallback: ['system-ui', 'sans-serif'],
});
const fontDmSans = DM_Sans({
  subsets: ['latin'],
  weight:  ['300', '400', '500'],
  display: 'swap',
  variable: '--font-dm-sans',
  fallback: ['system-ui', 'sans-serif'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://remotejobs44.com'),
  alternates: { canonical: 'https://remotejobs44.com' },
  title: { default: 'RemoteJobs44 – Remote Jobs in Nigeria & Worldwide', template: '%s | RemoteJobs44' },
  description: 'Find 70,000+ verified remote jobs from top global companies. Search engineering, design, marketing, finance, and more. Browse free.',
  keywords: [
    'remote jobs Nigeria', 'work from home Nigeria', 'remote work Africa', 'online jobs Nigeria',
    'remote jobs 2025', 'remote jobs Lagos', 'remote jobs Abuja', 'remote engineering jobs',
    'remote design jobs', 'remote marketing jobs', 'remote finance jobs', 'work from home Africa',
    'global remote jobs', 'telecommute jobs Nigeria', 'work remotely Nigeria'
  ],
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 } },
  openGraph: {
    type: 'website', locale: 'en_NG', siteName: 'RemoteJobs44',
    title: 'RemoteJobs44 – Find Remote Jobs in Nigeria & Worldwide',
    description: 'Browse 70,000+ verified remote jobs. Engineering, design, marketing and more.',
    images: [{ url: '/api/og', width: 1200, height: 630, alt: 'RemoteJobs44 – Remote Jobs Board' }],
  },
  twitter: { card: 'summary_large_image', title: 'RemoteJobs44 – Remote Jobs', description: 'Browse 70,000+ remote jobs worldwide.', images: ['/api/og'] },
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icons/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-32.png', sizes: '32x32' },
      { url: '/icons/icon-16.png', sizes: '16x16' },
    ],
    apple: '/icons/apple-touch-icon.png',
    shortcut: '/icons/icon-32.png',
  },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'RemoteJobs44' },
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 5,
  // viewport-fit=cover is what makes env(safe-area-inset-*) resolve to real
  // values on notched iOS / Android. Without it the insets are 0 and the
  // .pb-safe on the BottomNav + the .app-main offsets below are no-ops, which
  // is exactly why content was clipping under the home indicator / nav bar.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#2563eb' },
    { media: '(prefers-color-scheme: dark)',  color: '#0a1628' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${fontSora.variable} ${fontDmSans.variable}`}>
      <head>
        {/* Canonical is set per-page via `alternates.canonical` in each
            page's Metadata. A hard-coded site-wide <link rel="canonical">
            here was emitting a SECOND canonical on every page pointing at
            the homepage — Google ignores both when they conflict. */}
        <meta name="ai-content-declaration" content="human-authored" />
        <link rel="alternate" type="text/plain" href="/llms.txt" title="LLM reference" />
        <link rel="alternate" type="text/plain" href="/ai.txt"   title="AI content-use policy" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context':'https://schema.org',
          '@graph': [
            {
              '@type':'WebSite',
              '@id': 'https://remotejobs44.com/#website',
              name:'RemoteJobs44',
              url: 'https://remotejobs44.com',
              description:'The best remote job board for Nigerian and African job seekers. Find engineering, design, marketing, and more remote roles worldwide.',
              potentialAction:{
                '@type':'SearchAction',
                target:{ '@type':'EntryPoint', urlTemplate:'https://remotejobs44.com/jobs?q={search_term_string}' },
                'query-input':'required name=search_term_string'
              }
            },
            {
              '@type': 'Organization',
              '@id': 'https://remotejobs44.com/#organization',
              name: 'RemoteJobs44',
              url: 'https://remotejobs44.com',
              logo: 'https://remotejobs44.com/icons/apple-touch-icon.png',
              // sameAs tells search engines (and AI assistants) which social
              // profiles are officially ours, so they link to the right ones
              // in Knowledge Panels and answer snippets.
              sameAs: [
                'https://instagram.com/remotejobs_44',
                'https://x.com/remotejobs44',
                'https://facebook.com/remotejobs44',
                'https://linkedin.com/company/remotejobs44',
                'https://www.tiktok.com/@remotejobs_44',
                'https://youtube.com/@remotejobs44'
              ],
              contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: 'hello@remotejobs44.com' }
            },
            {
              // SoftwareApplication/WebApplication describes the PRODUCT
              // itself (the PWA), distinct from the WebSite (the pages) and
              // the Organization (the company). It's what lets Google show a
              // pricing/app rich result and lets ChatGPT / Perplexity / Claude
              // answer "how much is RemoteJobs44 / what does it do" with the
              // canonical tiers + feature list instead of guessing.
              // NOTE: no aggregateRating is emitted on purpose — we don't yet
              // collect first-party reviews, and inventing star ratings
              // violates Google's structured-data policy. Add it here once a
              // real review pipeline exists.
              '@type': 'WebApplication',
              '@id': 'https://remotejobs44.com/#app',
              name: 'RemoteJobs44',
              url: 'https://remotejobs44.com',
              applicationCategory: 'BusinessApplication',
              applicationSubCategory: 'Job Search',
              operatingSystem: 'Web, iOS, Android',
              browserRequirements: 'Requires a modern browser. Installable as a PWA.',
              inLanguage: 'en',
              isAccessibleForFree: true,
              publisher: { '@id': 'https://remotejobs44.com/#organization' },
              description: 'Subscription remote job board for African talent applying to global companies — 70,000+ verified fully-remote roles, application tracking, AI CV review and AI interview prep.',
              featureList: [
                'Search 70,000+ verified fully-remote jobs from global companies',
                'Filter by category, country, region, timezone, skill and salary',
                'Application tracker',
                'AI CV review with ATS keyword gaps and a 0–100 score',
                'AI interview prep with role-specific questions',
                'Installable Progressive Web App (offline-capable)',
              ],
              offers: [
                { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'NGN', description: 'Browse all jobs and save favourites.' },
                { '@type': 'Offer', name: 'Day Pass', price: '500', priceCurrency: 'NGN', description: '24-hour full access, 10 applications.' },
                { '@type': 'Offer', name: 'Pro Monthly', price: '2999', priceCurrency: 'NGN', description: 'Unlimited applications, alerts and AI tools.' },
                { '@type': 'Offer', name: 'Pro Annual', price: '29999', priceCurrency: 'NGN', description: 'Pro, billed yearly.' },
              ],
            }
          ]
        }).replace(/</g, '\\u003c') }} />
        {/* --font-sora and --font-dm-sans now come from next/font on the
            <html> className. Only brand-color vars + accent remain inline
            so they're available before globals.css fully loads. */}
        <style dangerouslySetInnerHTML={{ __html: `
          :root {
            --brand-50:#eff6ff; --brand-100:#dbeafe; --brand-200:#bfdbfe;
            --brand-300:#93c5fd; --brand-400:#60a5fa; --brand-500:#3b82f6;
            --brand-600:#2563eb; --brand-700:#1d4ed8; --brand-800:#1e3a5f;
            --brand-900:#0f1e38; --brand-950:#060e1f;
            --accent:#f97316;
          }
        `}} />
      </head>
      <body className="min-h-dvh flex flex-col antialiased bg-[#f8faff] text-[#0f172a] dark:bg-[#0a1628] dark:text-[#e2e8f4] font-sans">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange={false}>
          {/* AuthSyncProvider drives the Supabase session sync + the
              random-logout-protection auth-state listener exactly once
              per session. It renders {children} directly so it doesn't
              introduce a wrapper DOM node. */}
          <AuthSyncProvider>
            <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-[#2563eb] focus:text-white focus:rounded-lg focus:font-semibold">
              Skip to content
            </a>
            <Header />
            {/* app-main (globals.css) reserves the fixed Header height +
                safe-area-top above and the BottomNav footprint + safe-area-
                bottom below, so children never sit under the notch or the
                home indicator. Replaces the old flat pt-[68px] pb-[68px]. */}
            <main id="main-content" className="flex-1 app-main">
              {children}
            </main>
            <Footer />
            <BottomNav />
            <ToastContainer />
            <ModalRoot />
            <PWAInstall />
          </AuthSyncProvider>
          <Analytics />
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  );
}
