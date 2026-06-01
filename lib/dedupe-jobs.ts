// lib/dedupe-jobs.ts
// In-batch dedup on apply_url, shared by every write path that bulk-loads
// jobs (cron ingest, ATS bulk save, company refresh).
//
// jobs has a UNIQUE index on apply_url (migration_v25), so a single
// INSERT ... ON CONFLICT statement must not carry the same apply_url
// twice — Postgres rejects a command that would "affect a row a second
// time". Sources and bulk payloads legitimately repeat a posting within
// one batch, so we collapse them here before the upsert. Last occurrence
// wins, so the freshest copy in the batch is the one written.
//
// Rows with no apply_url are passed through untouched: NULLs compare
// distinct in a unique index, so they never conflict and can't be deduped
// against each other anyway.
export function dedupeByApplyUrl<T extends { apply_url?: string | null }>(rows: T[]): T[] {
  const byUrl = new Map<string, T>();
  const withoutUrl: T[] = [];
  for (const row of rows) {
    const url = row.apply_url;
    if (!url) {
      withoutUrl.push(row);
      continue;
    }
    byUrl.set(url, row); // last write wins
  }
  return [...byUrl.values(), ...withoutUrl];
}
