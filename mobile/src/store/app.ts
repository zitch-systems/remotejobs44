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

interface AppState {
  userId: string | null;
  saved: string[];
  applied: Record<string, AppStatus>;
  /** True once the signed-in user's saved/applied rows have loaded from the
   *  server. The free-trial gate waits on this so it can't read `applied` as
   *  empty (and wrongly offer a free apply) during the post-sign-in window. */
  hydrated: boolean;

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
  // Demo mode has its data up front; a configured build hydrates on sign-in.
  hydrated: !isSupabaseConfigured,

  isSaved: (id) => get().saved.includes(id),
  isApplied: (id) => id in get().applied,

  setUserId: (id) => set({ userId: id }),
  hydrate: ({ saved, applied }) => set({ saved, applied, hydrated: true }),

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
    // The free-trial allowance is measured against the size of `applied`, so
    // optimistically adding the row here both updates the tracker and consumes
    // one trial slot; a rollback below frees it again. No separate counter.
    set((s) => ({ applied: { ...s.applied, [job.id]: 'applied' } }));
    const { userId } = get();
    if (isSupabaseConfigured && userId) {
      applyRemote(userId, job).catch((e) => {
        captureError(e, { scope: 'applyTo', id: job.id });
        // Roll back the optimistic apply, and tell the user it didn't go
        // through (otherwise "Application sent" shows, then vanishes).
        set((s) => {
          const next = { ...s.applied };
          delete next[job.id];
          return { applied: next };
        });
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

  reset: () => set({ saved: [], applied: {}, userId: null, hydrated: !isSupabaseConfigured }),
}));
