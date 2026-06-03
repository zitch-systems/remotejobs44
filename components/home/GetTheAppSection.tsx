'use client';
// components/home/GetTheAppSection.tsx
//
// "Get the app" band for the landing page — the same install affordances as
// HeroInstallButton, presented as the three-card layout (iPhone / Android /
// Desktop). Install behaviour per platform:
//   * Android / Desktop Chromium — fires `beforeinstallprompt`; the button
//     triggers the real native install dialog. If the browser hasn't offered
//     it (engagement heuristic, non-Chromium, already dismissed), we fall back
//     to the step-by-step instructions modal.
//   * iOS Safari — never fires the event (Apple's choice), so "How to install"
//     always opens the Add-to-Home-Screen steps.
// Hidden once the app is already running standalone so installed users don't
// get pitched an install they've completed.
import { useEffect, useState, useCallback } from 'react';
import { Monitor, Download, HelpCircle, X } from 'lucide-react';

// Subset of the standard event we actually use (declared locally so it doesn't
// leak global types to other client modules — mirrors HeroInstallButton).
interface BeforeInstallPromptEvent extends Event {
  readonly platforms:  string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

type Platform = 'android' | 'ios' | 'desktop';

function AppleGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}
function AndroidGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7" aria-hidden="true">
      <path d="M17.6 9.48l1.84-3.18a.4.4 0 00-.69-.4l-1.86 3.22a11.4 11.4 0 00-9.78 0L5.25 5.9a.4.4 0 10-.69.4L6.4 9.48A10.4 10.4 0 00.96 18h22.08a10.4 10.4 0 00-5.44-8.52zM7 15.25a1.05 1.05 0 110-2.1 1.05 1.05 0 010 2.1zm10 0a1.05 1.05 0 110-2.1 1.05 1.05 0 010 2.1z" />
    </svg>
  );
}

// Per-platform Add-to-Home-Screen steps shown in the fallback / iOS modal.
const STEPS: Record<Platform, { title: string; steps: React.ReactNode[] }> = {
  ios: {
    title: 'Install on iPhone & iPad',
    steps: [
      <>Open <strong>remotejobs44.com</strong> in <strong>Safari</strong>.</>,
      <>Tap the <strong>Share</strong> icon <span className="opacity-60">(box with ↑)</span>.</>,
      <>Scroll down and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</>,
    ],
  },
  android: {
    title: 'Install on Android',
    steps: [
      <>Open <strong>remotejobs44.com</strong> in <strong>Chrome</strong>.</>,
      <>Tap the <strong>⋮</strong> menu (top-right).</>,
      <>Tap <strong>Install app</strong> / <strong>Add to Home screen</strong>.</>,
    ],
  },
  desktop: {
    title: 'Install on Desktop',
    steps: [
      <>Open <strong>remotejobs44.com</strong> in <strong>Chrome</strong> or <strong>Edge</strong>.</>,
      <>Click the <strong>install icon</strong> in the address bar <span className="opacity-60">(or ⋮ menu → Install)</span>.</>,
      <>Click <strong>Install</strong> to add it as an app.</>,
    ],
  },
};

