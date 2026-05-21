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
  description: 'Find remote jobs from top companies worldwide. Subscribe from ₦1,000, apply instantly, and track your career.',
  keywords: ['remote jobs', 'work from home', 'Nigeria', 'global jobs'],
  authors: [{ name: 'RemoteJobs44' }],
  openGraph: {
    type: 'website', locale: 'en_US', url: 'https://remotejobs44.com',
    siteName: 'RemoteJobs44', title: 'RemoteJobs44 – Global Remote Jobs',
    description: 'Find remote jobs worldwide. Subscribe from ₦1,000.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'RemoteJobs44' }],
  },
  twitter: {
    card: 'summary_large_image', title: 'RemoteJobs44 – Global Remote Jobs',
    description: 'Find remote jobs worldwide.', images: ['/og-image.png'],
  },
  manifest: '/manifest.json',
  icons: { icon: [{ url: '/icons/favicon.svg', type: 'image/svg+xml' }] },
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0a5c36' },
    { media: '(prefers-color-scheme: dark)',  color: '#0d1f18' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sora.variable} ${dmSans.variable}`}>
      <head>
        {/* Critical inline CSS — cannot be purged or cached incorrectly */}
        <style dangerouslySetInnerHTML={{ __html: `
          *, *::before, *::after { box-sizing: border-box; }
          html { scroll-behavior: smooth; }
          body {
            margin: 0;
            font-family: var(--font-dm-sans, 'DM Sans', system-ui, sans-serif);
            background-color: #fafaf9;
            color: #1c1917;
            -webkit-font-smoothing: antialiased;
            min-height: 100dvh;
            display: flex;
            flex-direction: column;
          }
          a { color: inherit; text-decoration: none; }
          /* Brand color variables */
          :root {
            --brand: #0a5c36;
            --brand-50: #edfaf2;
            --brand-100: #d4f3e3;
            --brand-500: #1ea05e;
            --brand-600: #0f7a48;
            --brand-700: #0a5c36;
          }
          /* Card */
          .card {
            background: #fff;
            border: 1px solid #e7e5e4;
            border-radius: 8px;
          }
          /* Input */
          .input {
            width: 100%;
            padding: 12px 16px;
            border-radius: 6px;
            border: 1px solid #e7e5e4;
            background: #fff;
            color: #1c1917;
            font-size: 15px;
            font-family: inherit;
            outline: none;
            transition: border-color 0.15s, box-shadow 0.15s;
          }
          .input:focus { border-color: #0a5c36; box-shadow: 0 0 0 2px rgba(10,92,54,0.1); }
          .input::placeholder { color: #a8a29e; }
          /* Badge */
          .badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            border-radius: 20px;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            white-space: nowrap;
          }
          /* Chip */
          .chip {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 16px;
            border-radius: 20px;
            border: 1px solid #e7e5e4;
            background: #fff;
            color: #78716c;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            white-space: nowrap;
            user-select: none;
            transition: border-color 0.15s, color 0.15s;
          }
          .chip:hover { border-color: #0a5c36; color: #0a5c36; }
          .chip.active { background: #0a5c36; border-color: #0a5c36; color: #fff; font-weight: 600; }
          /* Glass nav */
          .glass-nav {
            background: rgba(250,250,248,0.88);
            backdrop-filter: blur(20px) saturate(180%);
            -webkit-backdrop-filter: blur(20px) saturate(180%);
          }
          /* Font utilities */
          .font-display { font-family: var(--font-sora, 'Sora', system-ui, sans-serif); }
          .font-body { font-family: var(--font-dm-sans, 'DM Sans', system-ui, sans-serif); }
          /* Skeleton */
          .skeleton {
            background: linear-gradient(90deg, #f5f5f4 25%, #e7e5e4 50%, #f5f5f4 75%);
            background-size: 200% 100%;
            animation: shimmer 1.5s ease infinite;
            border-radius: 6px;
          }
          /* Scrollbar */
          .no-scrollbar::-webkit-scrollbar { display: none; }
          .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
          /* Line clamp */
          .line-clamp-2 { overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
          .line-clamp-3 { overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
          /* Admin nav */
          .admin-nav-item {
            display: flex; align-items: center; gap: 12px;
            padding: 12px 20px; font-size: 13px; font-weight: 500;
            color: #78716c; border-right: 2px solid transparent;
            cursor: pointer; transition: all 0.15s; width: 100%;
            background: none; border-left: none; border-top: none; border-bottom: none;
            text-align: left;
          }
          .admin-nav-item:hover { background: #fafaf9; color: #1c1917; }
          .admin-nav-item.active { background: #edfaf2; color: #0a5c36; border-right-color: #0a5c36; font-weight: 600; }
          /* Bottom nav */
          .bottom-nav-item {
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; gap: 2px; padding-top: 8px; padding-bottom: 4px;
            color: #a8a29e; transition: color 0.15s;
          }
          .bottom-nav-item.active { color: #0a5c36; }
          /* Text highlight */
          .text-highlight { position: relative; display: inline-block; color: #0a5c36; }
          .text-highlight::after {
            content: ''; position: absolute; bottom: 0; left: 0; right: 0;
            height: 3px; border-radius: 9999px; background: currentColor; opacity: 0.35;
          }
          /* Hero glow */
          .hero-glow {
            background: radial-gradient(ellipse 80% 60% at 50% -10%, rgba(10,92,54,0.09), transparent 70%);
          }
          /* Safe area */
          .pb-safe { padding-bottom: max(8px, env(safe-area-inset-bottom)); }
          /* Keyframes */
          @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          @keyframes modalIn { from { transform: scale(0.94) translateY(12px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
          @keyframes toastIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          /* Dark mode */
          .dark body { background-color: #0d1f18; color: #e8f2ec; }
          .dark .card { background: #152b20; border-color: #234533; }
          .dark .input { background: #152b20; border-color: #234533; color: #e8f2ec; }
          .dark .input::placeholder { color: #57534e; }
          .dark .glass-nav { background: rgba(13,31,24,0.88); }
          .dark .chip { background: #152b20; border-color: #234533; color: #a8a29e; }
          .dark .chip:hover { border-color: #3dbb7b; color: #3dbb7b; }
          .dark .skeleton { background: linear-gradient(90deg, #1c2b24 25%, #234533 50%, #1c2b24 75%); }
        ` }} />
      </head>
      <body className="min-h-dvh flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange={false}>
          <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-brand-700 focus:text-white focus:rounded-md focus:font-semibold">
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
