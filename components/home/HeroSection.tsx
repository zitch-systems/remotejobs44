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

// Hero stat row. Kept static so the homepage LCP path doesn't pay a DB
// hit; the exact, live-counted figures live on /about.
const HERO_STATS = [
  { value: '70k+',   label: 'Jobs worldwide'   },
  { value: 'Daily',  label: 'Fresh listings'   },
  { value: 'Global', label: 'Companies hiring' },
];

export function HeroSection() {
  return (
    <section className="relative overflow-hidden hero-glow pt-6 pb-12 sm:pt-8 sm:pb-14">
      {/* Decorative depth layers — purely visual, behind the content. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hero-grid" />
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="hero-orb animate-float-a" style={{ width: 340, height: 340, top: -70, left: -50, background: 'radial-gradient(circle at 30% 30%, rgba(37,99,235,0.55), transparent 70%)' }} />
        <div className="hero-orb animate-float-b" style={{ width: 300, height: 300, top: 10, right: -60, background: 'radial-gradient(circle at 30% 30%, rgba(249,115,22,0.42), transparent 70%)' }} />
        <div className="hero-orb animate-float-a" style={{ width: 260, height: 260, bottom: -90, left: '42%', background: 'radial-gradient(circle at 30% 30%, rgba(96,165,250,0.45), transparent 70%)' }} />
      </div>

      {/* Floating 3D shapes — continuous perspective rotation/tilt (sm+ only to
          keep small screens uncluttered). */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden hidden sm:block">
        <div className="shape-3d anim-float3d" style={{ top: '15%', left: '6%', width: 66, height: 66, borderRadius: 18, background: 'linear-gradient(135deg,#3b82f6,#1e40af)', boxShadow: '0 20px 44px -10px rgba(37,99,235,0.55)' }} />
        <div className="shape-3d anim-spin3d" style={{ top: '22%', right: '8%', width: 54, height: 54, borderRadius: 15, background: 'linear-gradient(135deg,#fb923c,#ea580c)', boxShadow: '0 20px 44px -10px rgba(249,115,22,0.55)' }} />
        <div className="shape-3d anim-float3d" style={{ bottom: '14%', left: '13%', width: 46, height: 46, borderRadius: 13, background: 'linear-gradient(135deg,#60a5fa,#2563eb)', boxShadow: '0 16px 34px -8px rgba(37,99,235,0.5)', animationDelay: '1.5s' }} />
        <div className="shape-3d anim-spin3d" style={{ bottom: '20%', right: '12%', width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#93c5fd,#3b82f6)', boxShadow: '0 16px 34px -8px rgba(37,99,235,0.5)', animationDelay: '2s' }} />
      </div>

      <div className="relative z-10 max-w-[1440px] mx-auto px-4 sm:px-5 flex flex-col items-center text-center gap-6">

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
        <h1 className="font-display font-extrabold text-display-1 text-stone-900 dark:text-stone-100 text-balance animate-slide-up max-w-[900px]">
          Your next remote job{' '}
          <Link href="/register"
            className="text-highlight hover:underline focus:outline-none focus:underline transition-all"
            aria-label="Create your free account to start applying">
            starts here
          </Link>
        </h1>

        {/* LCP element — server-rendered so it lands without waiting for JS. */}
        <p className="text-fluid-lead text-stone-500 dark:text-stone-400 max-w-lg">
          Search over <span className="font-bold text-brand-700 dark:text-brand-400">70,000+</span> remote jobs
          from top companies hiring worldwide — across engineering, design, marketing and more.
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

        {/* Support email + social moved to the page bottom (footer on desktop,
            <MobileHelpSocial /> on mobile). */}

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
