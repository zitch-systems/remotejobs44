// src/store/app.ts — client state for saved + applied jobs.
// Demo mode (no backend) is seeded from the handoff; live mode starts empty
// and hydrates from Supabase on sign-in, with optimistic write-through on
// every mutation.
import { create } from 'zustand';
import { type AppStatus, type Job, STATUS_LABEL } from '@/lib/types';
import { SEED_APPLIED, SEED_SAVED } from '@/lib/seed';
import { isSupabaseConfigured } from '@/lib/supabase';
import { applyRemote, setSavedRemote, updateApplicationStatus } from '@/lib/user-state';
import { captureError } from '@/lib/sentry';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { toast } from '@/store/toast';
import { useUsage } from '@/store/usage';

interface AppState {
  userId: string | null;
  saved: string[];
  applied: Record<string, AppStatus>;

  isSaved: (id: string) => boolean;
  isApplied: (id: string) => boolean;

  setUserId: (id: string | null) => void;
  hydrate: (data: { saved: string[]; applied: Record<string, AppStatus> }) => void;
  toggleSaved: (id: string) => void;
  applyTo: (job: Job) => void;
  /** Move an existing application to a new status (optimistic + write-through). */
  updateStatus: (jobId: string, status: AppStatus) => void;
  /** Reset to a clean slate (sign-out). */
  reset: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  userId: null,
  // Seed only in demo mode; a real signed-in user starts from their own rows.
  saved: isSupabaseConfigured ? [] : [...SEED_SAVED],
  applied: isSupabaseConfigured ? {} : { ...SEED_APPLIED },

  isSaved: (id) => get().saved.includes(id),
  isApplied: (id) => id in get().applied,

  setUserId: (id) => set({ userId: id }),
  hydrate: ({ saved, applied }) => set({ saved, applied }),

  toggleSaved: (id) => {
    const willSave = !get().saved.includes(id);
    tapLight();
    toast(willSave ? 'Saved' : 'Removed from saved');
    // Optimistic local update.
    set((s) => ({ saved: willSave ? [...s.saved, id] : s.saved.filter((x) => x !== id) }));
    const { userId } = get();
    if (isSupabaseConfigured && userId) {
      setSavedRemote(userId, id, willSave).catch((e) => {
        captureError(e, { scope: 'toggleSaved', id });
        // Roll back on failure.
        set((s) => ({ saved: willSave ? s.saved.filter((x) => x !== id) : [...s.saved, id] }));
      });
    }
  },

  applyTo: (job) => {
    if (job.id in get().applied) return; // already applied — don't double-count
    notifySuccess();
    toast('Application sent', 'success');
    set((s) => ({ applied: { ...s.applied, [job.id]: 'applied' } }));
    // Count the application here (exactly when a new one is created), so the
    // daily limit can't be over-counted by re-taps or rolled-back failures.
    useUsage.getState().bumpApplication();
    const { userId } = get();
    if (isSupabaseConfigured && userId) {
      applyRemote(userId, job).catch((e) => {
        captureError(e, { scope: 'applyTo', id: job.id });
        // Roll back the optimistic apply + the count, and tell the user it
        // didn't go through (otherwise "Application sent" shows, then vanishes).
        set((s) => {
          const next = { ...s.applied };
          delete next[job.id];
          return { applied: next };
        });
        useUsage.getState().unbumpApplication();
        toast("Couldn't send your application. Please try again.", 'error');
      });
    }
  },

  updateStatus: (jobId, status) => {
    const prev = get().applied[jobId];
    if (prev === undefined || prev === status) return;
    tapLight();
    toast(`Marked as ${STATUS_LABEL[status].toLowerCase()}`, 'success');
    set((s) => ({ applied: { ...s.applied, [jobId]: status } }));
    const { userId } = get();
    if (isSupabaseConfigured && userId) {
      updateApplicationStatus(userId, jobId, status).catch((e) => {
        captureError(e, { scope: 'updateStatus', id: jobId });
        // Roll back on failure.
        set((s) => ({ applied: { ...s.applied, [jobId]: prev } }));
      });
    }
  },

  reset: () => set({ saved: [], applied: {}, userId: null }),
}));
