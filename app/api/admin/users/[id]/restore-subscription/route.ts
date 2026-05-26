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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  if (!UUID_RE.test(params.id)) {
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
    .select('email, role')
    .eq('id', params.id)
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
    .eq('id', params.id);
  if (profileError) {
    return NextResponse.json({ error: 'Failed to update profile: ' + profileError.message }, { status: 500 });
  }

  // 2. Upsert the subscriptions row — this is what /api/applications checks
  //    to enforce the per-window count and to spot legitimate expiry.
  const { error: subError } = await supabase.from('subscriptions').upsert({
    user_id:              params.id,
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
    console.error('[admin/restore-subscription] sub upsert failed:', subError.message);
    // Profile was already updated — don't error out, the user is functional.
  }

  console.log(`[admin] ${auth.adminEmail} restored ${plan} for user ${params.id} (${profile.email})`);
  await recordAdminAction({
    adminId:    auth.adminId,
    adminEmail: auth.adminEmail,
    action:     'user.restore_subscription',
    targetType: 'user',
    targetId:   params.id,
    metadata:   { plan, tier, expires_at: expiresAt.toISOString(), email: profile.email },
  });

  return NextResponse.json({
    success:    true,
    plan:       tier,
    billing,
    expires_at: expiresAt.toISOString(),
  });
}
