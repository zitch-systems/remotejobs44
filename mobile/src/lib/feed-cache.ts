// src/lib/feed-cache.ts — persist the last feed page so the app opens instantly
// with the previous results while fresh data loads. Best-effort; failures are
// swallowed (cache is an optimisation, never a source of truth).
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Job } from './types';

const KEY = 'rj44-feed-cache';

// Old app versions persisted real names and paid apply channels. Never hydrate
// those rows after an upgrade, sign-out, or subscription change.
function isPublicCache(value: unknown): value is Job[] {
  return Array.isArray(value) && value.every((job) =>
    job && typeof job.id === 'string' && job.company === 'Hidden Company'
    && !job.logoUrl && !job.applyUrl && !job.applyEmail,
  );
}

export async function loadFeedCache(): Promise<Job[] | null> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (!v) return null;
    const jobs: unknown = JSON.parse(v);
    if (isPublicCache(jobs)) return jobs;
    await AsyncStorage.removeItem(KEY);
    return null;
  } catch {
    return null;
  }
}

export async function saveFeedCache(jobs: Job[]): Promise<void> {
  try {
    if (!isPublicCache(jobs)) {
      await AsyncStorage.removeItem(KEY);
      return;
    }
    await AsyncStorage.setItem(KEY, JSON.stringify(jobs.slice(0, 30)));
  } catch {
    /* ignore */
  }
}
