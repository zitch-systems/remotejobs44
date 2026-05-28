// app/api/admin/sources/[id]/route.ts
// Per-row updates + delete for `job_sources`. See the parent route for
// list + create.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/server';

const ALLOWED_STATUSES = new Set(['active', 'paused']);

// PATCH — flip status (active ↔ paused) or rename. Admin Sources page
// uses this for the pause/resume button.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
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
    .eq('id', params.id)
    .select('id, name, url, method, status, last_sync_at, jobs_added, created_at')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500 });
  }
  return NextResponse.json({ source: data });
}

// DELETE — remove the source. Doesn't touch jobs already ingested from
// it — those stay queryable; future runs just stop adding from this
// URL.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: 'Invalid source id' }, { status: 400 });
  }
  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from('job_sources')
    .delete()
    .eq('id', params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
