#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(
  new URL('../supabase/migrations/20261001094504_token_cron_locks.sql', import.meta.url),
  'utf8',
);
const db = new PGlite();
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create table public.cron_locks (
    name text primary key,
    acquired_at timestamptz not null default now(),
    expires_at timestamptz not null
  );
`);
await db.exec(migration);

const OWNER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

async function asService(sql, params = []) {
  await db.exec('set role service_role');
  try { return await db.query(sql, params); }
  finally { await db.exec('reset role'); }
}

test('expired holder cannot release the successor lock', async () => {
  let result = await asService(
    'select public.acquire_cron_lock($1,$2::uuid,600) acquired', ['ingest', OWNER_A],
  );
  assert.equal(result.rows[0].acquired, true);

  await db.exec("update public.cron_locks set expires_at = now() - interval '1 second' where name = 'ingest'");
  result = await asService(
    'select public.acquire_cron_lock($1,$2::uuid,600) acquired', ['ingest', OWNER_B],
  );
  assert.equal(result.rows[0].acquired, true);

  result = await asService(
    'select public.release_owned_cron_lock($1,$2::uuid) released', ['ingest', OWNER_A],
  );
  assert.equal(result.rows[0].released, false);
  const row = (await db.query("select owner_token from public.cron_locks where name = 'ingest'")).rows[0];
  assert.equal(row.owner_token, OWNER_B);

  result = await asService(
    'select public.release_owned_cron_lock($1,$2::uuid) released', ['ingest', OWNER_B],
  );
  assert.equal(result.rows[0].released, true);
  assert.equal((await db.query("select count(*)::integer n from public.cron_locks where name = 'ingest'")).rows[0].n, 0);
});

test('browser roles cannot invoke lock functions', async () => {
  await db.exec('set role authenticated');
  try {
    await assert.rejects(
      db.query('select public.acquire_cron_lock($1,$2::uuid,600)', ['ingest', OWNER_A]),
      /permission denied/i,
    );
  } finally { await db.exec('reset role'); }
});
