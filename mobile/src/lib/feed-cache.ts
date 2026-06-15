// src/lib/feed-cache.ts — persist the last feed page so the app opens instantly
// with the previous results while fresh data loads. Best-effort; failures are
// swallowed (cache is an optimisation, never a source of truth).
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Job } from './types';

const KEY = 'rj44-feed-cache';

export async function loadFeedCache(): Promise<Job[] | null> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v ? (JSON.parse(v) as Job[]) : null;
  } catch {
    return null;
  }
}

export async function saveFeedCache(jobs: Job[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(jobs.slice(0, 30)));
  } catch {
    /* ignore */
  }
}
