// app/api/admin/users/route.ts — server-side user list for the admin panel.
//
// The /admin/users page used to query `profiles` directly from the browser.
// That only works for admins whose profiles.role='admin' (the RLS policy keys
// off is_admin()); a hardcoded-email admin (role still 'user') got 0 rows and
// a permanently-empty page. This endpoint runs the same query server-side under
// service_role behind requireAdmin() — which honours BOTH the role and the
// hardcoded-email admin list — so the page works for any admin. Mirrors the
// pattern already used by /api/admin/stats.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { logError } from '@/lib/log';

const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX     = 100;

// Keyed off Supabase column names so we pass straight to .order(). Whitelisted
// so a crafted ?sort= can't inject an arbitrary column.
const SORT_FIELDS: Record<string, { col: string; asc: boolean }> = {
  newest: { col: 'created_at', asc: false },
  oldest: { col: 'created_at', asc: true  },
  name:   { col: 'name',       asc: true  },
  plan:   { col: 'plan',       asc: true  },
};
const PLAN_FILTERS = new Set(['all', 'free', 'daily', 'pro', 'admin']);
const PLAN_TIERS   = ['free', 'daily', 'pro', 'admin'] as const;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const sp       = req.nextUrl.searchParams;
  const q        = (sp.get('q') ?? '').trim();
  const planRaw  = sp.get('plan') ?? 'all';
  const sortRaw  = sp.get('sort') ?? 'newest';
  const page     = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, parseInt(sp.get('pageSize') ?? String(PAGE_SIZE_DEFAULT), 10) || PAGE_SIZE_DEFAULT));

  const sortDef    = SORT_FIELDS[sortRaw] ?? SORT_FIELDS.newest;
  const planFilter = PLAN_FILTERS.has(planRaw) ? planRaw : 'all';

  try {
    const admin = createAdminSupabaseClient();

    let listQuery = admin
      .from('profiles')
      .select('id,name,email,plan,role,created_at,suspended', { count: 'exact' })
      .order(sortDef.col, { ascending: sortDef.asc, nullsFirst: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (planFilter !== 'all') listQuery = listQuery.eq('plan', planFilter);
    if (q) {
      // Strip PostgREST .or() structural chars (, ( ) and escape LIKE
      // wildcards — same sanitisation the page did before this moved server-side.
      const sanitised = q.replace(/[,()]/g, ' ').replace(/[\\%_]/g, '\\$&');
      const like = `%${sanitised}%`;
      listQuery = listQuery.or(`name.ilike.${like},email.ilike.${like}`);
    }

    const [listRes, ...countRes] = await Promise.all([
      listQuery,
      ...PLAN_TIERS.map(t => admin.from('profiles').select('id', { count: 'exact', head: true }).eq('plan', t)),
    ]);

    if (listRes.error) throw listRes.error;

    const planTotals = Object.fromEntries(
      PLAN_TIERS.map((t, i) => [t, countRes[i]?.count ?? 0]),
    ) as Record<(typeof PLAN_TIERS)[number], number>;

    return NextResponse.json({
      users:      listRes.data ?? [],
      total:      listRes.count ?? 0,
      planTotals,
    });
  } catch (err: any) {
    logError({ event: 'admin.users.list_failed', error: err?.message ?? String(err) });
    return NextResponse.json(
      { users: [], total: 0, planTotals: { free: 0, daily: 0, pro: 0, admin: 0 }, error: 'Failed to load users' },
      { status: 500 },
    );
  }
}
