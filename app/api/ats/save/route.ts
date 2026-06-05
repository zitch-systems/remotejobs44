// app/api/ats/save/route.ts — Save ATS-fetched jobs to Supabase
// Called by the bulk import UI after jobs are fetched
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { recordAdminAction } from '@/lib/admin/audit';
import { dedupeByApplyUrl } from '@/lib/dedupe-jobs';
import { logError } from '@/lib/log';
import type { Job } from '@/lib/types';

// jobs table has grown past 180k rows + 600MB. Each INSERT fires
// trg_jobs_search_vector (9 weighted tsvector fields including
// array_to_string() on text[] columns) AND updates the GIN index
// on search_vector. On a batch of 100, that's 100 trigger
// executions + 100 GIN index updates in a single statement —
// blew past Postgres's statement_timeout regularly. Drop to 25
// per chunk so each statement finishes inside the timeout. Adds
// modest overhead from more round-trips but keeps the import
// reliable. 60s lambda ceiling on top so the whole import can
// chunk through a few hundred rows without Vercel cutting it off.
export const maxDuration = 60;

const INSERT_CHUNK_SIZE = 25;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  try {
    const body = await req.json();
    const jobs: Partial<Job>[] = body.jobs ?? [];

    if (!Array.isArray(jobs) || jobs.length === 0) {
      return NextResponse.json({ error: 'No jobs provided' }, { status: 400 });
    }

    if (jobs.length > 1000) {
      return NextResponse.json({ error: 'Max 1000 jobs per save batch' }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();

    // Accept only http(s) URLs into the apply_url / source_url columns.
    // Callers feed this route from multiple sources (AI discovery, ATS
    // engine, company-import, raw paste) and not all of them validate
    // schemes upstream. A `javascript:` / `data:` value persisted into
    // jobs.apply_url would render through isSafeOpenUrl on click (safe)
    // but still show up in the JobPosting JSON-LD and admin previews.
    // Collapse to null when the value isn't a real http(s) URL.
    function sanitiseUrl(raw: unknown): string | null {
      const s = String(raw ?? '').trim();
      if (!s) return null;
      try {
        const u = new URL(s);
        return u.protocol === 'http:' || u.protocol === 'https:' ? s : null;
      } catch {
        return null;
      }
    }

    // Coerce ATS-supplied list fields into a clean text[] | null. Different
    // ATS parsers return requirements/skills/benefits as a string[], a single
    // string, or occasionally a nested/objecty blob — feeding a non-array
    // value straight into the text[] columns is one way a single row can
    // poison its whole insert chunk. Normalise to trimmed, non-empty strings.
    function toTextArray(v: unknown): string[] | null {
      if (v == null) return null;
      if (Array.isArray(v)) {
        const arr = v.map(x => String(x).trim()).filter(Boolean);
        return arr.length ? arr : null;
      }
      if (typeof v === 'string') {
        const s = v.trim();
        return s ? [s] : null;
      }
      return null;
    }

    // Transform camelCase Job to snake_case DB row. Dedup happens after
    // this map: rows are collapsed on apply_url and upserted against the
    // unique index (migration_v25), so a posting already in the DB is
    // skipped rather than duplicated.
    const rows = jobs.map(j => ({
      title:        j.title ?? 'Untitled',
      company:      j.company ?? 'Unknown',
      logo:         j.logo ?? (j.company ? j.company[0] : '?'),
      category:     j.category ?? 'other',
      type:         j.type ?? 'full-time',
      level:        j.level ?? null,
      salary_min:   j.salaryMin ?? null,
      salary_max:   j.salaryMax ?? null,
      currency:     j.currency ?? 'USD',
      location:     j.location ?? 'Worldwide',
      timezone:     j.timezone ?? null,
      description:  j.description ?? '',
      requirements: toTextArray(j.requirements),
      skills:       toTextArray(j.skills),
      benefits:     toTextArray(j.benefits),
      apply_url:    sanitiseUrl(j.applyUrl),
      apply_email:  j.applyEmail ?? null,
      posted_at:    j.posted ? new Date(j.posted).toISOString() : new Date().toISOString(),
      expires_at:   j.expires ?? null,
      featured:     false,
      is_new:       true,
      is_active:    true,
      source:       j.source ?? 'api',
      source_url:   sanitiseUrl(j.sourceUrl),
      remote:       j.remote ?? true,
    }));

    // Collapse repeats inside this payload (a single ON CONFLICT command
    // can't touch the same apply_url twice), then upsert with ON CONFLICT
    // DO NOTHING against migration_v25's unique index. select('id')
    // returns only the rows actually inserted, so `inserted` counts
    // genuinely new postings; anything already in the DB is a skipped
    // duplicate (computed below).
    const deduped = dedupeByApplyUrl(rows);

    let inserted = 0;
    let failed   = 0;
    // Keep the first DB-error message so we can surface it in the
    // response when nothing inserts. Without this, two days of
    // bulk-import failures (the search_vector trigger bug) reported
    // success-with-skipped and the user thought rows were just being
    // deduped. The audit log captured failed/inserted but the client
    // never saw why.
    let firstError: string | null = null;

    const upsertChunk = (chunk: typeof deduped) =>
      supabase
        .from('jobs')
        .upsert(chunk, { onConflict: 'apply_url', ignoreDuplicates: true })
        .select('id');

    for (let i = 0; i < deduped.length; i += INSERT_CHUNK_SIZE) {
      const batch = deduped.slice(i, i + INSERT_CHUNK_SIZE);

      // With ignoreDuplicates, data holds only the inserted rows — never
      // default to batch.length or duplicates would inflate the count.
      const { data, error } = await upsertChunk(batch);
      if (!error) {
        inserted += data?.length ?? 0;
        continue;
      }

      // A single bad row (a value Postgres rejects — e.g. "invalid input
      // syntax for type json") fails the ENTIRE chunk's statement, which
      // previously counted all 25 as failed and lost the 24 good rows with
      // it. Retry the chunk row-by-row so good rows still land and we isolate
      // (and log) only the genuinely-bad ones — `failed` then reflects the
      // real count, and the row log pinpoints the offending posting.
      logError({ event: 'ats.save.batch_failed', error: error.message, retrying_rows: batch.length });
      for (const row of batch) {
        const { data: d1, error: e1 } = await upsertChunk([row]);
        if (e1) {
          failed += 1;
          if (!firstError) firstError = e1.message;
          logError({ event: 'ats.save.row_failed', error: e1.message, apply_url: row.apply_url ?? null, title: row.title });
        } else {
          inserted += d1?.length ?? 0;
        }
      }
    }

    // Whatever was submitted but neither inserted nor failed was an
    // existing posting the unique index skipped.
    const duplicates = Math.max(0, jobs.length - inserted - failed);

    // Revalidate jobs pages so newly saved jobs appear immediately
    try {
      const { revalidatePath } = await import('next/cache');
      revalidatePath('/jobs');
      revalidatePath('/');
    } catch {}

    // Bulk imports are high-blast-radius admin actions — a compromised
    // admin session could shove thousands of fake jobs into the public
    // feed. The audit row makes it possible to find and roll back via
    // (admin_id, action='ats.bulk_import', created_at). Sample of source
    // names in metadata helps identify which feed got abused without
    // recording every UUID.
    const sampleSources = Array.from(new Set(rows.map(r => r.source ?? 'api'))).slice(0, 10);
    await recordAdminAction({
      adminId: auth.adminId, adminEmail: auth.adminEmail,
      action: 'ats.bulk_import', targetType: null, targetId: null,
      metadata: { inserted, failed, total: jobs.length, sample_sources: sampleSources },
    });

    // 502 only when rows actually died at the DB and nothing inserted.
    // A batch that inserted nothing because every row was already in the
    // DB is a success (skipped > 0, failed = 0), not a failure — so dedup
    // can never masquerade as an error, and (the earlier fix) a real DB
    // failure can never masquerade as dedup.
    if (inserted === 0 && failed > 0) {
      return NextResponse.json({
        success: false,
        inserted: 0,
        skipped: duplicates,
        failed,
        total: jobs.length,
        error: firstError ?? 'All rows failed to insert',
      }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      inserted,
      // `skipped` now means "already in the DB" — deduped on apply_url —
      // which is the meaning the import UI's "X saved · Y skipped" label
      // expects. Failed rows are reported separately so a DB failure can
      // never hide inside the dedup count.
      skipped: duplicates,
      failed,
      total: jobs.length,
      // When some rows succeeded and some failed, hand the client the
      // first error message too so the admin sees what went wrong on
      // the dead rows instead of just a count.
      ...(failed > 0 && firstError ? { partial_error: firstError } : {}),
    });
  } catch (err: any) {
    // The intentional firstError / partial_error leaks above expose
    // per-row Postgres detail to the admin — that's the documented
    // debugging contract. This top-level catch is the OTHER bucket:
    // body parse failures, runtime errors, etc. — generic shape.
    logError({ event: 'ats.save.unhandled', error: err?.message ?? String(err) });
    return NextResponse.json({ error: 'Failed to save jobs.' }, { status: 500 });
  }
}
