#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(
  new URL('../supabase/migration_v72_stale_ats_boards_skip_scan.sql', import.meta.url),
  'utf8',
);
const db = new PGlite();

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;

  create table public.jobs (
    id bigint generated always as identity primary key,
    source text not null,
    source_url text,
    last_seen_at timestamptz
  );
  create index jobs_ats_api_source_last_seen_idx
    on public.jobs(source_url, last_seen_at)
    where source = 'api' and source_url is not null;
  grant select on public.jobs to service_role;
`);
await db.exec(migration);

const greenhouse = 'https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true';
const lever = 'https://api.lever.co/v0/postings/example?mode=json';
const ashby = 'https://api.ashbyhq.com/posting-api/job-board/demo?includeCompensation=true';
const workable = 'https://apply.workable.com/api/v3/accounts/example/jobs';

await db.query(
  `insert into public.jobs(source, source_url, last_seen_at) values
    ('api', $1, '2026-08-01T00:00:00Z'),
    ('api', $1, '2026-09-01T00:00:00Z'),
    ('api', $2, '2026-07-01T00:00:00Z'),
    ('api', $3, '2026-08-15T00:00:00Z'),
    ('api', $4, null),
    ('remoteok', $1, '2030-01-01T00:00:00Z'),
    ('api', 'https://invalid.example/jobs', '2026-01-01T00:00:00Z'),
    ('remoteok', 'https://remoteok.com/api', '2025-01-01T00:00:00Z')`,
  [greenhouse, lever, ashby, workable],
);

async function asServiceRole(limit) {
  await db.exec('set role service_role');
  try {
    return (await db.query(
      `select * from public.stale_ats_boards($1)`,
      [limit],
    )).rows;
  } finally {
    await db.exec('reset role');
  }
}

test('returns exact per-board max/count ordered oldest first', async () => {
  const rows = await asServiceRole(10);

  assert.deepEqual(rows.map(row => row.source_url), [workable, lever, ashby, greenhouse]);
  assert.deepEqual(rows.map(row => row.job_count), [1, 1, 1, 2]);
  assert.equal(rows[0].last_seen, null);
  assert.equal(rows[3].last_seen.toISOString(), '2026-09-01T00:00:00.000Z');
});

test('limits the output batch and excludes non-ATS/non-api rows', async () => {
  const rows = await asServiceRole(2);
  assert.deepEqual(rows.map(row => row.source_url), [workable, lever]);
});

test('keeps RPC execution service-role only', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(
        db.query(`select * from public.stale_ats_boards(1)`),
        (error) => error?.code === '42501',
      );
    } finally {
      await db.exec('reset role');
    }
  }
});

test.after(async () => {
  await db.close();
});
