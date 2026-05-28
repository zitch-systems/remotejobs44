'use client';
// components/home/HeroInstallButton.tsx
//
// PWA-install affordance. Browsers fire `beforeinstallprompt` when
// the site qualifies; iOS Safari never fires it but Add-to-Home-Screen
// is available through the share menu, so we surface inline
// instructions for iOS instead. Hidden entirely when neither path
// applies (most desktop sessions).
import { useEffect, useState } from 'react';

// Subset of the standard BeforeInstallPromptEvent that we actually use.
// Declared locally rather than via `WindowEventMap` augmentation so it
// doesn't leak global types when other client modules import this.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms:  string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export function HeroInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall,    setShowInstall]    = useState(false);
  const [isIos,          setIsIos]          = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua);
    const standalone = ('standalone' in navigator) && (navigator as { standalone?: boolean }).standalone === true;
    setIsIos(ios && !standalone);

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      const evt = e as BeforeInstallPromptEvent;
      setDeferredPrompt(evt);
      setShowInstall(true);
    }
    function onAppInstalled() {
      setShowInstall(false);
      setDeferredPrompt(null);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
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

  if (!showInstall && !isIos) return null;

  return (
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
  );
}
