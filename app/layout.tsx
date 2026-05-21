import type { Metadata, Viewport } from 'next';
import { Sora, DM_Sans } from 'next/font/google';
import './globals.css';
import { ThemeProvider }  from '@/components/providers/ThemeProvider';
import { Header }         from '@/components/layout/Header';
import { Footer }         from '@/components/layout/Footer';
import { BottomNav }      from '@/components/layout/BottomNav';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { ModalRoot }      from '@/components/ui/Modal';
import { PWAInstall }     from '@/components/ui/PWAInstall';

const sora = Sora({
  subsets: ['latin'],
  weight: ['300','400','500','600','700','800'],
  variable: '--font-sora',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300','400','500','600','700'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://remotejobs44.vercel.app'),
  title: {
    default: 'RemoteJobs44 – Remote Jobs in Nigeria & Worldwide',
    template: '%s | RemoteJobs44',
  },
  description: 'Find 50,000+ remote jobs from top global companies. Engineering, design, marketing, finance and more. Subscribe from ₦1,000. Work from anywhere in Nigeria or worldwide.',
  keywords: [
    'remote jobs Nigeria','work from home Nigeria','remote work Africa',
    'online jobs Nigeria','remote jobs 2025','work remotely Nigeria',
    'software engineering jobs remote','design jobs remote','remote jobs Lagos',
    'remote jobs Abuja','international remote jobs Nigeria',
  ],
  authors: [{ name: 'RemoteJobs44', url: 'https://remotejobs44.vercel.app' }],
  creator: 'RemoteJobs44',
  publisher: 'RemoteJobs44',
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  alternates: { canonical: 'https://remotejobs44.vercel.app' },
  openGraph: {
    type: 'website',
    locale: 'en_NG',
    url: 'https://remotejobs44.vercel.app',
    siteName: 'RemoteJobs44',
    title: 'RemoteJobs44 – Remote Jobs in Nigeria & Worldwide',
    description: 'Find 50,000+ remote jobs. Subscribe from ₦1,000 and apply to any job worldwide.',
    images: [{ url: '/api/og', width: 1200, height: 630, alt: 'RemoteJobs44' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RemoteJobs44 – Remote Jobs Worldwide',
    description: 'Find remote jobs from anywhere. Subscribe from ₦1,000.',
    images: ['/api/og'],
    creator: '@remotejobs44',
  },
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icons/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/icons/icon-16.png', type: 'image/png', sizes: '16x16' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
    shortcut: '/icons/icon-32.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'RemoteJobs44',
    startupImage: '/icons/apple-touch-icon.png',
  },
  other: {
    'msapplication-TileColor': '#2563eb',
    'msapplication-TileImage': '/icons/icon-192.png',
    // AI search/LLM optimization
    'ai-content-declaration': 'human-curated job listings',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#2563eb' },
    { media: '(prefers-color-scheme: dark)',  color: '#0f1e38' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sora.variable} ${dmSans.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        {/* JSON-LD structured data for AI search */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          "name": "RemoteJobs44",
          "url": "https://remotejobs44.vercel.app",
          "description": "Remote job board serving Nigeria and global job seekers. 50,000+ remote jobs from top companies.",
          "potentialAction": {
            "@type": "SearchAction",
            "target": { "@type": "EntryPoint", "urlTemplate": "https://remotejobs44.vercel.app/jobs?q={search_term_string}" },
            "query-input": "required name=search_term_string"
          },
          "publisher": {
            "@type": "Organization",
            "name": "RemoteJobs44",
            "logo": { "@type": "ImageObject", "url": "https://remotejobs44.vercel.app/icons/icon-512.png" }
          }
        })}} />
        <style dangerouslySetInnerHTML={{ __html: `
          :root {
            --brand-50:#eff6ff;--brand-100:#dbeafe;--brand-200:#bfdbfe;
            --brand-300:#93c5fd;--brand-400:#60a5fa;--brand-500:#3b82f6;
            --brand-600:#2563eb;--brand-700:#1d4ed8;--brand-800:#1e40af;
            --brand-900:#1e3a5f;--brand-950:#0f1e38;
            --accent:#f97316;--accent-light:#fb923c;--accent-dark:#ea580c;
          }
        `}} />
      </head>
      <body className="min-h-dvh flex flex-col font-body bg-[#f8faff] text-slate-900 antialiased dark:bg-[#0f1e38] dark:text-[#e8eeff]">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange={false}>
          <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-brand-700 focus:text-white focus:rounded-lg focus:font-semibold">
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
        </ThemeProvider>
      </body>
    </html>
  );
}
