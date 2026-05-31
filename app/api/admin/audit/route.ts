// app/api/admin/audit/route.ts
//
// Paginated read of the admin_actions audit table for /admin/audit.
//
// Filters supported on the query string:
//   * action       — exact match on the action key (e.g. "user.suspend")
//   * adminEmail   — case-insensitive substring on admin_email
//   * targetType   — exact match (e.g. "user", "job", "source", "company")
//   * targetId     — exact match (when the admin knows what to look up)
//   * since        — ISO date; rows with created_at >= since
//   * page         — 1-indexed page number
//   * perPage      — 25 default, capped at 100
//
// Returns the rows + the exact count for the filter so the UI can
// render proper pagination. metadata is shipped as-is — it can carry
// PII fragments (target email on user.suspend, plan label on
// user.update_plan, etc.) which is intentional: the audit UI is the
// place where staff need that information surfaced. The route stays
// admin-gated end-to-end.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { logError } from '@/lib/log';

const ALLOWED_TARGET_TYPES = new Set(['user', 'job', 'company', 'source', 'site_settings', 'ai_provider', 'subscription']);

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const sp = req.nextUrl.searchParams;
  const action      = (sp.get('action')      ?? '').trim().slice(0, 64);
  const adminEmail  = (sp.get('adminEmail')  ?? '').trim().toLowerCase().slice(0, 254);
  const targetType  = (sp.get('targetType')  ?? '').trim().slice(0, 32);
  const targetIdRaw = (sp.get('targetId')    ?? '').trim().slice(0, 64);
  const since       = (sp.get('since')       ?? '').trim();
  const rawPage     = parseInt(sp.get('page')    ?? '1',  10);
  const rawPerPage  = parseInt(sp.get('perPage') ?? '25', 10);
  const page    = Number.isFinite(rawPage)    && rawPage    > 0 ? Math.min(rawPage,    400) : 1;
  const perPage = Number.isFinite(rawPerPage) && rawPerPage > 0 ? Math.min(rawPerPage, 100) : 25;

  const supabase = createAdminSupabaseClient();
  let query = supabase
    .from('admin_actions')
    .select('id, admin_id, admin_email, action, target_type, target_id, metadata, created_at', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (action) {
    query = query.eq('action', action);
  }
  if (adminEmail) {
    // ILIKE-escape the email substring before splicing — admins can
    // type any character into the filter input.
    const safe = adminEmail.replace(/[\\%_]/g, '\\$&');
    query = query.ilike('admin_email', `%${safe}%`);
  }
  if (targetType && ALLOWED_TARGET_TYPES.has(targetType)) {
    query = query.eq('target_type', targetType);
  }
  if (targetIdRaw) {
    // target_id is a text column (admin_actions stores UUIDs and the
    // occasional company name slug). Accept both UUIDs and short
    // strings; the eq match is safe either way.
    query = query.eq('target_id', targetIdRaw);
  }
  if (since) {
    const sinceDate = new Date(since);
    if (!Number.isNaN(sinceDate.getTime())) {
      query = query.gte('created_at', sinceDate.toISOString());
    }
  }

  const from = (page - 1) * perPage;
  query = query.range(from, from + perPage - 1);

  const { data, count, error } = await query;
  if (error) {
    logError({ event: 'admin.audit.list_failed', admin_email: auth.adminEmail, error: error.message });
    return NextResponse.json({ error: 'Failed to load audit log.', rows: [], total: 0, page, perPage }, { status: 500 });
  }

  return NextResponse.json({
    rows:    data ?? [],
    total:   count ?? 0,
    page,
    perPage,
    pages:   Math.max(1, Math.ceil((count ?? 0) / perPage)),
  });
}
