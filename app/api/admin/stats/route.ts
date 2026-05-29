// app/api/admin/stats/route.ts — Real admin stats from Supabase.
//
// Reached from the /admin overview page. The page used to query jobs
// directly from the browser using the anon supabase-js client, but the
// v16 column-level revoke removed coarse SELECT on jobs from anon and
// authenticated — so those calls now 401 with "permission denied for
// table jobs". This endpoint runs the same queries server-side under
// service_role and returns everything the dashboard renders.
import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { logError } from '@/lib/log';

export const revalidate = 30;

// MRR amortisation constants mirror app/pricing/page.tsx. Annual plan
// gets divided by 12 so each subscription contributes monthly value.
const PRO_MONTHLY_NGN        = 2999;
const PRO_ANNUAL_MONTHLY_NGN = Math.round(29999 / 12);

export async function GET() {
  // Centralized admin gate — also honors the `suspended` kill-switch.
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  try {
    const admin = createAdminSupabaseClient();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const since30d = new Date(); since30d.setDate(since30d.getDate() - 29); since30d.setHours(0, 0, 0, 0);

    const [
      { count: totalJobs },
      { count: newToday },
      { count: totalUsers },
      { count: proCount },
      { count: dailyCount },
      { count: sources },
      { data: subscriptions30dProfiles },
      { data: activeSubs },
    ] = await Promise.all([
      admin.from('jobs').select('id', { count: 'exact', head: true }).eq('is_active', true),
      admin.from('jobs').select('id', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
      admin.from('profiles').select('id', { count: 'exact', head: true }),
      admin.from('profiles').select('id', { count: 'exact', head: true }).eq('plan', 'pro'),
      admin.from('profiles').select('id', { count: 'exact', head: true }).eq('plan', 'daily'),
      admin.from('job_sources').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      admin.from('profiles').select('created_at').gte('created_at', since30d.toISOString()),
      admin.from('subscriptions').select('plan,billing,price').eq('status', 'active'),
    ]);

    // 30-day signup sparkline buckets, oldest → newest.
    const signups30d: number[] = Array(30).fill(0);
    for (const p of (subscriptions30dProfiles ?? [])) {
      const d = new Date((p as any).created_at);
      const dayIndex = Math.floor((d.getTime() - since30d.getTime()) / 86_400_000);
      if (dayIndex >= 0 && dayIndex < 30) signups30d[dayIndex]++;
    }

    // MRR — sum monthly-equivalent value of each active subscription.
    // Annual divided by 12, monthly counted at price, daily passes
    // intentionally excluded (one-off, not recurring).
    let mrr = 0;
    for (const s of (activeSubs ?? [])) {
      const row = s as { billing?: string; price?: number };
      if (row.billing === 'annually') {
        mrr += Math.round((row.price ?? PRO_ANNUAL_MONTHLY_NGN * 12) / 12);
      } else if (row.billing === 'monthly') {
        mrr += row.price ?? PRO_MONTHLY_NGN;
      }
    }
    // Fallback: estimate from plan counts when subscriptions table is empty.
    if (mrr === 0 && (proCount ?? 0) > 0) mrr = (proCount ?? 0) * PRO_MONTHLY_NGN;

    return NextResponse.json({
      totalJobs:     totalJobs   ?? 0,
      newToday:      newToday    ?? 0,
      activeUsers:   totalUsers  ?? 0,
      pro:           proCount    ?? 0,
      daily:         dailyCount  ?? 0,
      subscriptions: (proCount ?? 0) + (dailyCount ?? 0),
      sources:       sources     ?? 0,
      mrr,
      signups30d,
      revenue:       0, // Revenue data comes from Paystack webhooks
    });
  } catch (err: any) {
    logError({ event: 'admin.stats.failed', error: err?.message ?? String(err) });
    return NextResponse.json({
      totalJobs: 0, newToday: 0, activeUsers: 0,
      pro: 0, daily: 0, subscriptions: 0, sources: 0,
      mrr: 0, signups30d: Array(30).fill(0), revenue: 0,
    });
  }
}
