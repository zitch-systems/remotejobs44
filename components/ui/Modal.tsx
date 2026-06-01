'use client';
// components/ui/Modal.tsx — Custom modal (not Radix Dialog, so no DialogTitle warning)
import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalContextType {
  open: (content: ReactNode, opts?: { wide?: boolean; title?: string }) => void;
  close: () => void;
}

const ModalContext = createContext<ModalContextType>({ open: () => {}, close: () => {} });
export function useModal() { return useContext(ModalContext); }

// Singleton service for imperative usage: modalService.open(<Component />)
let _open: ModalContextType['open'] = () => {};
let _close: ModalContextType['close'] = () => {};
export const modalService = {
  open: (c: ReactNode, o?: { wide?: boolean; title?: string }) => _open(c, o),
  close: () => _close(),
};

export function ModalRoot() {
  const [state, setState] = useState<{ content: ReactNode; wide: boolean; title?: string } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const open = useCallback((content: ReactNode, opts: { wide?: boolean; title?: string } = {}) => {
    setState({ content, wide: opts.wide ?? false, title: opts.title });
    document.body.style.overflow = 'hidden';
  }, []);

  const close = useCallback(() => {
    setState(null);
    document.body.style.overflow = '';
  }, []);

  // Focus management + keyboard handling while open:
  //   * move focus into the dialog on open (the panel is tabIndex=-1),
  //   * close on Escape,
  //   * trap Tab so keyboard users can't wander onto the page behind the
  //     aria-hidden backdrop,
  //   * restore focus to whatever was focused before, on close.
  useEffect(() => {
    if (!state) return;
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panel?.focus();

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab' || !panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter(el => el.offsetParent !== null);
      if (focusable.length === 0) { e.preventDefault(); panel.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault(); first.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      // Return focus to the trigger (or wherever it was) on close.
      previouslyFocused?.focus?.();
    };
  }, [state, close]);

  // Wire the module-scope modalService refs to the live callbacks AFTER
  // the render commits. Doing this during render was the
  // react-hooks/globals lint error in eslint-config-next 16 — it's a
  // genuine anti-pattern even outside React Compiler. On unmount,
  // restore the no-op fallbacks so a stray modalService.open() in a
  // race condition doesn't call into stale state setters.
  useEffect(() => {
    _open = open;
    _close = close;
    return () => {
      _open = () => {};
      _close = () => {};
    };
  }, [open, close]);

  if (!state) return null;

  const modalId = 'modal-title';

  return (
    <ModalContext.Provider value={{ open, close }}>
      {/* Backdrop */}
      <div
        role="presentation"
        onClick={close}
        className="fixed inset-0 z-[400] bg-black/50 backdrop-blur-sm animate-fade-in"
        aria-hidden="true"
      />
      {/* Panel — uses role=dialog with proper aria labels */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={state.title ? modalId : undefined}
        className="fixed inset-0 z-[401] flex items-center justify-center p-4 pointer-events-none"
      >
        <div ref={panelRef} tabIndex={-1} className={cn(
          'relative bg-white dark:bg-[#0d1a2e] rounded-2xl shadow-2xl w-full max-h-[90dvh] overflow-y-auto animate-modal-in pointer-events-auto outline-none',
          state.wide ? 'max-w-2xl' : 'max-w-lg'
        )}>
          {/* Visually hidden title for screen readers if no explicit title */}
          {!state.title && (
            <span className="sr-only" id={modalId}>Dialog</span>
          )}
          {state.title && (
            <h2 id={modalId} className="sr-only">{state.title}</h2>
          )}

          {/* Close button */}
          <button
            onClick={close}
            aria-label="Close dialog"
            className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-stone-100 dark:bg-[#1e3a5f] text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-[#2d5240] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {state.content}
        </div>
      </div>
    </ModalContext.Provider>
  );
}
