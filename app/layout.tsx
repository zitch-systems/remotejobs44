import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Analytics }      from '@vercel/analytics/next';
import { SpeedInsights }  from '@vercel/speed-insights/next';
import { ThemeProvider }  from '@/components/providers/ThemeProvider';
import { Header }         from '@/components/layout/Header';
import { Footer }         from '@/components/layout/Footer';
import { BottomNav }      from '@/components/layout/BottomNav';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { ModalRoot }      from '@/components/ui/Modal';
import { PWAInstall }     from '@/components/ui/PWAInstall';

export const metadata: Metadata = {
  metadataBase: new URL('https://remotejobs44.com'),
  alternates: { canonical: 'https://remotejobs44.com' },
  title: { default: 'RemoteJobs44 – Remote Jobs in Nigeria & Worldwide', template: '%s | RemoteJobs44' },
  description: 'Find 50,000+ verified remote jobs from top global companies. Search engineering, design, marketing, finance, and more. Browse free — apply from ₦500.',
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
    description: 'Browse 50,000+ verified remote jobs. Engineering, design, marketing and more. Subscribe from ₦500.',
    images: [{ url: '/api/og', width: 1200, height: 630, alt: 'RemoteJobs44 – Remote Jobs Board' }],
  },
  twitter: { card: 'summary_large_image', title: 'RemoteJobs44 – Remote Jobs', description: 'Browse 50,000+ remote jobs worldwide. Subscribe from ₦500.', images: ['/api/og'] },
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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#2563eb' },
    { media: '(prefers-color-scheme: dark)',  color: '#0a1628' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="canonical" href="https://remotejobs44.com" />
        <meta name="ai-content-declaration" content="human-authored" />
        <link rel="alternate" type="text/plain" href="/llms.txt" title="LLM reference" />
        {/* Google Fonts via standard link — avoids next/font build failures */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
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
                'https://tiktok.com/@remotejobs44',
                'https://youtube.com/@remotejobs44'
              ],
              contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: 'hello@remotejobs44.com' }
            }
          ]
        }).replace(/</g, '\\u003c') }} />
        <style dangerouslySetInnerHTML={{ __html: `
          :root {
            --font-sora: 'Sora', system-ui, sans-serif;
            --font-dm-sans: 'DM Sans', system-ui, sans-serif;
            --brand-50:#eff6ff; --brand-100:#dbeafe; --brand-200:#bfdbfe;
            --brand-300:#93c5fd; --brand-400:#60a5fa; --brand-500:#3b82f6;
            --brand-600:#2563eb; --brand-700:#1d4ed8; --brand-800:#1e3a5f;
            --brand-900:#0f1e38; --brand-950:#060e1f;
            --accent:#f97316;
          }
        `}} />
      </head>
      <body style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }} className="min-h-dvh flex flex-col antialiased bg-[#f8faff] text-[#0f172a] dark:bg-[#0a1628] dark:text-[#e2e8f4]">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange={false}>
          <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-[#2563eb] focus:text-white focus:rounded-lg focus:font-semibold">
            Skip to content
          </a>
          <Header />
          <main id="main-content" className="flex-1 pt-[68px] pb-[68px] md:pb-0">
            {children}
          </main>
          <Footer />
          <BottomNav />
          <ToastContainer />
          <ModalRoot />
          <PWAInstall />
          <Analytics />
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  );
}
