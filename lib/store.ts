import { createWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';

interface UIState {
  toast: (message: string, type?: 'success' | 'error') => void;
}

export const useUIStore = createWithEqualityFn<UIState>((set) => ({
  toast: (message, type = 'success') => {
    console.log(`[${type.toUpperCase()}] ${message}`);
  },
}), shallow);
