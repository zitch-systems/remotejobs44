// app/api/admin/users/bulk/route.ts
//
// Bulk variants of the per-user PATCH/DELETE actions already exposed
// at /api/admin/users/[id]. Single endpoint with an `action` field
// rather than three sibling routes, because the safety gates and the
// audit-row shape are identical across them.
//
// Body:
//   { action: 'suspend' | 'unsuspend' | 'set_plan' | 'delete',
//     userIds: string[], plan?: 'free'|'daily'|'pro'|'admin',
//     reason?: string }
//
// Hard limits to keep blast radius bounded:
//   * max 200 ids per call (UI already chunks beyond that)
//   * the calling admin can't include their own id (mirrors the
//     self-suspend / self-delete guards on the per-user routes)
//   * `delete` is the only path that calls supabase.auth.admin.
//     deleteUser per id; the others issue a single SQL update over
//     the in-set.
//
// Returns a per-id success/error breakdown so the UI can render
// partial-success states accurately.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { recordAdminAction } from '@/lib/admin/audit';
import { logError, logInfo } from '@/lib/log';

// 5-wide deletes × up to 200 ids = 40 chunks × ~200ms = ~8s upper
// bound. Vercel's default 10s would cut close — give explicit
// headroom so a sluggish auth.admin.deleteUser response doesn't
// leave the call half-applied.
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_ACTIONS = new Set(['suspend', 'unsuspend', 'set_plan', 'delete']);
const ALLOWED_PLANS   = new Set(['free', 'daily', 'pro', 'admin']);
const MAX_IDS         = 200;

interface BulkBody {
  action?:  string;
  userIds?: unknown;
  plan?:    string;
  reason?:  string;
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  let body: BulkBody = {};
  try { body = await req.json(); } catch {}

  const action = String(body.action ?? '');
  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const rawIds = Array.isArray(body.userIds) ? body.userIds : [];
  const userIds = Array.from(new Set(
    rawIds.filter((x): x is string => typeof x === 'string' && UUID_RE.test(x))
  ))
    // Filter out the calling admin so a stray select-all can't lock the
    // admin out of their own session.
    .filter(id => id !== auth.adminId)
    .slice(0, MAX_IDS);

  if (userIds.length === 0) {
    return NextResponse.json({ error: 'No valid user ids in payload' }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const nowIso   = new Date().toISOString();

  // ── suspend / unsuspend ─────────────────────────────────────────
  if (action === 'suspend' || action === 'unsuspend') {
    const reason = action === 'suspend' && typeof body.reason === 'string'
      ? body.reason.slice(0, 500)
      : null;
    const patch = action === 'suspend'
      ? { suspended: true,  suspended_at: nowIso, suspended_reason: reason, updated_at: nowIso }
      : { suspended: false, suspended_at: null,   suspended_reason: null,   updated_at: nowIso };

    const { error, count } = await supabase
      .from('profiles')
      .update(patch, { count: 'exact' })
      .in('id', userIds);

    if (error) {
      logError({ event: `admin.users.bulk_${action}.failed`, admin_email: auth.adminEmail, error: error.message });
      return NextResponse.json({ error: 'Bulk operation failed.' }, { status: 500 });
    }

    await recordAdminAction({
      adminId: auth.adminId, adminEmail: auth.adminEmail,
      action: action === 'suspend' ? 'user.bulk_suspend' : 'user.bulk_unsuspend',
      targetType: 'user', targetId: null,
      metadata: { count: count ?? userIds.length, target_count: userIds.length, reason },
    });

    return NextResponse.json({
      success: true,
      affected: count ?? userIds.length,
      target_count: userIds.length,
    });
  }

  // ── set_plan ────────────────────────────────────────────────────
  if (action === 'set_plan') {
    const plan = String(body.plan ?? '');
    if (!ALLOWED_PLANS.has(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }
    // Setting role=admin via bulk plan would silently elevate users —
    // bulk endpoint stays narrower than the per-user PATCH on purpose.
    if (plan === 'admin') {
      return NextResponse.json({ error: 'Bulk-promoting to admin is not allowed. Use the per-user page.' }, { status: 400 });
    }

    const { error, count } = await supabase
      .from('profiles')
      .update({ plan, updated_at: nowIso }, { count: 'exact' })
      .in('id', userIds)
      // Never downgrade an admin's plan tag via bulk — same rule the
      // expire-daily cron uses.
      .neq('role', 'admin');

    if (error) {
      logError({ event: 'admin.users.bulk_set_plan.failed', admin_email: auth.adminEmail, error: error.message });
      return NextResponse.json({ error: 'Bulk operation failed.' }, { status: 500 });
    }

    await recordAdminAction({
      adminId: auth.adminId, adminEmail: auth.adminEmail,
      action: 'user.bulk_set_plan', targetType: 'user', targetId: null,
      metadata: { plan, count: count ?? 0, target_count: userIds.length },
    });

    return NextResponse.json({
      success: true,
      affected: count ?? 0,
      target_count: userIds.length,
    });
  }

  // ── delete ──────────────────────────────────────────────────────
  // No batch deleteUser API on Supabase — fire per-id deletions in
  // small parallel chunks. Cancel an active subscription first so a
  // late Paystack webhook can't write to a profile that's about to
  // vanish.
  await supabase.from('subscriptions')
    .update({ status: 'cancelled', updated_at: nowIso })
    .in('user_id', userIds);

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  const CHUNK = 5;
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const chunk = userIds.slice(i, i + CHUNK);
    const settled = await Promise.allSettled(chunk.map(async id => {
      const { error } = await supabase.auth.admin.deleteUser(id);
      if (error) throw new Error(error.message);
    }));
    settled.forEach((res, k) => {
      const id = chunk[k];
      if (res.status === 'fulfilled') {
        results.push({ id, ok: true });
      } else {
        // Don't echo the raw GoTrue error to the admin browser. Log it
        // with admin context so ops can diagnose, surface a generic
        // "failed" flag per id.
        logError({ event: 'admin.users.bulk_delete.row_failed', admin_email: auth.adminEmail, target_user_id: id, error: (res.reason as Error)?.message ?? 'unknown' });
        results.push({ id, ok: false, error: 'delete failed' });
      }
    });
  }

  const succeeded = results.filter(r => r.ok).length;
  const failed    = results.length - succeeded;
  logInfo({ event: 'admin.users.bulk_deleted', admin_email: auth.adminEmail, succeeded, failed, total: userIds.length });

  await recordAdminAction({
    adminId: auth.adminId, adminEmail: auth.adminEmail,
    action: 'user.bulk_delete', targetType: 'user', targetId: null,
    metadata: { succeeded, failed, target_count: userIds.length },
  });

  return NextResponse.json({
    success: failed === 0,
    succeeded, failed, target_count: userIds.length,
    results,
  });
}
