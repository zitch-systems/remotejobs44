'use client';
// components/home/HeroInstallButton.tsx
//
// PWA install affordances for the three platforms users actually run on:
//   * Android Chrome — fires `beforeinstallprompt`; tap triggers the
//     real native install dialog.
//   * iOS Safari      — never fires the event (Apple choice), so we
//     surface the Add-to-Home-Screen instructions inline.
//   * Desktop Chrome/Edge — same `beforeinstallprompt` flow as Android.
//
// Behaviour:
//   * All three icons always render once the page mounts so users can
//     see the install options even before the browser decides whether
//     this session qualifies.
//   * The button matching the user's CURRENT device is highlighted so
//     they know which one to tap.
//   * Tapping a button:
//       - matching, prompt available → fires the native install.
//       - matching iOS              → scrolls to the inline tip.
//       - non-matching              → shows a toast telling them
//         which browser/device to open the site in.
//   * Hidden entirely once the app is already running standalone
//     (display-mode: standalone) so installed users don't see a
//     "Install" row mocking them.
import { useEffect, useState } from 'react';
import { Monitor } from 'lucide-react';
import { useUIStore } from '@/lib/store';

// Subset of the standard BeforeInstallPromptEvent that we actually use.
// Declared locally rather than via `WindowEventMap` augmentation so it
// doesn't leak global types when other client modules import this.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms:  string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

type Platform = 'android' | 'ios' | 'desktop';

// Per-platform glyphs. Apple + Android use inline SVGs because Lucide
// doesn't ship platform brand marks; Desktop uses Lucide Monitor.
function AppleGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}
function AndroidGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
      <path d="M17.6 9.48l1.84-3.18a.4.4 0 00-.69-.4l-1.86 3.22a11.4 11.4 0 00-9.78 0L5.25 5.9a.4.4 0 10-.69.4L6.4 9.48A10.4 10.4 0 00.96 18h22.08a10.4 10.4 0 00-5.44-8.52zM7 15.25a1.05 1.05 0 110-2.1 1.05 1.05 0 010 2.1zm10 0a1.05 1.05 0 110-2.1 1.05 1.05 0 010 2.1z" />
    </svg>
  );
}

export function HeroInstallButton() {
  const { toast } = useUIStore();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [detected, setDetected] = useState<Platform>('desktop');
  // Default VISIBLE: the install row ships in the server HTML, and the
  // standalone check (only knowable client-side) hides it after mount for
  // the small already-installed cohort. The previous default of `true`
  // (render nothing until mounted) inserted a ~50px row into the middle
  // of the hero on EVERY homepage view, shifting the chips/stats/sections
  // below it after first paint — a recurring CLS hit on the highest-
  // traffic route. A brief flash-then-hide for standalone users is the
  // far cheaper side of that trade.
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    // iPadOS 13+ defaults to the Macintosh UA so /iphone|ipad|ipod/
    // misses iPads on Safari — those users would see "Desktop"
    // highlighted instead of "iOS" and the wrong toast on click.
    // Touch-points >1 on a Mac UA reliably means iPad.
    const ios =
      /iphone|ipad|ipod/i.test(ua) ||
      (/Macintosh/.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1);
    const android = /android/i.test(ua);
    // iOS Safari uses navigator.standalone; other browsers expose it via
    // the display-mode media query. Either signal means the app is
    // already running as a PWA and we shouldn't pitch the install row.
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

  async function triggerNativePrompt() {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setHidden(true);
    }
    return true;
  }

  function handleClick(target: Platform) {
    if (target === detected) {
      if (target === 'ios') {
        // Inline tip is rendered below; scroll/focus it.
        document.getElementById('ios-install')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      // android | desktop → try the native prompt. If the browser hasn't
      // fired it yet (engagement heuristic, dismissed previously, or a
      // non-Chromium browser) tell the user what's missing.
      triggerNativePrompt().then(fired => {
        if (!fired) {
          toast(
            target === 'desktop'
              ? 'Open this page in Chrome or Edge and click the install icon in the address bar.'
              : 'Open this page in Chrome on Android — tap the menu and choose “Install app”.',
            'info',
            6000,
          );
        }
      });
      return;
    }
    // Non-matching button — point the user at the right device.
    const hint =
      target === 'android' ? 'Open remotejobs44.com on an Android phone in Chrome to install.'
      : target === 'ios'   ? 'Open remotejobs44.com on an iPhone or iPad in Safari to install.'
      :                      'Open remotejobs44.com on a desktop browser (Chrome or Edge) to install.';
    toast(hint, 'info', 6000);
  }

  if (hidden) return null;

  const buttons: Array<{
    id: Platform;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: 'android', label: 'Android', icon: <AndroidGlyph /> },
    { id: 'ios',     label: 'iOS',     icon: <AppleGlyph /> },
    { id: 'desktop', label: 'Desktop', icon: <Monitor className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col items-center gap-2 -mt-1">
      <div className="flex items-center gap-2 flex-wrap justify-center">
        <span className="text-xs text-stone-400 dark:text-stone-500">Install:</span>
        {buttons.map(b => {
          const isCurrent = b.id === detected;
          return (
            <button
              key={b.id}
              onClick={() => handleClick(b.id)}
              aria-label={`Install RemoteJobs44 on ${b.label}${isCurrent ? ' (your device)' : ''}`}
              title={`Install on ${b.label}${isCurrent ? ' — your device' : ''}`}
              className={
                'flex items-center gap-1.5 h-9 px-3 rounded-full border text-xs font-semibold transition-colors ' +
                (isCurrent
                  ? 'border-brand-600 text-brand-700 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20'
                  : 'border-stone-200 dark:border-[#1e3a5f] text-stone-500 dark:text-stone-400 hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-400')
              }
            >
              {b.icon}
              <span>{b.label}</span>
            </button>
          );
        })}
      </div>
      {detected === 'ios' && (
        <p id="ios-install" className="text-[11px] text-stone-400 dark:text-stone-500 max-w-xs text-center leading-relaxed">
          Tap <span className="font-semibold text-brand-700 dark:text-brand-400">Share</span> in Safari, then <span className="font-semibold text-brand-700 dark:text-brand-400">&ldquo;Add to Home Screen&rdquo;</span>.
        </p>
      )}
    </div>
  );
}
