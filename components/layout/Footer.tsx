'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { waLink } from '@/lib/whatsapp';
import { isMemberRoute } from '@/lib/member-routes';

// High-res SVG social icons - crisp at any resolution
const SOCIAL = [
  {
    name: 'X (Twitter)',
    href: 'https://x.com/remotejobs44',
    color: '#000000',
    svg: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.259 5.633zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
  },
  {
    name: 'Facebook',
    href: 'https://facebook.com/remotejobs44',
    color: '#1877F2',
    svg: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
  },
  {
    name: 'Instagram',
    href: 'https://instagram.com/remotejobs_44',
    color: '#E4405F',
    svg: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
      </svg>
    ),
  },
  {
    name: 'WhatsApp',
    href: waLink(),
    color: '#25D366',
    svg: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
    ),
  },
  {
    name: 'LinkedIn',
    href: 'https://linkedin.com/company/remotejobs44',
    color: '#0A66C2',
    svg: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    ),
  },
  {
    name: 'TikTok',
    href: 'https://www.tiktok.com/@remotejobs_44',
    color: '#000000',
    svg: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.2 8.2 0 004.79 1.53V6.77a4.85 4.85 0 01-1.02-.08z"/>
      </svg>
    ),
  },
  {
    name: 'YouTube',
    href: 'https://youtube.com/@remotejobs44',
    color: '#FF0000',
    svg: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
    ),
  },
  {
    name: 'Snapchat',
    href: 'https://snapchat.com/add/remotejobs44',
    color: '#FFFC00',
    svg: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
        <path d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.553 4.225.106.705.553.459.705.394.174-.073.394-.074.577-.074.22 0 .48.065.704.197.727.426.656 1.266.186 1.653-.473.386-1.343.46-1.872.578-.528.116-.576.14-.576.303 0 .163.087.391.175.686.436 1.47 1.37 2.643 1.952 3.528.581.886.954 1.63.954 2.323 0 .695-.348 1.276-.9 1.499-.553.224-1.16.134-1.65.058-.495-.078-.91.098-1.192.263-.283.165-.524.281-.783.281-.26 0-.524-.116-.76-.282-.24-.164-.458-.342-.757-.497-.3-.155-.576-.172-.85-.094-.274.078-.574.267-.95.267-.374 0-.718-.186-1.04-.4-.32-.214-.632-.395-.957-.395-.327 0-.64.19-.973.386-.334.196-.686.409-1.07.409-.384 0-.75-.217-1.09-.419-.338-.201-.656-.365-.944-.365-.288 0-.588.173-.9.402-.313.228-.65.409-1.002.409-.352 0-.686-.177-.96-.348-.275-.17-.515-.324-.813-.41-.3-.085-.61-.065-.912.009-.3.073-.594.248-.996.359-.402.111-.773.07-1.21-.017-.437-.087-.906-.275-1.128-.684-.222-.41-.111-.98.122-1.5.234-.52.576-1.006 1.046-1.614.47-.608 1.043-1.39 1.474-2.413.219-.521.384-1.03.38-1.44-.004-.41-.16-.64-.525-.767-.366-.126-.846-.155-1.244-.26C.96 10.99.386 10.68.073 10.143c-.313-.538-.337-1.18.044-1.6.383-.42.96-.487 1.455-.42.495.068.947.246 1.19.276.242.028.38-.095.38-.316V5.18C3.142 2.317 7.205.793 12.206.793zm0 1.516c-4.236 0-7.567 1.292-7.567 3.873v3.7c0 1.003-.695 1.52-1.618 1.288-.923-.232-1.282-.11-1.282.258 0 .369.525.68 1.23.87.706.19 1.6.28 2.145.864.544.583.49 1.553.187 2.578-.33 1.12-.95 2.088-1.571 2.9-.62.812-.893 1.52-.893 1.952 0 .433.23.612.675.655.444.04.884-.113 1.24-.235.356-.12.68-.16 1.002-.16.322 0 .63.04.924.155.294.115.575.29.864.29.288 0 .594-.178.885-.374.292-.196.592-.406.94-.406.348 0 .664.209.978.4.314.19.635.38.985.38.35 0 .682-.186.997-.384.314-.197.63-.396.962-.396.33 0 .636.196.926.382.288.186.57.398.89.398.317 0 .617-.214.908-.396.29-.184.574-.364.9-.364.328 0 .622.18.918.346.296.164.593.33.91.386.317.055.646.03.968-.065.322-.096.618-.254.854-.35.236-.093.43-.14.629-.14.2 0 .41.048.667.196.255.148.44.247.657.288.217.04.457.01.665-.085.207-.096.368-.268.368-.536 0-.267-.158-.636-.484-1.125-.326-.49-.787-1.07-1.212-1.843-.426-.773-.812-1.7-1.025-2.707-.23-1.08-.19-2.062.44-2.597.63-.535 1.55-.617 2.294-.803.742-.186 1.13-.498 1.13-.858 0-.36-.326-.486-1.193-.286-.868.2-1.564-.283-1.564-1.288v-3.7c0-2.58-3.28-3.873-7.567-3.873z"/>
      </svg>
    ),
  },
];

