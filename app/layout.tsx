// app/layout.tsx
import type { Metadata, Viewport } from 'next';
import { Sora, DM_Sans } from 'next/font/google';
import './globals.css';
import { ThemeProvider }  from '@/components/providers/ThemeProvider';
import { Header }         from '@/components/layout/Header';
import { Footer }         from '@/components/layout/Footer';
import { BottomNav }      from '@/components/layout/BottomNav';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { ModalRoot }      from '@/components/ui/Modal';

// Load fonts via next/font — optimised, self-hosted, no @import needed
const sora = Sora({
  subsets:  ['latin'],
  weight:   ['300', '400', '500', '600', '700', '800'],
  variable: '--font-sora',
  display:  'swap',
});

const dmSans = DM_Sans({
  subsets:  ['latin'],
  weight:   ['300', '400', '500'],
  variable: '--font-dm-sans',
  display:  'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://remotejobs44.vercel.app'),
  title: { default: 'RemoteJobs44 – Global Remote Jobs', template: '%s | RemoteJobs44' },
  description: 'Find remote jobs from top companies worldwide. Subscribe from ₦1,000, apply instantly, and track your career – all in one place.',
  keywords: ['remote jobs', 'work from home', 'remote work', 'Nigeria', 'global jobs'],
  authors: [{ name: 'RemoteJobs44' }],
  openGraph: {
    type:        'website',
    locale:      'en_US',
    url:         'https://remotejobs44.com',
    siteName:    'RemoteJobs44',
    title:       'RemoteJobs44 – Global Remote Jobs',
    description: 'Find remote jobs from top companies worldwide. Subscribe from ₦1,000.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'RemoteJobs44' }],
  },
  twitter: {
    card:        'summary_large_image',
    title:       'RemoteJobs44 – Global Remote Jobs',
    description: 'Find remote jobs from top companies worldwide.',
    images:      ['/og-image.png'],
  },
  manifest: '/manifest.json',
  icons: {
    icon:  [{ url: '/icons/favicon.svg', type: 'image/svg+xml' }],
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width:        'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0a5c36' },
    { media: '(prefers-color-scheme: dark)',  color: '#0d1f18' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sora.variable} ${dmSans.variable}`}
    >
      <body className="min-h-dvh flex flex-col bg-stone-50 text-stone-900 font-body antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange={false}
        >
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-brand-700 focus:text-white focus:rounded-md focus:font-semibold"
          >
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
        </ThemeProvider>
      </body>
    </html>
  );
}
