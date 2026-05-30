// app/api/admin/companies/route.ts
// Aggregates the jobs table by company so the admin can see "who do we
// have scraped, and how many open roles each".
//
// Previous version did .from('jobs').select(...).limit(50000), but
// PostgREST caps responses at db-max-rows (1000) regardless of the
// client-side limit. The 1000 most-recently-updated jobs happened to
// come from only ~80 unique companies — hiding the real ~940 from the
// admin UI ("80 companies · 1,000 active vacancies" was the symptom).
//
// Now uses the admin_companies_aggregate() RPC which does the GROUP BY
// in Postgres and returns one row per company. Platform detection
// still runs in JS because detectATSFromUrl reads our ats-detect
// pattern catalogue — it'd be ugly to mirror in SQL.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { detectATSFromUrl, type ATSPlatform } from '@/lib/ats-detect';
import { requireAdmin } from '@/lib/admin/auth';
import { logError } from '@/lib/log';

// Admin views must reflect the live DB the moment after a bulk import
// finishes. Default Next.js fetch caching could otherwise serve the
// previous empty/stale response and make the page look broken.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
// admin_companies_aggregate() over 64k+ rows runs in ~2 s — cold start
// + JS post-processing can push the route past the 10 s Vercel default
// timeout. Give it explicit headroom.
export const maxDuration = 30;

interface CompanyRow {
  company:        string;
  platform:       ATSPlatform | 'unknown' | 'manual';
  slug:           string;
  source:         string;       // raw `source` column value (greenhouse|lever|rss|manual|...)
  source_url:     string | null;
  apply_url_sample: string | null;   // an apply_url we can re-detect from
  active_count:   number;
  inactive_count: number;
  last_updated:   string;       // ISO timestamp of the freshest job row
}

interface AggregatedRow {
  company:           string | null;
  source:            string | null;
  source_url:        string | null;
  apply_url_sample:  string | null;
  active_count:      number | null;
  inactive_count:    number | null;
  last_updated:      string | null;
}

export async function GET(_req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.rpc('admin_companies_aggregate');
  if (error) {
    logError({ event: 'admin.companies.aggregate_failed', admin_email: auth.adminEmail, error: error.message });
    return NextResponse.json({ error: 'Failed to load companies.' }, { status: 500 });
  }

  const rows: CompanyRow[] = ((data ?? []) as AggregatedRow[]).map((r) => {
    const detected = r.apply_url_sample ? detectATSFromUrl(r.apply_url_sample) : null;
    return {
      company:          r.company ?? 'Unknown',
      platform:         detected?.platform ?? (r.source === 'manual' ? 'manual' : 'unknown'),
      slug:             detected?.slug ?? '',
      source:           r.source ?? 'unknown',
      source_url:       r.source_url ?? null,
      apply_url_sample: r.apply_url_sample ?? null,
      active_count:     Number(r.active_count ?? 0),
      inactive_count:   Number(r.inactive_count ?? 0),
      last_updated:     r.last_updated ?? new Date(0).toISOString(),
    };
  });
  // Hide one-off manual entries — same filter as before. Keep manual
  // companies with multiple postings (admins use these to track their
  // own ad-hoc imports).
  const companies = rows
    .filter((c: CompanyRow) => c.source !== 'manual' || c.active_count + c.inactive_count > 1)
    .sort((a: CompanyRow, b: CompanyRow) => b.active_count - a.active_count);

  return NextResponse.json({ companies, total: companies.length });
}