// Point to the indexable programmatic landing pages
// (`/jobs/category/[slug]`), not the faceted `/jobs?category=` query —
// the latter is client-rendered and not separately indexed, so PageRank
// arriving on the canonical pages had nowhere to flow back to.
const FOOTER_LINKS = {
  Jobs: [
    { label: 'All Remote Jobs',  href: '/jobs' },
    { label: 'Engineering',      href: '/jobs/category/engineering' },
    { label: 'Design',           href: '/jobs/category/design' },
    { label: 'Marketing',        href: '/jobs/category/marketing' },
    { label: 'Finance',          href: '/jobs/category/finance' },
    { label: 'By Industry',      href: '/jobs/industry' },
    { label: 'By City',          href: '/jobs/city' },
  ],
  // Surface the programmatic-SEO hub pages here so they get a sitewide
  // internal link (PageRank) on every page — previously they were reachable
  // only from the sitemap, which passes no internal anchor signal.
  Explore: [
    { label: 'Salary Guide',     href: '/salary-guide' },
    { label: 'Resources',        href: '/resources' },
    { label: 'Compare Boards',   href: '/compare' },
    { label: 'Companies Hiring', href: '/companies' },
    { label: 'How It Works',     href: '/how-it-works' },
    { label: 'For Employers',    href: '/for-employers' },
  ],
  Company: [
    { label: 'About',      href: '/about' },
    { label: 'Blog',       href: '/blog' },
    { label: 'Pricing',    href: '/pricing' },
    { label: 'FAQ',        href: '/faq' },
    { label: 'Contact',    href: '/contact' },
  ],
  Legal: [
    { label: 'Privacy Policy',     href: '/privacy' },
    { label: 'Terms & Conditions', href: '/terms' },
    { label: 'Cookie Policy',      href: '/cookies' },
  ],
};

export function Footer() {
  // Signed-in member routes use the MemberShell chrome instead of the
  // marketing footer.
  const pathname = usePathname();
  // Hidden on member routes AND the /admin portal (chromeless, own sidebar).
  if (isMemberRoute(pathname) || pathname.startsWith('/admin')) return null;
  // Rendered on every breakpoint (was `hidden md:block`). Under mobile-first
  // indexing Googlebot crawls the mobile viewport, so a footer hidden on
  // mobile starved the programmatic landing pages of their sitewide internal
  // links. Extra bottom padding on mobile clears the fixed BottomNav.
  return (
    <footer className="bg-white dark:bg-[#0f1e38] border-t border-stone-200 dark:border-[#1e3a5f] pt-16 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8 block">
      <div className="max-w-[1440px] mx-auto px-5">
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-6 gap-8 mb-12">

          {/* Brand */}
          <div className="col-span-2 lg:col-span-2">
            <Link href="/" className="flex items-center gap-2.5 font-display font-bold text-[18px] text-stone-900 dark:text-stone-100 tracking-tight mb-3 hover:opacity-80 transition-opacity">
              <svg viewBox="0 0 32 32" className="w-8 h-8" fill="none">
                <rect width="32" height="32" rx="8" fill="#2563eb"/>
                <path d="M8 20 Q12 10 16 16 Q20 22 23 12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                <circle cx="23" cy="12" r="2.5" fill="#f97316"/>
              </svg>
              RemoteJobs44
            </Link>
            <p className="text-sm text-stone-400 dark:text-stone-500 max-w-[220px] leading-relaxed mb-3">
              Your global remote career starts here. Find jobs from anywhere. Subscribe from ₦500.
            </p>
            <a href="mailto:hello@remotejobs44.com"
              className="inline-flex items-center gap-1.5 text-sm text-brand-700 dark:text-brand-400 hover:underline mb-5 font-medium">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
              </svg>
              hello@remotejobs44.com
            </a>

            {/* Social icons */}
            <div className="flex flex-wrap gap-2">
              {SOCIAL.map(s => (
                <a
                  key={s.name}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.name}
                  className="w-9 h-9 flex items-center justify-center rounded-lg border border-stone-200 dark:border-[#1e3a5f] text-stone-500 dark:text-stone-400 hover:border-brand-600 hover:text-brand-700 dark:hover:border-brand-500 dark:hover:text-brand-400 transition-all duration-150 hover:scale-110"
                  style={{ '--hover-color': s.color } as React.CSSProperties}
                >
                  {s.svg}
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([title, links]) => (
            <div key={title}>
              <h4 className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-4">{title}</h4>
              <ul className="space-y-2.5">
                {links.map(link => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-stone-500 dark:text-stone-400 hover:text-brand-700 dark:hover:text-brand-400 transition-colors duration-100">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-8 border-t border-stone-100 dark:border-[#1e3a5f]">
          <p className="text-xs text-stone-400 dark:text-stone-500">
                        © {new Date().getFullYear()} RemoteJobs44. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="text-xs text-stone-400 dark:text-stone-500 hover:text-brand-700 dark:hover:text-brand-400 transition-colors">Privacy</Link>
            <Link href="/terms"   className="text-xs text-stone-400 dark:text-stone-500 hover:text-brand-700 dark:hover:text-brand-400 transition-colors">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
