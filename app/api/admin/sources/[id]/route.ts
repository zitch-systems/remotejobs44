// app/api/admin/sources/[id]/route.ts
// Per-row updates + delete for `job_sources`. See the parent route for
// list + create.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { recordAdminAction } from '@/lib/admin/audit';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { logError } from '@/lib/log';

const ALLOWED_STATUSES = new Set(['active', 'paused']);

// Strict UUID v4 shape — the earlier /^[0-9a-f-]{36}$/i let through
// strings like '------------------------------------' (36 dashes) or
// 36 a's, which PostgREST would still reject at the DB layer but
// short-circuiting here is cleaner.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PATCH — flip status (active ↔ paused) or rename. Admin Sources page
// uses this for the pause/resume button.
//
// Next 15+ made route-segment params async — context.params is now a
// Promise that must be awaited before reading the slug. Applies to
// every [param] handler in this app.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid source id' }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, string> = {};
  if (typeof body.name === 'string') {
    patch.name = body.name.trim().slice(0, 100);
  }
  if (typeof body.status === 'string') {
    if (!ALLOWED_STATUSES.has(body.status)) {
      return NextResponse.json({ error: 'Status must be active or paused' }, { status: 400 });
    }
    patch.status = body.status;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('job_sources')
    .update(patch)
    .eq('id', id)
    .select('id, name, url, method, status, last_sync_at, jobs_added, created_at')
    .single();
  if (error || !data) {
    logError({ event: 'admin.source.patch_failed', admin_email: auth.adminEmail, source_id: id, error: error?.message ?? 'unknown' });
    return NextResponse.json({ error: 'Failed to update source.' }, { status: 500 });
  }
  await recordAdminAction({
    adminId: auth.adminId, adminEmail: auth.adminEmail,
    action: 'source.update', targetType: 'source', targetId: id,
    // The patch keys ARE the change set — listing them in metadata lets
    // forensics distinguish a name-rename from a pause/resume without
    // storing the new value (which can be inferred from the row at the
    // log timestamp).
    metadata: { changed: Object.keys(patch), new_status: patch.status ?? null },
  });
  return NextResponse.json({ source: data });
}

// DELETE — remove the source. Doesn't touch jobs already ingested from
// it — those stay queryable; future runs just stop adding from this
// URL.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid source id' }, { status: 400 });
  }
  const supabase = createAdminSupabaseClient();
  // Snapshot the row before delete so the audit metadata identifies
  // *which* source was removed by name/URL — a bare UUID post-delete
  // is unreviewable.
  const { data: existing } = await supabase
    .from('job_sources')
    .select('name, url, method')
    .eq('id', id)
    .maybeSingle();
  const { error } = await supabase
    .from('job_sources')
    .delete()
    .eq('id', id);
  if (error) {
    logError({ event: 'admin.source.delete_failed', admin_email: auth.adminEmail, source_id: id, error: error.message });
    return NextResponse.json({ error: 'Failed to delete source.' }, { status: 500 });
  }
  await recordAdminAction({
    adminId: auth.adminId, adminEmail: auth.adminEmail,
    action: 'source.delete', targetType: 'source', targetId: id,
    metadata: existing ?? { note: 'row already gone at delete time' },
  });
  return NextResponse.json({ ok: true });
}
