// app/api/companies/route.ts — Public companies directory.
//
// Aggregates by company across the entire active jobs table. Before this
// route, /companies fetched only the first 200 jobs and derived its
// directory from that sample — out of 64k+ rows, that meant the page
// showed ~150 companies with badly-wrong per-company counts. Now we run
// the GROUP BY in Postgres and stream a complete, sorted list.
//
// Pro-only and per-requester (`force-dynamic`), so it is not edge-cached.
import { NextResponse } from 'next/server';
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequesterPlan, canSeeCompanyName } from '@/lib/auth/requester-plan';
import { logError } from '@/lib/log';

export const dynamic = 'force-dynamic';

interface CompanyAggregate {
  name:       string;
  logo:       string;
  jobCount:   number;
  categories: string[];
  featured:   boolean;
}

export async function GET() {
  try {
    const requesterPlan = await getRequesterPlan(await createServerSupabaseClient());
    if (!canSeeCompanyName(requesterPlan)) {
      return NextResponse.json(
        { error: 'A Pro subscription is required to browse employers.' },
        { status: 403 },
      );
    }
    const supabase = createAdminSupabaseClient();

    // Server-side GROUP BY via the companies_aggregate() function (added
    // by migration: add_companies_aggregate_function). The previous
    // approach pulled rows over the wire and aggregated in JS, but
    // PostgREST capped the response at 1000 rows so only ~75 of the
    // real ~950 companies surfaced. The function returns 951 rows for
    // 64k jobs in ~150 ms — cheap, accurate, capped.
    const { data, error } = await supabase.rpc('companies_aggregate');

    if (error) throw new Error(error.message);

    const companies: CompanyAggregate[] = (data ?? []).map((r: any) => ({
      name:       r.name,
      logo:       r.logo ?? r.name?.[0]?.toUpperCase() ?? '?',
      jobCount:   Number(r.job_count ?? 0),
      categories: r.categories ?? [],
      featured:   !!r.featured,
    }));

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
