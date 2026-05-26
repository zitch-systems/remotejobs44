// app/api/admin/stats/route.ts — Real admin stats from Supabase
import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';

export const revalidate = 30;

export async function GET() {
  // Centralized admin gate — also honors the `suspended` kill-switch that
  // the inline gates here used to skip.
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  try {
    const admin = createAdminSupabaseClient();
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const [
      { count: totalJobs },
      { count: newToday },
      { count: activeUsers },
      { count: subscriptions },
      { count: sources },
    ] = await Promise.all([
      admin.from('jobs').select('*', { count: 'exact', head: true }).eq('is_active', true),
      admin.from('jobs').select('*', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
      admin.from('profiles').select('*', { count: 'exact', head: true }),
      admin.from('profiles').select('*', { count: 'exact', head: true }).in('plan', ['pro', 'daily', 'admin']),
      admin.from('job_sources').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    ]);

    return NextResponse.json({
      totalJobs:     totalJobs ?? 0,
      newToday:      newToday  ?? 0,
      activeUsers:   activeUsers ?? 0,
      subscriptions: subscriptions ?? 0,
      sources:       sources ?? 0,
      revenue:       0, // Revenue data comes from Paystack webhooks
    });
  } catch (err: any) {
    console.error('[admin/stats]', err);
    return NextResponse.json({ totalJobs: 0, newToday: 0, activeUsers: 0, subscriptions: 0, sources: 0, revenue: 0 });
  }
}
