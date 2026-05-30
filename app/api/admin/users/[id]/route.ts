// app/api/admin/users/[id]/route.ts
// Admin actions on a single user: update plan/role, delete account.
// Password reset lives in a sibling route so it's POST-only (no idempotency
// concerns mixed with PATCH semantics).
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { recordAdminAction } from '@/lib/admin/audit';
import { requireAdmin } from '@/lib/admin/auth';
import { logError, logInfo } from '@/lib/log';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET — full user record for the drill-in page.
// Returns: profile, current subscription (if any), and recent applications.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });

  const supabase = createAdminSupabaseClient();
  // Explicit column lists — the previous select('*') pulled
  // paystack_customer_code + paystack_subscription_code off profiles
  // and the full paystack token set off subscriptions into the admin
  // browser. None of those are read by the React tree below; keeping
  // them off the wire is the standard defense-in-depth pattern.
  const PROFILE_COLS = 'id, email, name, plan, role, created_at, updated_at, profile_completion, plan_expires_at, suspended, suspended_at, suspended_reason, cv_url';
  const SUB_COLS     = 'id, user_id, plan, billing, status, price, currency, current_period_start, current_period_end, created_at, updated_at';
  const [{ data: profile }, { data: subscription }, { data: applications }] = await Promise.all([
    supabase.from('profiles').select(PROFILE_COLS).eq('id', id).maybeSingle(),
    supabase.from('subscriptions').select(SUB_COLS).eq('user_id', id).maybeSingle(),
    supabase.from('applications').select('id,job_title,company,status,applied_at')
      .eq('user_id', id).order('applied_at', { ascending: false }).limit(20),
  ]);

  if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  return NextResponse.json({ profile, subscription, applications: applications ?? [] });
}

// PATCH — update plan / role / name / suspension. Pass only the fields you
// want changed. Each accepted field is audit-logged separately so the log
// shows what was touched, not just "user updated".
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });

  let body: {
    plan?: string; role?: string; name?: string;
    suspended?: boolean; suspended_reason?: string;
  } = {};
  try { body = await req.json(); } catch {}

  const ALLOWED_PLANS = ['free', 'daily', 'pro', 'admin'];
  const ALLOWED_ROLES = ['user', 'admin'];

  const patch: Record<string, any> = {};
  if (body.plan !== undefined) {
    if (!ALLOWED_PLANS.includes(body.plan)) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    patch.plan = body.plan;
  }
  if (body.role !== undefined) {
    if (!ALLOWED_ROLES.includes(body.role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    // Belt-and-braces: an admin should not be able to demote themselves and
    // immediately lose access to this very endpoint.
    if (id === auth.adminId && body.role !== 'admin') {
      return NextResponse.json({ error: 'You cannot demote yourself' }, { status: 400 });
    }
    patch.role = body.role;
  }
  if (typeof body.name === 'string' && body.name.length <= 200) {
    patch.name = body.name;
  }
  if (body.suspended !== undefined) {
    if (typeof body.suspended !== 'boolean') return NextResponse.json({ error: 'suspended must be boolean' }, { status: 400 });
    // Can't suspend yourself — would lock you out of the admin panel
    // immediately and require a DB poke to recover.
    if (id === auth.adminId && body.suspended) {
      return NextResponse.json({ error: 'You cannot suspend yourself' }, { status: 400 });
    }
    patch.suspended    = body.suspended;
    patch.suspended_at = body.suspended ? new Date().toISOString() : null;
    if (body.suspended && typeof body.suspended_reason === 'string') {
      patch.suspended_reason = body.suspended_reason.slice(0, 500);
    } else if (!body.suspended) {
      patch.suspended_reason = null;
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase.from('profiles').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logInfo({ event: 'admin.user.updated', admin_email: auth.adminEmail, target_user_id: id, patch });

  // Audit-log a separate row per field so a search by action="user.suspend"
  // doesn't pick up unrelated name edits.
  const tasks: Promise<void>[] = [];
  if (patch.plan !== undefined) tasks.push(recordAdminAction({
    adminId: auth.adminId, adminEmail: auth.adminEmail,
    action: 'user.update_plan', targetType: 'user', targetId: id,
    metadata: { plan: patch.plan },
  }));
  if (patch.role !== undefined) tasks.push(recordAdminAction({
    adminId: auth.adminId, adminEmail: auth.adminEmail,
    action: 'user.update_role', targetType: 'user', targetId: id,
    metadata: { role: patch.role },
  }));
  if (patch.suspended !== undefined) tasks.push(recordAdminAction({
    adminId: auth.adminId, adminEmail: auth.adminEmail,
    action: patch.suspended ? 'user.suspend' : 'user.unsuspend',
    targetType: 'user', targetId: id,
    metadata: { reason: patch.suspended_reason ?? null },
  }));
  if (patch.name !== undefined) tasks.push(recordAdminAction({
    adminId: auth.adminId, adminEmail: auth.adminEmail,
    action: 'user.update_name', targetType: 'user', targetId: id,
    metadata: { name: patch.name },
  }));
  await Promise.all(tasks);

  return NextResponse.json({ success: true, patched: patch });
}

// DELETE — wipe the user from auth.users. profiles, applications, saved_jobs,
// and subscriptions all cascade via FK constraints in schema.sql.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });

  // Hard guard: an admin must not delete their own account from this route —
  // accidental click would log them out and leave the app with one fewer admin.
  if (id === auth.adminId) {
    return NextResponse.json({ error: 'You cannot delete yourself' }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  // Best-effort cancel any active subscription first so Paystack isn't still
  // billing a deleted account. We don't await Paystack's API here — the
  // periodic cron / next webhook will reconcile.
  await supabase.from('subscriptions').update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('user_id', id);

  // Pull the email *before* deleting so the audit row has something useful
  // beyond a UUID once the user is gone.
  const { data: profile } = await supabase.from('profiles').select('email').eq('id', id).maybeSingle();

  const { error } = await supabase.auth.admin.deleteUser(id);
  if (error) {
    logError({ event: 'admin.user.delete_failed', admin_email: auth.adminEmail, target_user_id: id, error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  logInfo({ event: 'admin.user.deleted', admin_email: auth.adminEmail, target_user_id: id });
  await recordAdminAction({
    adminId: auth.adminId, adminEmail: auth.adminEmail,
    action: 'user.delete', targetType: 'user', targetId: id,
    metadata: { email: profile?.email ?? null },
  });
  return NextResponse.json({ success: true });
}
