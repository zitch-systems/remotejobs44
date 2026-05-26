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
  // Reject lone-wildcard "company" values like "%", "%%", "_" that would
  // match every row. Any legit company name has at least one alphanumeric.
  if (!/[a-z0-9]/i.test(company)) {
    return NextResponse.json({ error: 'company must contain at least one alphanumeric character' }, { status: 400 });
  }
  // Escape SQL-LIKE wildcards so an admin (or compromised admin session)
  // can't pass company="%" and deactivate every active job. ilike treats
  // %/_ as wildcards; backslash-escape both. Postgres also requires
  // doubling backslashes if escaped in a string literal — Supabase
  // parameterises the value so a single backslash is correct here.
  const safeCompany = company.replace(/[\\%_]/g, '\\$&');

  const admin = createAdminSupabaseClient();
  // Sanity gate: count first, refuse if absurdly large. A real company
  // never has >5,000 active jobs in our DB; anything bigger is the
  // wildcard-escape failing silently or a typo wildcard.
  const { count: targetCount } = await admin
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .ilike('company', safeCompany)
    .eq('is_active', true);
  if ((targetCount ?? 0) > 5000) {
    return NextResponse.json({
      error: `Refusing to remove ${targetCount} jobs in one call — pass a more specific company name`,
    }, { status: 400 });
  }

  const { error, count } = await admin
    .from('jobs')
    .update({ is_active: false, updated_at: new Date().toISOString() }, { count: 'exact' })
    .ilike('company', safeCompany)
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
