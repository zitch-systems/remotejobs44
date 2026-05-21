'use client';
// components/ui/PWAInstall.tsx — PWA install prompt for Android, iOS, Desktop
import { useEffect, useState } from 'react';
import { Download, X, Smartphone, Monitor } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow]       = useState(false);
  const [isIOS, setIsIOS]     = useState(false);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<'android'|'ios'|'desktop'|null>(null);

  useEffect(() => {
    // Don't show if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
      return;
    }
    if (localStorage.getItem('pwa-dismissed')) return;

    // Detect platform
    const ua = navigator.userAgent;
    const iosDevice = /iPhone|iPad|iPod/.test(ua) && !(window as any).MSStream;
    const android = /Android/.test(ua);
    const desktop = !iosDevice && !android;

    setIsIOS(iosDevice);
    setPlatform(iosDevice ? 'ios' : android ? 'android' : 'desktop');

    // iOS: show manual instructions after 3s
    if (iosDevice) {
      setTimeout(() => setShow(true), 3000);
      return;
    }

    // Android/Desktop: wait for browser prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShow(true), 3000);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function handleInstall() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setInstalled(true);
    }
    setShow(false);
  }

  function dismiss() {
    setShow(false);
    localStorage.setItem('pwa-dismissed', '1');
  }

  if (!show || installed) return null;

  const platformIcons: Record<string, React.ReactNode> = {
    ios:     <Smartphone className="w-5 h-5" />,
    android: <Smartphone className="w-5 h-5" />,
    desktop: <Monitor className="w-5 h-5" />,
  };

  return (
    <div className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-[600] animate-slide-up">
      <div className="bg-white dark:bg-[#0a1628] border border-stone-200 dark:border-[#1e3a5f] rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-stone-100 dark:border-[#1e3a5f]">
          <div className="w-10 h-10 rounded-xl bg-brand-700 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 32 32" className="w-6 h-6" fill="none">
              <rect width="32" height="32" rx="8" fill="#2563eb"/>
              <path d="M8 20 Q12 10 16 16 Q20 22 23 12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              <circle cx="23" cy="12" r="2.5" fill="#f59e0b"/>
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm text-stone-900 dark:text-stone-100">Install RemoteJobs44</p>
            <p className="text-xs text-stone-400 dark:text-stone-500">
              {platform === 'ios' ? 'Add to Home Screen' :
               platform === 'android' ? 'Add to Android' : 'Install desktop app'}
            </p>
          </div>
          <button onClick={dismiss} className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 dark:hover:bg-[#1e3a5f] transition-colors" aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {isIOS ? (
            <div className="space-y-2">
              <p className="text-xs text-stone-500 dark:text-stone-400">To install on iPhone/iPad:</p>
              <div className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300">
                <span className="w-5 h-5 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
                Tap the <strong>Share</strong> button in Safari (the box with arrow)
              </div>
              <div className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300">
                <span className="w-5 h-5 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
                Scroll down and tap <strong>Add to Home Screen</strong>
              </div>
              <div className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300">
                <span className="w-5 h-5 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 flex items-center justify-center text-[10px] font-bold shrink-0">3</span>
                Tap <strong>Add</strong> — done!
              </div>
            </div>
          ) : (
            <div>
              <p className="text-xs text-stone-500 dark:text-stone-400 mb-3">
                Install for instant access, works offline, and no browser UI.
              </p>
              <button onClick={handleInstall}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-700 dark:bg-brand-500 text-white font-bold text-sm rounded-xl hover:bg-brand-600 transition-colors">
                <Download className="w-4 h-4" />
                Install App
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
