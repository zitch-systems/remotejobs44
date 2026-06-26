// lib/dedupe-jobs.ts
// In-batch dedup on apply_url, shared by every write path that bulk-loads
// jobs (cron ingest, ATS bulk save, company refresh).
//
// jobs has a UNIQUE index on apply_url (migration_v25), so a single
// INSERT ... ON CONFLICT statement must not carry the same apply_url
// twice — Postgres rejects a command that would "affect a row a second
// time". Sources and bulk payloads legitimately repeat a posting within
// one batch, so we collapse them here before the upsert. When two rows share
// an apply_url we keep the BEST copy, not arbitrarily the last one:
//   1. a scam-flagged row wins over an unflagged one (fail safe — a flag must
//      never be dropped just because of array order), then
//   2. the row with the longer description wins (richer copy), then
//   3. ties go to the later occurrence (freshest).
//
// Rows with no apply_url are passed through untouched: NULLs compare
// distinct in a unique index, so they never conflict and can't be deduped
// against each other anyway.
type DedupeRow = { apply_url?: string | null; flagged?: boolean | null; description?: string | null };

function preferRow<T extends DedupeRow>(a: T, b: T): T {
  const af = !!a.flagged, bf = !!b.flagged;
  if (af !== bf) return af ? a : b;                 // keep the flagged one
  const al = a.description?.length ?? 0;
  const bl = b.description?.length ?? 0;
  return bl >= al ? b : a;                          // richer copy; tie → freshest (b)
}

export function dedupeByApplyUrl<T extends DedupeRow>(rows: T[]): T[] {
  const byUrl = new Map<string, T>();
  const withoutUrl: T[] = [];
  for (const row of rows) {
    const url = row.apply_url;
    if (!url) {
      withoutUrl.push(row);
      continue;
    }
    const prev = byUrl.get(url);
    byUrl.set(url, prev ? preferRow(prev, row) : row);
  }
  return [...byUrl.values(), ...withoutUrl];
}
