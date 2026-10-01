import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('duplicate cleanup preserves the best copy and locations, caps writes, and resumes', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table public.jobs (
        id bigint generated always as identity primary key,
        title text, company text, location text, is_active boolean default true,
        views integer default 0, applications integer default 0,
        last_seen_at timestamptz, posted_at timestamptz, created_at timestamptz default now(), updated_at timestamptz
      );
      insert into public.jobs(title,company,location,views)
      select 'Engineer','Example','Lagos', n from generate_series(1,205) n;
      insert into public.jobs(title,company,location,views) values ('Engineer','Example','London',1);
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/20261001094457_cron_maintenance_batches.sql', import.meta.url), 'utf8'));
    const run = async () => (await db.query('select public.dedupe_jobs() as n')).rows[0].n;
    assert.equal(await run(), 100);
    assert.equal(await run(), 100);
    assert.equal(await run(), 4);
    assert.equal(await run(), 0);
    const { rows } = await db.query('select location,views from public.jobs where is_active order by location');
    assert.deepEqual(rows, [{ location: 'Lagos', views: 205 }, { location: 'London', views: 1 }]);
    await db.exec('set role authenticated');
    await assert.rejects(run(), error => error.code === '42501');
  } finally { await db.close(); }
});
