'use client';
import Link from 'next/link';
import { Search, ArrowRight, ArrowDownToLine, LogIn, UserPlus } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
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
  const { user, hydrated } = useAuthStore();
  // Treat as unauthed only AFTER a confirmed sync; before that, show a
  // neutral primary CTA so we don't briefly flash "Get Started" to a
  // logged-in user (or vice versa).
  const isUnauthed = hydrated && !user;
  const [q, setQ] = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosTooltip, setShowIosTooltip] = useState(false);
  const iosTooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Detect iOS
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua);
    const standalone = ('standalone' in navigator) && (navigator as { standalone?: boolean }).standalone === true;
    setIsIos(ios && !standalone);

    // Listen for PWA install prompt (Chrome/Edge on Android & Desktop)
    function onBeforeInstall(e: BeforeInstallPromptEvent) {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstall(true);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // Hide if already installed
    window.addEventListener('appinstalled', () => {
      setShowInstall(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall as EventListener);
    };
  }, []);

  // Close iOS tooltip when clicking outside
  useEffect(() => {
    if (!showIosTooltip) return;
    function handleOutside(e: MouseEvent) {
      if (iosTooltipRef.current && !iosTooltipRef.current.contains(e.target as Node)) {
        setShowIosTooltip(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showIosTooltip]);

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
          Day pass from <span className="font-bold text-brand-700 dark:text-brand-400">₦1,000</span>{' '}
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
          {/* PWA Install button — shown only when browser supports it and app isn't installed */}
          {showInstall && (
            <button
              onClick={handleInstall}
              className="flex items-center gap-2 px-7 py-3.5 border border-stone-200 dark:border-[#1e3a5f] text-stone-600 dark:text-stone-300 font-bold rounded-xl hover:bg-stone-50 dark:hover:bg-[#0a1628] transition-colors text-sm">
              <ArrowDownToLine className="w-4 h-4" /> Install App
            </button>
          )}
          {/* iOS install hint */}
          {isIos && (
            <div className="relative" ref={iosTooltipRef}>
              <button
                onClick={() => setShowIosTooltip(v => !v)}
                className="flex items-center gap-2 px-7 py-3.5 border border-stone-200 dark:border-[#1e3a5f] text-stone-600 dark:text-stone-300 font-bold rounded-xl hover:bg-stone-50 dark:hover:bg-[#0a1628] transition-colors text-sm">
                <ArrowDownToLine className="w-4 h-4" /> Install App
              </button>
              {showIosTooltip && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-50 w-64 bg-white dark:bg-[#0a1628] border border-stone-200 dark:border-[#1e3a5f] rounded-xl shadow-lg p-4 text-left">
                  {/* Arrow */}
                  <div className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-4 h-4 bg-white dark:bg-[#0a1628] border-r border-b border-stone-200 dark:border-[#1e3a5f] rotate-45" />
                  <p className="text-xs font-bold text-stone-900 dark:text-stone-100 mb-1">📲 Add to Home Screen</p>
                  <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                    Tap the <span className="font-bold text-brand-700 dark:text-brand-400">Share</span> button in Safari, then choose <span className="font-bold text-brand-700 dark:text-brand-400">&quot;Add to Home Screen&quot;</span> to install this app.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* iOS add-to-homescreen chip (always visible on iOS, below CTA row) */}
        {isIos && (
          <button
            onClick={() => setShowIosTooltip(v => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-400 dark:text-stone-500 hover:text-brand-700 dark:hover:text-brand-400 transition-colors -mt-2">
            📲 Add to home screen
          </button>
        )}

        {/* Support email */}
        <p className="text-xs text-stone-400 dark:text-stone-500 -mt-2">
          Need help?{' '}
          <a href="mailto:hello@remotejobs44.com" className="text-brand-700 dark:text-brand-400 hover:underline font-medium">
            hello@remotejobs44.com
          </a>
        </p>

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
