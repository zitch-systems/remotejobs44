'use client';
// components/ui/PWAInstall.tsx
// PWA install prompt — shown ONLY on the landing page (pathname === '/')
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { X, ArrowDownToLine } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstall() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow]       = useState(false);
  const [isIOS, setIsIOS]     = useState(false);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform]   = useState<'android' | 'ios' | 'desktop' | null>(null);

  useEffect(() => {
    // Only activate on the home page
    if (pathname !== '/') return;

    // Already installed as PWA — do nothing
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
      return;
    }
    // User already dismissed
    if (localStorage.getItem('pwa-dismissed')) return;

    const ua        = navigator.userAgent;
    const iosDevice = /iPhone|iPad|iPod/.test(ua) && !(window as any).MSStream;
    const android   = /Android/.test(ua);

    setIsIOS(iosDevice);
    setPlatform(iosDevice ? 'ios' : android ? 'android' : 'desktop');

    if (iosDevice) {
      // iOS Safari cannot fire beforeinstallprompt — show manual instructions
      const t = setTimeout(() => setShow(true), 4000);
      return () => clearTimeout(t);
    }

    // Android / Desktop: capture the native browser prompt event
    const handler = (e: Event) => {
      // Prevent the mini-infobar so we can show our own UI
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show our banner after a short delay so the page has settled
      const t = setTimeout(() => setShow(true), 4000);
      return () => clearTimeout(t);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [pathname]);

  async function handleInstall() {
    if (deferredPrompt) {
      // This is the required call — must happen from a user gesture
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setInstalled(true);
      setDeferredPrompt(null);
    }
    setShow(false);
  }

  function dismiss() {
    setShow(false);
    localStorage.setItem('pwa-dismissed', '1');
  }

  if (pathname !== '/' || !show || installed) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-[22rem] z-[600] animate-slide-up">
      <div className="bg-white dark:bg-[#0a1628] border border-stone-200 dark:border-[#1e3a5f] rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-stone-100 dark:border-[#1e3a5f]">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center shrink-0 shadow-md">
            <svg viewBox="0 0 32 32" className="w-6 h-6" fill="none" aria-hidden="true">
              <rect width="32" height="32" rx="8" fill="#2563eb"/>
              <path d="M8 20 Q12 10 16 16 Q20 22 23 12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              <circle cx="23" cy="12" r="2.5" fill="#f97316"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-stone-900 dark:text-stone-100 truncate">Install RemoteJobs44</p>
            <p className="text-xs text-stone-400 dark:text-stone-500">
              {platform === 'ios'     ? 'Add to Home Screen'   :
               platform === 'android' ? 'Add to your Android'  :
                                        'Install desktop app'}
            </p>
          </div>
          <button
            onClick={dismiss}
            className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 dark:hover:bg-[#1e3a5f] transition-colors shrink-0"
            aria-label="Dismiss install banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          {isIOS ? (
            <ol className="space-y-2.5">
              <p className="text-xs text-stone-500 dark:text-stone-400 mb-2">To install on iPhone / iPad:</p>
              {[
                <>Tap the <strong>Share</strong> icon in Safari <span className="opacity-60">(box with ↑)</span></>,
                <>Scroll down and tap <strong>Add to Home Screen</strong></>,
                <>Tap <strong>Add</strong> — you're done!</>,
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-stone-600 dark:text-stone-300">
                  <span className="w-5 h-5 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-px">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          ) : (
            <>
              <p className="text-xs text-stone-500 dark:text-stone-400 mb-3">
                Instant access · Works offline · No browser chrome.
              </p>
              <button
                onClick={handleInstall}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-600 dark:bg-brand-500 text-white font-bold text-sm rounded-xl hover:bg-brand-700 active:scale-95 transition-all"
              >
                <ArrowDownToLine className="w-4 h-4" />
                Install App
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
