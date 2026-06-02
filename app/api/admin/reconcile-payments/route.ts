// app/api/admin/reconcile-payments/route.ts
// Admin-triggered Paystack reconciliation — sweeps recent successful charges
// and credits any "paid but not reflected" users on demand (e.g. right after
// discovering the webhook wasn't configured). The same sweep also runs daily
// from /api/cron/daily as a standing safety net. See lib/paystack/reconcile.ts.
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { recordAdminAction } from '@/lib/admin/audit';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { reconcilePaystackCharges } from '@/lib/paystack/reconcile';
import { logError } from '@/lib/log';

export const maxDuration = 60;

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  try {
    // Wider window than the daily cron — an admin clicking this is usually
    // chasing a backlog after a webhook misconfig.
    const result = await reconcilePaystackCharges(createAdminSupabaseClient(), { sinceDays: 14, maxPages: 5 });
    await recordAdminAction({
      adminId: auth.adminId, adminEmail: auth.adminEmail,
      action: 'payments.reconcile', targetType: null, targetId: null, metadata: result,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    logError({ event: 'admin.reconcile.failed', error: err?.message ?? String(err) });
    return NextResponse.json({ error: 'Reconcile failed. Check the server logs.' }, { status: 500 });
  }
}
