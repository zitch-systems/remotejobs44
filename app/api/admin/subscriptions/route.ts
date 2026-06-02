// app/api/admin/subscriptions/route.ts — server-side subscriptions list.
//
// Like /api/admin/users, this exists because the /admin/subscriptions page
// queried `subscriptions` directly from the browser, where RLS gates access via
// is_admin() (profiles.role='admin'). A hardcoded-email admin (role 'user')
// got nothing back and a page stuck on "Loading subscriptions…". Running the
// query server-side under service_role behind requireAdmin() — which honours
// both the role and the hardcoded-email admin list — makes it work for any
// admin. Mirrors /api/admin/stats and /api/admin/users.
//
// Only the display columns are selected — never the paystack_* tokens
// (subscription_code / email_token / customer_code), which must not reach the
// browser.
import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { logError } from '@/lib/log';

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from('subscriptions')
      .select('id, user_id, plan, billing, status, price, currency, current_period_start, current_period_end, profiles(name, email)')
      .order('current_period_start', { ascending: false })
      .range(0, 999);
    if (error) throw error;
    return NextResponse.json({ subscriptions: data ?? [] });
  } catch (err: any) {
    logError({ event: 'admin.subscriptions.list_failed', error: err?.message ?? String(err) });
    return NextResponse.json({ subscriptions: [], error: 'Failed to load subscriptions' }, { status: 500 });
  }
}
