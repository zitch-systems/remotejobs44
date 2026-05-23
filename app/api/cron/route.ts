// app/api/cron/ingest/route.ts
// Vercel Cron Job — set in vercel.json, runs every 6 hours
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';

const CRON_SECRET = process.env.CRON_SECRET ?? '';

const SOURCES = [
  { name: 'Remotive', url: 'https://remotive.com/api/remote-jobs?limit=50', type: 'json-api' },
  { name: 'Jobicy',   url: 'https://jobicy.com/api/v2/remote-jobs?count=50', type: 'json-api' },
];

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const results: Record<string, number> = {};
  let totalAdded = 0;

  for (const source of SOURCES) {
    try {
      const res  = await fetch(source.url, { signal: AbortSignal.timeout(15000) });
      const data = await res.json();
      const raw  = data.jobs ?? data.data ?? [];

      const jobs = raw.slice(0, 50).map((j: any) => ({
        title:       j.title ?? j.job_title ?? 'Untitled',
        company:     j.company_name ?? j.company ?? 'Unknown',
        logo:        (j.company_name ?? j.company ?? 'U')[0].toUpperCase(),
        category:    mapCat(j.category ?? ''),
        type:        'full-time',
        level:       mapLevel(j.title ?? ''),
        location:    j.candidate_required_location ?? 'Worldwide',
        description: (j.description ?? '').slice(0, 5000),
        salary_min:  j.salary_min ?? null,
        salary_max:  j.salary_max ?? null,
        currency:    j.salary_currency ?? 'USD',
        apply_url:   j.url ?? j.apply_url ?? null,
        posted_at:   j.publication_date ?? new Date().toISOString(),
        source:      'api',
        source_url:  source.url,
        remote:      true,
        featured:    false,
        is_new:      true,
        is_active:   true,
      })).filter((j: any) => j.apply_url);

      if (!jobs.length) { results[source.name] = 0; continue; }

      const { data: inserted } = await supabase
        .from('jobs')
        .upsert(jobs, { onConflict: 'apply_url', ignoreDuplicates: true })
        .select('id');

      results[source.name] = inserted?.length ?? 0;
      totalAdded += results[source.name];
    } catch (err: any) {
      console.error(`Ingest ${source.name}:`, err.message);
      results[source.name] = -1;
    }
  }

  return NextResponse.json({ success: true, totalAdded, results, at: new Date().toISOString() });
}

function mapCat(raw: string): string {
  const r = raw.toLowerCase();
  if (/engineer|dev|software|devops|cloud/.test(r)) return 'engineering';
  if (/design|ui|ux/.test(r))                       return 'design';
  if (/market|seo|content/.test(r))                 return 'marketing';
  if (/financ|account/.test(r))                     return 'finance';
  if (/sales/.test(r))                              return 'sales';
  if (/data|analyst|ml|ai/.test(r))                 return 'data';
  if (/hr|recruit|people/.test(r))                  return 'hr';
  if (/product|pm\b/.test(r))                       return 'product';
  return 'other';
}

function mapLevel(title: string): string {
  const t = title.toLowerCase();
  if (/junior|entry|associate/.test(t))             return 'entry';
  if (/senior|sr\./.test(t))                        return 'senior';
  if (/lead|principal|staff/.test(t))               return 'lead';
  if (/vp|director|head|chief/.test(t))             return 'executive';
  return 'mid';
}
 