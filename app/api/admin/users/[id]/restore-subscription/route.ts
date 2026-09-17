// app/api/admin/users/[id]/restore-subscription/route.ts
// Admin escape-hatch for restoring a paid plan that got wiped — typically
// from the old applications-route auto-downgrade bug (fix in 4610193) or a
// failed webhook. Sets profile.plan, plan_expires_at, AND the subscriptions
// row so all three sources of truth agree.
//
// Body: { plan: 'daily' | 'pro' | 'pro_annual' }
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { recordAdminAction } from '@/lib/admin/audit';
import { requireAdmin } from '@/lib/admin/auth';
import { isValidPlan, getPlanTier, getBilling, getPlanExpiry, PLAN_AMOUNTS_KOBO } from '@/lib/paystack/plans';
import { logError, logInfo } from '@/lib/log';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  let body: { plan?: string } = {};
  try { body = await req.json(); } catch {}
  const plan = body.plan;
  if (!plan || !isValidPlan(plan)) {
    return NextResponse.json({ error: 'plan must be one of daily, pro, pro_annual' }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();

  // Verify the user exists before touching anything
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, role, plan, plan_expires_at')
    .eq('id', id)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (profile.role === 'admin') {
    return NextResponse.json({ error: 'Cannot restore subscription for an admin (admins have permanent access)' }, { status: 400 });
  }

  const tier      = getPlanTier(plan);     // 'daily' | 'pro'
  const billing   = getBilling(plan);      // 'daily' | 'monthly' | 'annually'
  const expiresAt = getPlanExpiry(plan);   // 24h / 30d / 365d from now
  const nowIso    = new Date().toISOString();

  // 1. Update the profile row — this is what the dashboard reads.
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ plan: tier, plan_expires_at: expiresAt.toISOString(), updated_at: nowIso })
    .eq('id', id);
  if (profileError) {
    // Log the raw Postgres message for ops, ship a generic shape.
    // The previous "Failed to update profile: <msg>" concatenation
    // leaked column names + constraint ids into the admin browser.
    logError({ event: 'admin.restore_subscription.profile_update_failed', admin_email: auth.adminEmail, target_user_id: id, error: profileError.message });
    return NextResponse.json({ error: 'Failed to update profile.' }, { status: 500 });
  }

  // 2. Upsert the subscriptions row — this is what /api/applications checks
  //    to enforce the per-window count and to spot legitimate expiry.
  const { error: subError } = await supabase.from('subscriptions').upsert({
    user_id:              id,
    plan:                 tier,
    billing,
    status:               'active',
    paystack_reference:   `admin-restore-${Date.now()}`,
    current_period_start: nowIso,
    current_period_end:   expiresAt.toISOString(),
    currency:             'NGN',
    price:                (PLAN_AMOUNTS_KOBO[plan] ?? 0) / 100,
    updated_at:           nowIso,
  }, { onConflict: 'user_id' });
  if (subError) {
    logError({ event: 'admin.restore_subscription.sub_upsert_failed', admin_email: auth.adminEmail, target_user_id: id, error: subError.message });

    // Keep the profile and subscription sources of truth aligned. The ideal
    // operation is transactional, but until the production RPC is available,
    // compensate by restoring the profile values we read before the write.
    const { error: rollbackError } = await supabase
      .from('profiles')
      .update({
        plan: profile.plan,
        plan_expires_at: profile.plan_expires_at,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (rollbackError) {
      logError({
        event: 'admin.restore_subscription.profile_rollback_failed',
        admin_email: auth.adminEmail,
        target_user_id: id,
        error: rollbackError.message,
      });
    }
    return NextResponse.json(
      { error: 'Subscription restoration failed; no success was recorded.' },
      { status: 500 },
    );
  }

  logInfo({ event: 'admin.subscription_restored', admin_email: auth.adminEmail, target_user_id: id, target_email: profile.email, plan });
  await recordAdminAction({
    adminId:    auth.adminId,
    adminEmail: auth.adminEmail,
    action:     'user.restore_subscription',
    targetType: 'user',
    targetId:   id,
    metadata:   { plan, tier, expires_at: expiresAt.toISOString(), email: profile.email },
  });

  return NextResponse.json({
    success:    true,
    plan:       tier,
    billing,
    expires_at: expiresAt.toISOString(),
  });
}
