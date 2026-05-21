'use client';
import Link from 'next/link';

const FOOTER_LINKS = {
  Jobs: [
    { label: 'Engineering',  href: '/jobs?category=engineering' },
    { label: 'Design',       href: '/jobs?category=design' },
    { label: 'Marketing',    href: '/jobs?category=marketing' },
    { label: 'Finance',      href: '/jobs?category=finance' },
    { label: 'Data & Analytics', href: '/jobs?category=data' },
  ],
  Company: [
    { label: 'About',     href: '/about' },
    { label: 'Companies', href: '/companies' },
    { label: 'Pricing',   href: '/pricing' },
    { label: 'Contact',   href: '/contact' },
  ],
  Legal: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Cookie Policy',  href: '/cookies' },
  ],
};

export function Footer() {
  return (
    <footer className="bg-white dark:bg-[#152B20] border-t border-stone-200 dark:border-[#234533] pt-16 pb-8 hidden md:block">
      <div className="max-w-[1240px] mx-auto px-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
          <div>
            <Link href="/" className="flex items-center gap-2 font-display font-bold text-[17px] text-stone-900 dark:text-stone-100 tracking-tight mb-3">
              <svg viewBox="0 0 32 32" className="w-7 h-7 text-brand-700 dark:text-brand-400" fill="none">
                <circle cx="16" cy="16" r="14" fill="currentColor" opacity="0.12"/>
                <path d="M8 20 Q12 10 16 16 Q20 22 24 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                <circle cx="24" cy="12" r="3" fill="currentColor"/>
              </svg>
              RemoteJobs44
            </Link>
            <p className="text-sm text-stone-400 dark:text-stone-500 max-w-[200px] leading-relaxed mb-4">
              Your global remote career starts here.
            </p>
          </div>
          {Object.entries(FOOTER_LINKS).map(([title, links]) => (
            <div key={title}>
              <h4 className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-4">{title}</h4>
              <ul className="space-y-3">
                {links.map(link => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-stone-500 dark:text-stone-400 hover:text-brand-700 dark:hover:text-brand-400 transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 pt-8 border-t border-stone-100 dark:border-[#234533]">
          <p className="text-xs text-stone-400 dark:text-stone-500">© 2025 RemoteJobs44. All rights reserved.</p>
          <p className="text-xs text-stone-400 dark:text-stone-500">🌍 Built for the global remote workforce</p>
        </div>
      </div>
    </footer>
  );
}
