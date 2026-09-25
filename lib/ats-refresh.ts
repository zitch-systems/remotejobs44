// lib/ats-refresh.ts
// Recurring refresh of the ATS company boards already represented in the jobs
// table.
//
// Why this exists: ATS jobs (source='api') are imported once via the admin
// company-import / companies-refresh flow and were then never re-touched. The
// daily staleness sweep (app/api/cron/daily) deactivates any job whose
// last_seen_at is older than 60 days, so without a recurring "we still see
// this posting" signal every ATS posting was deactivated 60 days after we
// inserted it — even when the company still listed it. That single defect is
// what shrinks the public job count over time (the free aggregator feeds are a
// rounding error next to the ~34k ATS jobs).
//
// This module derives the ~1.1k distinct boards straight from jobs.source_url
// (via the stale_ats_boards() SQL function), re-fetches the least-recently-
// refreshed ones within a time budget, and for every posting still listed
// upstream: bumps last_seen_at AND reactivates it if the sweep had already
// retired it. Reactivation is safe here because admin_actions shows no company
// has ever been manually removed — so every inactive ATS row was retired by
// the sweep, not by an admin. Genuinely-new postings are inserted. Best-effort
// and fully isolated: one board failing never aborts the run, and the time
// budget keeps it comfortably inside the caller's maxDuration.
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { fetchATSJobs } from '@/lib/ats-engine';
import { isValidATSPlatform, type ATSPlatform } from '@/lib/ats-detect';
import { dedupeByApplyUrl } from '@/lib/dedupe-jobs';
import { detectScam } from '@/lib/scam-detect';
import { markSeenAndReactivate } from '@/lib/jobs-last-seen';
import { logInfo, logWarn, logError } from '@/lib/log';

type AdminSupabase = ReturnType<typeof createAdminSupabaseClient>;

// Mirrors /api/admin/companies/refresh — the search_vector GIN trigger on the
// jobs table can't take large INSERT batches reliably.
const INSERT_CHUNK = 25;

export interface ATSRefreshResult {
  boardsConsidered: number;
  boardsRefreshed: number;
  added: number;
  reactivated: number;
  errors: number;
  timedOut: boolean;
  /**
   * Set when the run could not start at all — the stale_ats_boards() RPC is
   * missing or errored, so there was no board list to walk. Distinguishes
   * "nothing was stale" from "the sweep never ran", which the all-zero
   * counters alone cannot: a missing function (PGRST202, the state this
   * module shipped in before migration_v70) returned the same zeros as a
   * healthy no-op and the cron reported success on top of them.
   */
  error?: string;
}

// Reverse of each ATS fetcher's URL builder in lib/ats-engine.ts: recover
// (platform, slug) from a stored jobs.source_url so the board can be re-fetched
// via fetchATSJobs. Returns null for any URL shape we don't recognise (the
// caller then skips that board). Exported for unit testing.
export function parseATSApiUrl(
  raw: string | null | undefined,
): { platform: ATSPlatform; slug: string } | null {
  if (!raw) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  const host = u.hostname.toLowerCase();
  const path = u.pathname;
  const seg = (re: RegExp): string | null => path.match(re)?.[1] ?? null;

  let platform: ATSPlatform | null = null;
  let slug: string | null = null;

  if (host === 'boards-api.greenhouse.io')      { platform = 'greenhouse';      slug = seg(/^\/v1\/boards\/([^/]+)\/jobs/); }
  else if (host === 'api.lever.co')             { platform = 'lever';           slug = seg(/^\/v0\/postings\/([^/]+)/); }
  else if (host === 'api.ashbyhq.com')          { platform = 'ashby';           slug = seg(/^\/posting-api\/job-board\/([^/]+)/); }
  else if (host === 'apply.workable.com')       { platform = 'workable';        slug = seg(/^\/api\/v3\/accounts\/([^/]+)\/jobs/); }
  else if (host === 'api.smartrecruiters.com')  { platform = 'smartrecruiters'; slug = seg(/^\/v1\/companies\/([^/]+)\/postings/); }
  else if (host.endsWith('.recruitee.com'))     { platform = 'recruitee';       slug = host.slice(0, -'.recruitee.com'.length); }
  else if (host.endsWith('.jobs.personio.de'))  { platform = 'personio';        slug = host.slice(0, -'.jobs.personio.de'.length); }
  else if (host.endsWith('.bamboohr.com'))      { platform = 'bamboohr';        slug = host.slice(0, -'.bamboohr.com'.length); }
  else if (host.endsWith('.breezy.hr'))         { platform = 'breezy';          slug = host.slice(0, -'.breezy.hr'.length); }

  if (!platform || !slug) return null;
  // slug is spliced into an outbound URL by fetchATSJobs — constrain it to the
  // same safe charset /api/admin/companies/refresh enforces.
  if (!/^[a-z0-9._-]{1,80}$/i.test(slug)) return null;
  if (!isValidATSPlatform(platform)) return null;
  return { platform, slug };
}

