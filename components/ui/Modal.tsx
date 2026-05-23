'use client';
// components/ui/Modal.tsx — Custom modal (not Radix Dialog, so no DialogTitle warning)
import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
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

  const open = useCallback((content: ReactNode, opts: { wide?: boolean; title?: string } = {}) => {
    setState({ content, wide: opts.wide ?? false, title: opts.title });
    document.body.style.overflow = 'hidden';
  }, []);

  const close = useCallback(() => {
    setState(null);
    document.body.style.overflow = '';
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!state) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state, close]);

  _open = open;
  _close = close;

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
        <div className={cn(
          'relative bg-white dark:bg-[#0d1a2e] rounded-2xl shadow-2xl w-full max-h-[90dvh] overflow-y-auto animate-modal-in pointer-events-auto',
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
