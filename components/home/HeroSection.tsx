// components/home/HeroSection.tsx
//
// Server-rendered hero. Was a 258-line 'use client' tree where the LCP
// element (the descriptive paragraph after the H1) waited for hydration
// before being styled — Lighthouse blamed this for ~half of the 3.9s LCP.
// Now the eyebrow + headline + paragraph + popular-search chips + social
// + stats ship in the initial HTML. Three small client islands carry
// the auth-aware bits:
//
//   * <HeroSearchBox />     — search input + Enter handler
//   * <HeroCTAs />          — Get Started/Log In vs Browse Jobs/View Plans
//   * <HeroInstallButton /> — beforeinstallprompt + iOS instructions
import Link from 'next/link';
import { HeroSearchBox } from './HeroSearchBox';
import { HeroCTAs } from './HeroCTAs';
import { HeroInstallButton } from './HeroInstallButton';

const POPULAR = ['React', 'Python', 'Design', 'Marketing', 'Finance', 'DevOps', 'Product'];

// Honest, directional copy in place of the previous hard-coded
// "50,000+ jobs / 8,000+ companies / 190+ countries" numbers. /about
// has real DB-backed counts for visitors who want the exact figure;
// the hero's stat row stays static so it doesn't add a DB hit to the
// homepage LCP path.
const HERO_STATS = [
  { value: 'Daily',     label: 'Fresh listings'      },
  { value: 'Global',    label: 'Companies hiring'    },
  { value: 'From ₦500', label: 'Day Pass access'     },
];

export function HeroSection() {
  return (
    <section className="relative overflow-hidden hero-glow pt-6 pb-12 sm:pt-8 sm:pb-14">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-5 flex flex-col items-center text-center gap-6">

        {/* Eyebrow */}
        <div className="animate-fade-in inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-bold uppercase tracking-widest"
          style={{ background:'rgba(37,99,235,0.08)', borderColor:'rgba(37,99,235,0.25)', color:'#2563eb' }}>
          🌍 Remote jobs worldwide
        </div>

        {/* Headline — the brand-coloured "starts here" doubles as the
            primary signup entry point. It already reads as
            interactive (highlighted, brand colour); the link makes
            that affordance real. Routes to /register so the click
            lands on the signup flow. */}
        <h1 className="font-display font-extrabold tracking-tight text-stone-900 dark:text-stone-100 text-balance animate-slide-up"
          style={{ fontSize:'clamp(2rem,6vw,3.75rem)', lineHeight:1.08, maxWidth:'900px' }}>
          Your next remote job{' '}
          <Link href="/register"
            className="text-highlight hover:underline focus:outline-none focus:underline transition-all"
            aria-label="Create your free account to start applying">
            starts here
          </Link>
        </h1>

        {/* LCP element — server-rendered so it lands without waiting for JS. */}
        <p className="text-stone-500 dark:text-stone-400 max-w-lg leading-relaxed"
          style={{ fontSize:'clamp(1rem,2vw,1.1rem)' }}>
          Connect with top companies hiring remotely across engineering, design, marketing and more.
          Day pass from <span className="font-bold text-brand-700 dark:text-brand-400">₦500</span>{' '}
          (10 applications) or go Pro for unlimited access.
        </p>

        {/* Search bar — input lives in a small client island. */}
        <div className="w-full max-w-2xl">
          <HeroSearchBox />

          {/* Popular searches — plain <Link>s, no JS needed. Land on
              /jobs?q=… (the filter-driven search), since these terms
              are generic prompts rather than catalogued skills. */}
          <div className="flex items-center gap-2 mt-3 flex-wrap justify-center">
            <span className="text-xs text-stone-400 dark:text-stone-500">Popular:</span>
            {POPULAR.map(term => (
              <Link key={term} href={`/jobs?q=${encodeURIComponent(term)}`}
                className="text-xs px-2.5 py-1 rounded-full bg-stone-100 dark:bg-[#0a1628] border border-stone-200 dark:border-[#1e3a5f] text-stone-600 dark:text-stone-300 hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-400 transition-all">
                {term}
              </Link>
            ))}
          </div>
        </div>

        {/* Auth-aware CTAs */}
        <div className="flex gap-3 flex-wrap justify-center">
          <HeroCTAs />
        </div>

        {/* PWA install (client — feature-detects + hides when not available) */}
        <HeroInstallButton />

        {/* Support email + social row */}
        <div className="-mt-2 flex flex-col items-center gap-2">
          <p className="text-xs text-stone-400 dark:text-stone-500">
            Need help?{' '}
            <a href="mailto:hello@remotejobs44.com" className="text-brand-700 dark:text-brand-400 hover:underline font-medium">
              hello@remotejobs44.com
            </a>
          </p>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <a
              href="https://facebook.com/remotejobs44"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="RemoteJobs44 on Facebook"
              className="w-9 h-9 flex items-center justify-center rounded-full border border-stone-200 dark:border-[#1e3a5f] text-stone-500 dark:text-stone-400 hover:border-brand-600 hover:text-brand-700 dark:hover:text-brand-400 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </a>
            <a
              href="https://instagram.com/remotejobs_44"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="RemoteJobs44 on Instagram"
              className="w-9 h-9 flex items-center justify-center rounded-full border border-stone-200 dark:border-[#1e3a5f] text-stone-500 dark:text-stone-400 hover:border-brand-600 hover:text-brand-700 dark:hover:text-brand-400 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
              </svg>
            </a>
            <a
              href="https://wa.me/2349169582776"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Chat with RemoteJobs44 on WhatsApp"
              className="w-9 h-9 flex items-center justify-center rounded-full border border-stone-200 dark:border-[#1e3a5f] text-stone-500 dark:text-stone-400 hover:border-brand-600 hover:text-brand-700 dark:hover:text-brand-400 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </a>
          </div>
        </div>

        {/* Stats — honest, directional copy (real numbers live on /about). */}
        <div className="flex items-center justify-center gap-8 sm:gap-12 flex-wrap pt-6 border-t border-stone-200 dark:border-[#1e3a5f] w-full max-w-lg">
          {HERO_STATS.map(s => (
            <div key={s.label} className="text-center">
              <div className="font-display font-extrabold text-2xl text-stone-900 dark:text-stone-100">{s.value}</div>
              <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
