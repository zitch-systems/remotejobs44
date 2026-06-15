// src/lib/notifications.ts — in-app notification inbox data layer (migration_v42).
// Rows are server-generated (job alerts, application updates, system); the app
// reads them and marks them read. Types + the pure `unreadCount` live in
// ./types and ./format (unit-tested) so this supabase-coupled module isn't
// pulled into jest.
import { supabase } from './supabase';
import type { AppNotification, NotificationType } from './types';

export type { AppNotification, NotificationType } from './types';

export async function fetchNotifications(userId: string, limit = 50): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id,type,title,body,job_id,read,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id as string,
    type: (r.type as NotificationType) ?? 'system',
    title: r.title as string,
    body: (r.body as string | null) ?? null,
    jobId: (r.job_id as string | null) ?? null,
    read: Boolean(r.read),
    createdAt: (r.created_at as string | null) ?? null,
  }));
}

export async function markNotificationRead(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('id', id);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
  if (error) throw error;
}