// Map an ATS fetcher's Partial<Job> (camelCase) onto a jobs-table row
// (snake_case). Mirrors app/api/admin/companies/refresh/route.ts so the manual
// and recurring ATS paths insert identical shapes.
function toJobRow(j: any): Record<string, any> {
  const row: Record<string, any> = {
    title:        j.title ?? 'Untitled',
    company:      j.company ?? 'Unknown',
    logo:         j.logo ?? (j.company ? String(j.company)[0] : '?'),
    category:     j.category ?? 'other',
    type:         j.type ?? 'full-time',
    level:        j.level ?? null,
    salary_min:   j.salaryMin ?? null,
    salary_max:   j.salaryMax ?? null,
    currency:     j.currency ?? 'USD',
    location:     j.location ?? 'Worldwide',
    timezone:     j.timezone ?? null,
    description:  j.description ?? '',
    requirements: j.requirements ?? null,
    skills:       j.skills ?? null,
    benefits:     j.benefits ?? null,
    apply_url:    j.applyUrl ?? null,
    apply_email:  j.applyEmail ?? null,
    posted_at:    j.posted ? new Date(j.posted).toISOString() : new Date().toISOString(),
    expires_at:   j.expires ?? null,
    featured:     false,
    is_new:       true,
    is_active:    true,
    source:       j.source ?? 'api',
    source_url:   j.sourceUrl ?? null,
    remote:       j.remote ?? true,
  };
  // Same first-pass scam screen the aggregator ingest applies — ATS boards are
  // first-party but not immune to a spammy/compromised posting, and this keeps
  // the two write paths consistent. flagged + flagged_reason are set on EVERY
  // row (explicit false/null when clean) so a batch mixing flagged and clean
  // rows doesn't NULL-override flagged's NOT NULL default via supabase-js's
  // union-of-keys insert column list.
  const scam = detectScam(row);
  row.flagged        = scam ? true : false;
  row.flagged_reason = scam ? scam.flagged_reason : null;
  return row;
}

// Refresh the least-recently-seen ATS boards within a time budget. Oldest-first
// (stale_ats_boards orders by max(last_seen_at) asc) so the boards closest to
// the 60-day cliff are always handled — guaranteeing that with even a small
// daily budget no still-listed board ages out (1.1k boards / 60 days ≈ 19
// boards/day to stay ahead).
export async function refreshStaleATSBoards(
  supabase: AdminSupabase,
  opts: { budgetMs?: number; maxBoards?: number } = {},
): Promise<ATSRefreshResult> {
  const budgetMs = opts.budgetMs ?? 45_000;
  const maxBoards = opts.maxBoards ?? 150;
  const startedAt = Date.now();
  const res: ATSRefreshResult = {
    boardsConsidered: 0, boardsRefreshed: 0, added: 0, reactivated: 0, errors: 0, timedOut: false,
  };
  const removedBoards: Array<{ source_url: string; retry_after: string; last_error: string }> = [];

  const { data: boards, error } = await supabase.rpc('stale_ats_boards', { p_limit: maxBoards });
  if (error) {
    // logError, not logWarn: with no board list there is nothing to refresh,
    // so every ATS posting keeps ageing towards the 60-day staleness cliff
    // until this is fixed. That is an outage of the sweep, not a hiccup.
    logError({ event: 'ats_refresh.rpc_failed', error: error.message });
    res.error = `stale_ats_boards RPC failed: ${error.message}`;
    return res;
  }
  const list = (boards ?? []) as Array<{ source_url: string }>;
  res.boardsConsidered = list.length;

  for (const board of list) {
    if (Date.now() - startedAt > budgetMs) { res.timedOut = true; break; }
    const parsed = parseATSApiUrl(board.source_url);
    if (!parsed) continue;
    try {
      const fetched = await fetchATSJobs(parsed.platform, parsed.slug, board.source_url);
      if (fetched.error) {
        res.errors++;
        logWarn({ event: 'ats_refresh.board_fetch_failed', platform: parsed.platform, slug: parsed.slug, error: fetched.error });
        // A removed board often remains the oldest in the database. Without
        // a retry delay it consumes the same slice of every daily run. Only
        // 404/410 are treated as confirmed removal; transient failures retry
        // on the next run.
        if (/\b(?:404|410)\b/.test(fetched.error)) {
          removedBoards.push({
            source_url: board.source_url,
            retry_after: new Date(Date.now() + 7 * 86_400_000).toISOString(),
            last_error: fetched.error.slice(0, 500),
          });
        }
        continue;
      }

      const rows = dedupeByApplyUrl(fetched.jobs.map(toJobRow).filter(r => !!r.apply_url));
      if (rows.length === 0) { res.boardsRefreshed++; continue; }

      // 1) Keep still-listed postings alive + recover any the sweep retired.
      //    Batched by request size in lib/jobs-last-seen — a board with a few
      //    hundred postings used to overrun the PostgREST request line and the
      //    returned error was discarded, so the bump silently did nothing.
      res.reactivated += await markSeenAndReactivate(
        supabase,
        rows.map(r => r.apply_url as string),
        `ats:${parsed.platform}/${parsed.slug}`,
      );

      // 2) Insert genuinely-new postings (ON CONFLICT DO NOTHING).
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        const { data, error: insErr } = await supabase
          .from('jobs')
          .upsert(rows.slice(i, i + INSERT_CHUNK), { onConflict: 'apply_url', ignoreDuplicates: true })
          .select('id');
        if (insErr) { res.errors++; continue; }
        res.added += data?.length ?? 0;
      }
      res.boardsRefreshed++;
    } catch (err: any) {
      res.errors++;
      logWarn({ event: 'ats_refresh.board_failed', source_url: board.source_url, error: err?.message ?? String(err) });
    }
  }

  if (removedBoards.length > 0) {
    const { error: backoffError } = await supabase
      .from('ats_board_backoff')
      .upsert(removedBoards, { onConflict: 'source_url' });
    if (backoffError) {
      res.errors++;
      logWarn({ event: 'ats_refresh.backoff_failed', error: backoffError.message });
    }
  }

  logInfo({ event: 'ats_refresh.done', ...res, elapsedMs: Date.now() - startedAt });
  return res;
}
