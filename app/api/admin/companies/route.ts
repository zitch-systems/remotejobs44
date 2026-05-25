// app/api/admin/companies/route.ts
// Aggregates the jobs table by company so the admin can see "who do we
// have scraped, and how many open roles each".
//
// We don't have a companies table — the bulk-import flow writes straight
// into `jobs`. So we read all active+inactive jobs and group in memory.
// The select list is intentionally narrow (id, company, source,
// source_url, apply_url, is_active, updated_at) to keep the payload
// manageable even with 50k+ rows.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { detectATSFromUrl, type ATSPlatform } from '@/lib/ats-detect';
import { requireAdmin } from '@/lib/admin/auth';

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

export async function GET(_req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const supabase = createAdminSupabaseClient();
  // Pull only the columns we actually aggregate over. updated_at gives us
  // the "last sync" hint per company.
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('company,source,source_url,apply_url,is_active,updated_at,posted_at')
    .order('updated_at', { ascending: false })
    .limit(50_000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group by lowercased company name (case-insensitive merge) so e.g.
  // "Stripe" and "stripe" don't show twice. We keep the original casing
  // from the most-recent job for display.
  const groups = new Map<string, CompanyRow>();
  for (const job of (jobs ?? [])) {
    const key = (job.company ?? '').trim().toLowerCase();
    if (!key) continue;

    let row = groups.get(key);
    if (!row) {
      const detected = job.apply_url ? detectATSFromUrl(job.apply_url) : null;
      row = {
        company:          job.company,
        platform:         detected?.platform ?? (job.source === 'manual' ? 'manual' : 'unknown'),
        slug:             detected?.slug ?? '',
        source:           job.source ?? 'unknown',
        source_url:       job.source_url ?? null,
        apply_url_sample: job.apply_url ?? null,
        active_count:     0,
        inactive_count:   0,
        last_updated:     job.updated_at ?? job.posted_at ?? new Date(0).toISOString(),
      };
      groups.set(key, row);
    }
    if (job.is_active) row.active_count++; else row.inactive_count++;

    // Track the most recent apply_url so we always have something to detect
    // platform from, even if older rows had nulls.
    if (job.apply_url && !row.apply_url_sample) row.apply_url_sample = job.apply_url;
    if ((job.updated_at ?? '') > row.last_updated) row.last_updated = job.updated_at;
  }

  // Hide manual/one-off jobs from the "scraped companies" list — they're
  // not actionable from a refresh-the-feed angle.
  const companies = Array.from(groups.values())
    .filter(c => c.source !== 'manual' || c.active_count + c.inactive_count > 1)
    .sort((a, b) => b.active_count - a.active_count);

  return NextResponse.json({ companies, total: companies.length });
}