export function GetTheAppSection() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [detected, setDetected] = useState<Platform>('desktop');
  const [hidden, setHidden]     = useState(false);
  const [instructions, setInstructions] = useState<Platform | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    // iPadOS 13+ reports a Macintosh UA, so detect it via touch points.
    const ios =
      /iphone|ipad|ipod/i.test(ua) ||
      (/Macintosh/.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1);
    const android = /android/i.test(ua);
    const standalone =
      (('standalone' in navigator) && (navigator as { standalone?: boolean }).standalone === true) ||
      window.matchMedia?.('(display-mode: standalone)').matches;

    setDetected(ios ? 'ios' : android ? 'android' : 'desktop');
    setHidden(!!standalone);

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    function onAppInstalled() {
      setDeferredPrompt(null);
      setHidden(true);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const closeModal = useCallback(() => setInstructions(null), []);
  useEffect(() => {
    if (!instructions) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [instructions, closeModal]);

  async function triggerNativePrompt(): Promise<boolean> {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setHidden(true);
    }
    return true;
  }

  function handleInstall(target: Platform) {
    // iOS can't be auto-installed — always show the steps.
    if (target === 'ios') { setInstructions('ios'); return; }
    // Android / Desktop share the same Chromium prompt. If it's been captured,
    // fire it; otherwise show the steps for the card the user tapped.
    if (deferredPrompt) {
      triggerNativePrompt().then(fired => { if (!fired) setInstructions(target); });
      return;
    }
    setInstructions(target);
  }

  if (hidden) return null;

  const cards: Array<{
    id: Platform;
    name: string;
    sub: string;
    glyph: React.ReactNode;
    glyphColor: string;
    cta: string;
    ctaIcon: React.ReactNode;
    ctaClass: string;
  }> = [
    {
      id: 'ios', name: 'iPhone & iPad', sub: 'Open in Safari · Add to Home Screen',
      glyph: <AppleGlyph />, glyphColor: 'text-stone-900',
      cta: 'How to install', ctaIcon: <HelpCircle className="w-4 h-4" />,
      ctaClass: 'bg-white text-[#13233d] hover:bg-stone-100',
    },
    {
      id: 'android', name: 'Android', sub: 'Chrome · “Add to Home Screen”',
      glyph: <AndroidGlyph />, glyphColor: 'text-[#3ddc84]',
      cta: 'Install App', ctaIcon: <Download className="w-4 h-4" />,
      ctaClass: 'bg-green-500 text-white hover:bg-green-600',
    },
    {
      id: 'desktop', name: 'Desktop', sub: 'Chrome / Edge · Install as app',
      glyph: <Monitor className="w-7 h-7" />, glyphColor: 'text-brand-600',
      cta: 'Install App', ctaIcon: <Download className="w-4 h-4" />,
      ctaClass: 'bg-white/10 text-white border border-white/15 hover:bg-white/15',
    },
  ];

  return (
    <section className="py-20 md:py-24 bg-[#13233d] dark:bg-[#0a1628] relative overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(37,99,235,0.18), transparent)' }} />
      <div className="max-w-[960px] mx-auto px-5 relative">
        {/* Heading */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/15 bg-white/5 text-[11px] font-bold uppercase tracking-widest text-white/70 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Available on all devices
          </div>
          <h2 className="font-display font-extrabold text-white tracking-tight mb-3 leading-tight"
            style={{ fontSize: 'clamp(1.9rem, 5vw, 3rem)' }}>
            Get the app
          </h2>
          <p className="text-white/60 text-base max-w-lg mx-auto leading-relaxed">
            iPhone, Android, or desktop — install straight from your browser. No App Store required.
          </p>
        </div>

        {/* Platform cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
          {cards.map(card => {
            const isCurrent = card.id === detected;
            return (
              <div key={card.id}
                className={
                  'rounded-2xl p-6 flex flex-col items-center text-center transition-colors ' +
                  (isCurrent
                    ? 'bg-white/[0.07] border border-brand-400/50 ring-1 ring-brand-400/30'
                    : 'bg-white/[0.04] border border-white/10 hover:bg-white/[0.06]')
                }>
                {isCurrent && (
                  <span className="mb-3 text-[10px] font-bold uppercase tracking-wider text-brand-300">
                    Your device
                  </span>
                )}
                <div className={`w-14 h-14 rounded-2xl bg-white flex items-center justify-center shadow-lg ${card.glyphColor} ${isCurrent ? '' : 'mt-[22px]'}`}>
                  {card.glyph}
                </div>
                <p className="mt-4 font-bold text-white text-lg">{card.name}</p>
                <p className="mt-1 text-xs text-white/50 leading-relaxed min-h-[2rem]">{card.sub}</p>
                <button
                  onClick={() => handleInstall(card.id)}
                  aria-label={`${card.cta} — RemoteJobs44 on ${card.name}`}
                  className={`mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-colors active:scale-[0.98] ${card.ctaClass}`}>
                  {card.ctaIcon}
                  {card.cta}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer line */}
        <p className="text-center text-xs text-white/40 mt-8">
          Works offline <span className="mx-1.5 text-white/25">·</span>
          No App Store <span className="mx-1.5 text-white/25">·</span>
          Free to install
        </p>
      </div>

      {/* Instructions modal — iOS always, or Android/Desktop fallback */}
      {instructions && (
        <div
          className="fixed inset-0 z-[700] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog" aria-modal="true" aria-label={STEPS[instructions].title}
          onClick={closeModal}
        >
          <div
            className="bg-white dark:bg-[#0d1a2e] border border-stone-200 dark:border-[#1e3a5f] rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="font-bold text-base text-stone-900 dark:text-stone-100">{STEPS[instructions].title}</h3>
              <button onClick={closeModal} aria-label="Close"
                className="p-1.5 -m-1.5 rounded-lg text-stone-400 hover:bg-stone-100 dark:hover:bg-[#1e3a5f] transition-colors shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <ol className="space-y-3">
              {STEPS[instructions].steps.map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-stone-600 dark:text-stone-300">
                  <span className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 flex items-center justify-center text-xs font-bold shrink-0">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
