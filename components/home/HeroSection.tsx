'use client';
import Link from 'next/link';
import { Search, ArrowRight, LogIn, UserPlus } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';

// Extend WindowEventMap for beforeinstallprompt
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

const STATS = [
  { value: '50,000+', label: 'Active Jobs'  },
  { value: '8,000+',  label: 'Companies'    },
  { value: '190+',    label: 'Countries'    },
];

const POPULAR = ['React', 'Python', 'Design', 'Marketing', 'Finance', 'DevOps', 'Product'];

export function HeroSection() {
  const router = useRouter();
  const { user } = useAuthStore();
  // Default to unauthed during hydration. Landing-page visitors are
  // overwhelmingly NOT logged in — gating Sign Up / Log In behind a
  // confirmed sync meant unauthed visitors saw "Browse Jobs / View Plans"
  // until Zustand hydrated, hiding the primary conversion CTAs entirely.
  // Brief flicker for the smaller authed-user cohort is the right trade.
  const isUnauthed = !user;
  const [q, setQ] = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua);
    const standalone = ('standalone' in navigator) && (navigator as { standalone?: boolean }).standalone === true;
    setIsIos(ios && !standalone);

    function onBeforeInstall(e: BeforeInstallPromptEvent) {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstall(true);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', () => {
      setShowInstall(false);
      setDeferredPrompt(null);
    });
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall as EventListener);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstall(false);
      setDeferredPrompt(null);
    }
  }

  function search(term?: string) {
    const val = (term ?? q).trim();
    router.push(val ? `/jobs?q=${encodeURIComponent(val)}` : '/jobs');
  }

  return (
    <section className="relative overflow-hidden hero-glow pt-6 pb-12 sm:pt-8 sm:pb-14">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-5 flex flex-col items-center text-center gap-6">

        {/* Eyebrow */}
        <div className="animate-fade-in inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-bold uppercase tracking-widest"
          style={{ background:'rgba(37,99,235,0.08)', borderColor:'rgba(37,99,235,0.25)', color:'#2563eb' }}>
          🌍 50,000+ remote jobs worldwide
        </div>

        {/* Headline */}
        <h1 className="font-display font-extrabold tracking-tight text-stone-900 dark:text-stone-100 text-balance animate-slide-up"
          style={{ fontSize:'clamp(2rem,6vw,3.75rem)', lineHeight:1.08, maxWidth:'900px' }}>
          Your next remote job{' '}
          <span className="text-highlight">starts here</span>
        </h1>

        <p className="text-stone-500 dark:text-stone-400 max-w-lg leading-relaxed"
          style={{ fontSize:'clamp(1rem,2vw,1.1rem)' }}>
          Connect with top companies hiring remotely across engineering, design, marketing and more.
          Day pass from <span className="font-bold text-brand-700 dark:text-brand-400">₦500</span>{' '}
          (10 applications) or go Pro for unlimited access.
        </p>

        {/* Search bar */}
        <div className="w-full max-w-2xl">
          <div className="flex flex-col sm:flex-row gap-2 p-2 bg-white dark:bg-[#0a1628] rounded-2xl border border-stone-200 dark:border-[#1e3a5f] shadow-md-brand focus-within:border-brand-500 dark:focus-within:border-brand-600 focus-within:shadow-glow transition-all duration-200">
            <div className="flex items-center gap-3 flex-1 px-3">
              <Search className="w-4 h-4 text-stone-400 shrink-0" />
              <input
                type="text" value={q} onChange={e => setQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && search()}
                placeholder="Job title, skill, or company…"
                className="flex-1 bg-transparent border-none outline-none text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 py-2"
              />
            </div>
            <button onClick={() => search()}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-brand-700 dark:bg-brand-600 text-white text-sm font-bold rounded-xl hover:bg-brand-800 transition-colors shrink-0">
              <Search className="w-4 h-4" /> Search Jobs
            </button>
          </div>

          {/* Popular searches */}
          <div className="flex items-center gap-2 mt-3 flex-wrap justify-center">
            <span className="text-xs text-stone-400 dark:text-stone-500">Popular:</span>
            {POPULAR.map(term => (
              <button key={term} onClick={() => search(term)}
                className="text-xs px-2.5 py-1 rounded-full bg-stone-100 dark:bg-[#0a1628] border border-stone-200 dark:border-[#1e3a5f] text-stone-500 dark:text-stone-400 hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-400 transition-all">
                {term}
              </button>
            ))}
          </div>
        </div>

        {/* CTAs */}
        <div className="flex gap-3 flex-wrap justify-center">
          {isUnauthed ? (
            <>
              <Link href="/register"
                className="flex items-center gap-2 px-7 py-3.5 bg-brand-700 dark:bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-800 transition-colors text-sm shadow-md-brand">
                <UserPlus className="w-4 h-4" /> Get Started Free <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/login"
                className="flex items-center gap-2 px-7 py-3.5 border border-stone-200 dark:border-[#1e3a5f] text-stone-600 dark:text-stone-300 font-bold rounded-xl hover:bg-stone-50 dark:hover:bg-[#0a1628] transition-colors text-sm">
                <LogIn className="w-4 h-4" /> Log In
              </Link>
            </>
          ) : (
            <>
              <Link href="/jobs"
                className="flex items-center gap-2 px-7 py-3.5 bg-brand-700 dark:bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-800 transition-colors text-sm shadow-md-brand">
                Browse All Jobs <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/pricing"
                className="flex items-center gap-2 px-7 py-3.5 border border-stone-200 dark:border-[#1e3a5f] text-stone-600 dark:text-stone-300 font-bold rounded-xl hover:bg-stone-50 dark:hover:bg-[#0a1628] transition-colors text-sm">
                View Plans
              </Link>
            </>
          )}
        </div>

        {/* Install icons — quiet platform badges below the main CTAs. No
            popup tooltip; iOS users get inline instructions below the row
            so the affordance is always discoverable without a click. */}
        {(showInstall || isIos) && (
          <div className="flex flex-col items-center gap-2 -mt-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-400 dark:text-stone-500">Install:</span>
              {showInstall && (
                <button
                  onClick={handleInstall}
                  aria-label="Install RemoteJobs44 app"
                  title="Install app"
                  className="w-9 h-9 flex items-center justify-center rounded-full border border-stone-200 dark:border-[#1e3a5f] text-stone-500 dark:text-stone-400 hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-400 transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                    <path d="M3 20.5v-17C3 2.12 4.12 1 5.5 1S8 2.12 8 3.5v17l-2.5-1.5L3 20.5zm12.5-19L12 4l-3.5-2.5L7 3l5 3.5L17 3l-1.5-1.5zm6 17v-17c0-1.38-1.12-2.5-2.5-2.5S16.5 2.12 16.5 3.5v17l2.5-1.5 2.5 1.5z"/>
                  </svg>
                </button>
              )}
              {isIos && (
                <a
                  href="#ios-install"
                  aria-label="Install on iOS — instructions below"
                  title="Add to home screen"
                  className="w-9 h-9 flex items-center justify-center rounded-full border border-stone-200 dark:border-[#1e3a5f] text-stone-500 dark:text-stone-400 hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-400 transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                </a>
              )}
            </div>
            {isIos && (
              <p id="ios-install" className="text-[11px] text-stone-400 dark:text-stone-500 max-w-xs text-center leading-relaxed">
                Tap <span className="font-semibold text-brand-700 dark:text-brand-400">Share</span> in Safari, then <span className="font-semibold text-brand-700 dark:text-brand-400">&ldquo;Add to Home Screen&rdquo;</span>.
              </p>
            )}
          </div>
        )}

        {/* Support email + Instagram follow chip */}
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
              href="https://instagram.com/remotejob_44"
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

        {/* Stats */}
        <div className="flex items-center justify-center gap-8 sm:gap-12 flex-wrap pt-6 border-t border-stone-200 dark:border-[#1e3a5f] w-full max-w-lg">
          {STATS.map(s => (
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
