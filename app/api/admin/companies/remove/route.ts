// app/api/admin/companies/remove/route.ts
// Soft-delete every job belonging to a company (set is_active=false on all
// rows whose company column matches, case-insensitive). We keep the rows in
// the DB because saved_jobs + applications FK back to them — deleting would
// corrupt user dashboards and application history.
//
// To bring a removed company back, the admin clicks Refresh on the
// /admin/companies page and the reconcile flow will flip rows back to
// is_active=true (or mark them gone forever, depending on what the live
// feed shows).
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { recordAdminAction } from '@/lib/admin/audit';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  let body: { company?: string } = {};
  try { body = await req.json(); } catch {}
  const company = (body.company ?? '').trim();
  if (!company) return NextResponse.json({ error: 'company is required' }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { error, count } = await admin
    .from('jobs')
    .update({ is_active: false, updated_at: new Date().toISOString() }, { count: 'exact' })
    .ilike('company', company)
    .eq('is_active', true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Bust the cached /jobs page + homepage so the removal takes effect immediately.
  try {
    const { revalidatePath } = await import('next/cache');
    revalidatePath('/jobs');
    revalidatePath('/');
  } catch {}

  await recordAdminAction({
    adminId: auth.adminId, adminEmail: auth.adminEmail,
    action: 'company.remove', targetType: 'company', targetId: company,
    metadata: { removed_count: count ?? 0 },
  });

  return NextResponse.json({ success: true, company, removed: count ?? 0 });
}
