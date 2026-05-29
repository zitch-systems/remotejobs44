// app/api/companies/route.ts — Public companies directory.
//
// Aggregates by company across the entire active jobs table. Before this
// route, /companies fetched only the first 200 jobs and derived its
// directory from that sample — out of 64k+ rows, that meant the page
// showed ~150 companies with badly-wrong per-company counts. Now we run
// the GROUP BY in Postgres and stream a complete, sorted list.
//
// Cached at the edge for 5 minutes via revalidate so the next ingest
// run's additions surface quickly without rebuilding on every request.
import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { logError } from '@/lib/log';

export const revalidate = 300;

interface CompanyAggregate {
  name:       string;
  logo:       string;
  jobCount:   number;
  categories: string[];
  featured:   boolean;
}

export async function GET() {
  try {
    const supabase = createAdminSupabaseClient();

    // Pull every active, non-flagged, non-expired job's (company, category,
    // featured) — the only columns we aggregate on. Limit defends against
    // a runaway response if the table ever grows past a few hundred k.
    const { data, error } = await supabase
      .from('jobs')
      .select('company, category, featured, logo')
      .eq('is_active', true)
      .or('flagged.eq.false,flagged.is.null')
      .or('expires_at.is.null,expires_at.gt.now()')
      .limit(200_000);

    if (error) throw new Error(error.message);

    // GROUP BY company in JS — Supabase's PostgREST .group() isn't
    // exposed via the JS client, and round-tripping a custom SQL RPC for
    // a 5-minute-cached endpoint isn't worth the extra surface.
    const map = new Map<string, CompanyAggregate>();
    for (const row of (data ?? [])) {
      const name = (row.company ?? '').trim();
      if (!name) continue;
      let entry = map.get(name);
      if (!entry) {
        entry = {
          name,
          logo:       row.logo ?? name[0]?.toUpperCase() ?? '?',
          jobCount:   0,
          categories: [],
          featured:   false,
        };
        map.set(name, entry);
      }
      entry.jobCount++;
      if (row.category && !entry.categories.includes(row.category)) {
        entry.categories.push(row.category);
      }
      if (row.featured) entry.featured = true;
    }

    // Sort by job count desc — drives the "featured 8" slot at the top
    // of the page and the main grid below.
    const companies = Array.from(map.values()).sort((a, b) => b.jobCount - a.jobCount);

    return NextResponse.json({
      companies,
      total: companies.length,
    });
  } catch (err: any) {
    logError({ event: 'companies.get_failed', error: err?.message ?? String(err) });
    return NextResponse.json(
      { error: 'Failed to load companies', companies: [], total: 0 },
      { status: 500 },
    );
  }
}
