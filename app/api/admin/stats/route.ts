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
      totalJobsResult,
      newTodayResult,
      totalUsersResult,
      proResult,
      dailyResult,
      sourcesResult,
      signupsResult,
      activeSubsResult,
      mobileDevicesResult,
    ] = await Promise.all([
      admin.from('jobs').select('id', { count: 'exact', head: true }).eq('is_active', true),
      admin.from('jobs').select('id', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
      admin.from('profiles').select('id', { count: 'exact', head: true }),
      admin.from('profiles').select('id', { count: 'exact', head: true }).eq('plan', 'pro'),
      admin.from('profiles').select('id', { count: 'exact', head: true }).eq('plan', 'daily'),
      admin.from('job_sources').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      admin.from('profiles').select('created_at').gte('created_at', since30d.toISOString()),
      admin.from('subscriptions').select('plan,billing,price').eq('status', 'active'),
      admin.from('mobile_devices').select('user_id,platform'),
    ]);

    // supabase-js returns database failures in result.error; it does not throw.
    // Treat any failed aggregate as an unavailable dashboard instead of
    // silently converting an outage/quota restriction into healthy zeroes.
    const queryErrors = [
      totalJobsResult.error,
      newTodayResult.error,
      totalUsersResult.error,
      proResult.error,
      dailyResult.error,
      sourcesResult.error,
      signupsResult.error,
      activeSubsResult.error,
      mobileDevicesResult.error,
    ].filter((error): error is NonNullable<typeof error> => !!error);
    if (queryErrors.length > 0) {
      throw new Error(queryErrors.map(error => error.message).join('; '));
    }

    const totalJobs = totalJobsResult.count;
    const newToday = newTodayResult.count;
    const totalUsers = totalUsersResult.count;
    const proCount = proResult.count;
    const dailyCount = dailyResult.count;
    const sources = sourcesResult.count;
    const subscriptions30dProfiles = signupsResult.data;
    const activeSubs = activeSubsResult.data;
    const mobileDeviceRows = mobileDevicesResult.data;

    // Distinct mobile-app users + platform split.
    const mobileUserSet = new Set<string>();
    let iosUsers = 0;
    let androidUsers = 0;
    for (const d of (mobileDeviceRows ?? []) as { user_id: string; platform: string }[]) {
      if (!mobileUserSet.has(d.user_id)) {
        mobileUserSet.add(d.user_id);
        if (d.platform === 'ios') iosUsers++;
        else if (d.platform === 'android') androidUsers++;
      }
    }
    const mobileUsers = mobileUserSet.size;

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
      mobileUsers,
      iosUsers,
      androidUsers,
    });
  } catch (err: any) {
    logError({ event: 'admin.stats.failed', error: err?.message ?? String(err) });
    return NextResponse.json(
      { error: 'Admin statistics are temporarily unavailable.' },
      { status: 503 },
    );
  }
}
