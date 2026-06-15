// src/store/toast.ts — a tiny global toast queue (one at a time). Call toast()
// from anywhere; <Toaster> (mounted in the root layout) renders it.
import { create } from 'zustand';

export type ToastVariant = 'default' | 'success' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastState {
  current: ToastItem | null;
  show: (message: string, variant?: ToastVariant) => void;
  hide: () => void;
}

let seq = 0;

export const useToastStore = create<ToastState>((set) => ({
  current: null,
  show: (message, variant = 'default') => set({ current: { id: ++seq, message, variant } }),
  hide: () => set({ current: null }),
}));

/** Imperative helper usable outside React (stores, utils). */
export function toast(message: string, variant?: ToastVariant): void {
  useToastStore.getState().show(message, variant);
}
