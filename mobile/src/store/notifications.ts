// src/store/notifications.ts — the notification inbox (shared so the Home bell
// badge + the inbox screen stay in sync). Loaded on sign-in; demo mode shows a
// small seed set so the feature is explorable offline.
import { create } from 'zustand';
import { isSupabaseConfigured } from '@/lib/supabase';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, type AppNotification } from '@/lib/notifications';

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const SEED: AppNotification[] = [
  { id: 's1', type: 'job_alert', title: 'New remote jobs for you', body: '4 new verified roles just landed. Tap to view.', jobId: '1', read: false, createdAt: hoursAgo(2) },
  { id: 's2', type: 'application', title: 'Application update', body: 'Paystack moved your application forward.', jobId: '2', read: false, createdAt: hoursAgo(26) },
  { id: 's3', type: 'system', title: 'Welcome to RemoteJobs44', body: 'Add your skills to sharpen your matches.', jobId: null, read: true, createdAt: hoursAgo(72) },
];

interface NotifState {
  items: AppNotification[];
  loading: boolean;
  load: (userId: string | null) => void;
  markRead: (userId: string | null, id: string) => void;
  markAllRead: (userId: string | null) => void;
}

export const useNotifications = create<NotifState>((set) => ({
  items: isSupabaseConfigured ? [] : SEED,
  loading: false,
  load: (userId) => {
    if (!isSupabaseConfigured || !userId) {
      set({ items: isSupabaseConfigured ? [] : SEED, loading: false });
      return;
    }
    set({ loading: true });
    fetchNotifications(userId)
      .then((items) => set({ items, loading: false }))
      .catch(() => set({ loading: false }));
  },
  markRead: (userId, id) => {
    set((s) => ({ items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)) }));
    if (isSupabaseConfigured && userId) markNotificationRead(userId, id).catch(() => {});
  },
  markAllRead: (userId) => {
    set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })) }));
    if (isSupabaseConfigured && userId) markAllNotificationsRead(userId).catch(() => {});
  },
}));
