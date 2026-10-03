#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(
  new URL('../supabase/migrations/20260925082127_job_discovery_metadata.sql', import.meta.url),
  'utf8',
);
const writeThrottleMigration = await readFile(
  new URL('../supabase/migration_v79_ats_metadata_write_throttle.sql', import.meta.url),
  'utf8',
);
const db = new PGlite();

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create table public.jobs (
    id bigint generated always as identity primary key,
    title text not null,
    description text not null default '',
    location text,
    remote boolean default false,
    source text not null,
    source_url text,
    apply_url text unique,
    salary_min integer,
    salary_max integer,
    currency text,
    logo text,
    flagged boolean default false,
    flagged_reason text,
    is_active boolean default true,
    is_new boolean default true,
    posted_at timestamptz default now(),
    last_seen_at timestamptz
  );
  grant select, update on public.jobs to service_role;
`);
await db.exec(migration);
await db.exec(writeThrottleMigration);

test('classifies workplace and only explicit relocation or visa support', async () => {
  await db.query(
    `insert into public.jobs(title, description, location, remote, source, source_url, apply_url) values
      ('Remote role', 'We do not offer relocation or visa sponsorship.', 'Remote — US', true, 'api', 'board', 'one'),
      ('Hybrid role', 'Relocation assistance is available for this position.', 'Hybrid / Remote', true, 'api', 'board', 'two'),
      ('Office role', 'Visa sponsorship may be available if eligible.', 'On-site in Lagos', false, 'api', 'board', 'three')`,
  );
  const { rows } = await db.query(
    `select apply_url, workplace_type, relocation_supported, visa_sponsorship
       from public.jobs order by apply_url`,
  );
  assert.deepEqual(rows.map(row => [row.apply_url, row.workplace_type,
    row.relocation_supported, row.visa_sponsorship]), [
    ['one', 'remote', false, false],
    ['three', 'onsite', false, false],
    ['two', 'hybrid', true, false],
  ]);
});

test('refreshes existing ATS metadata and reactivates a seen posting', async () => {
  await db.query(`update public.jobs set is_active=false where apply_url='one'`);
  await db.exec('set role service_role');
  try {
    const { rows } = await db.query(
      `select public.update_ats_metadata($1, $2::jsonb) as result`,
      ['board', JSON.stringify([{
        apply_url: 'one', title: 'Updated remote role', description: 'Visa sponsorship is provided.',
        location: 'Worldwide', remote: true, workplace_hint: 'remote', salary_text: 'USD 100,000 per year',
        salary_min: 100000, salary_max: 120000, currency: 'USD', logo: 'https://cdn.example/logo.png',
        flagged: false,
      }])],
    );
    assert.deepEqual(rows[0].result, { updated: 1, reactivated: 1 });
  } finally {
    await db.exec('reset role');
  }
  const updated = (await db.query(
    `select title, salary_min, salary_max, salary_text, workplace_type, visa_sponsorship, logo, is_active
       from public.jobs where apply_url='one'`,
  )).rows[0];
  assert.equal(updated.title, 'Updated remote role');
  assert.equal(updated.salary_min, 100000);
  assert.equal(updated.salary_max, 120000);
  assert.equal(updated.workplace_type, 'remote');
  assert.equal(updated.visa_sponsorship, true);
  assert.equal(updated.logo, 'https://cdn.example/logo.png');
  assert.equal(updated.is_active, true);
});

test('v79 skips a fresh unchanged row without fabricating a reactivation', async () => {
  await db.query(
    `insert into public.jobs(title, description, location, remote, source, source_url, apply_url,
       salary_min, salary_max, currency, workplace_hint, salary_text, last_seen_at)
     values ('Fresh', 'Same', 'Remote', true, 'api', 'throttle-board', 'fresh',
       100000, 120000, 'USD', 'remote', 'USD 100k-120k', now())`,
  );
  await db.exec('set role service_role');
  try {
    const { rows } = await db.query(`select public.update_ats_metadata($1,$2::jsonb) result`, [
      'throttle-board', JSON.stringify([{ apply_url: 'fresh', title: 'Fresh', description: 'Same',
        location: 'Remote', remote: true, workplace_hint: 'remote', salary_text: 'USD 100k-120k',
        salary_min: 100000, salary_max: 120000, currency: 'USD', flagged: false }]),
    ]);
    assert.deepEqual(rows[0].result, { updated: 0, reactivated: 0 });
  } finally { await db.exec('reset role'); }
});

test('v79 applies a metadata change immediately even while freshness is recent', async () => {
  await db.exec('set role service_role');
  try {
    const { rows } = await db.query(`select public.update_ats_metadata($1,$2::jsonb) result`, [
      'throttle-board', JSON.stringify([{ apply_url: 'fresh', title: 'Changed immediately', description: 'Same',
        location: 'Remote', remote: true, workplace_hint: 'remote', salary_text: 'USD 100k-120k',
        salary_min: 100000, salary_max: 120000, currency: 'USD', flagged: false }]),
    ]);
    assert.deepEqual(rows[0].result, { updated: 1, reactivated: 0 });
  } finally { await db.exec('reset role'); }
  assert.equal((await db.query(`select title from public.jobs where apply_url='fresh'`)).rows[0].title,
    'Changed immediately');
});

test('v79 refreshes an unchanged row after six hours', async () => {
  await db.query(`update public.jobs set last_seen_at=now()-interval '7 hours' where apply_url='fresh'`);
  const before = (await db.query(`select last_seen_at from public.jobs where apply_url='fresh'`)).rows[0].last_seen_at;
  await db.exec('set role service_role');
  try {
    const { rows } = await db.query(`select public.update_ats_metadata($1,$2::jsonb) result`, [
      'throttle-board', JSON.stringify([{ apply_url: 'fresh', title: 'Changed immediately', description: 'Same',
        location: 'Remote', remote: true, workplace_hint: 'remote', salary_text: 'USD 100k-120k',
        salary_min: 100000, salary_max: 120000, currency: 'USD', flagged: false }]),
    ]);
    assert.deepEqual(rows[0].result, { updated: 1, reactivated: 0 });
  } finally { await db.exec('reset role'); }
  const after = (await db.query(`select last_seen_at from public.jobs where apply_url='fresh'`)).rows[0].last_seen_at;
  assert.ok(new Date(after) > new Date(before));
});

test('v79 immediately reactivates an inactive row even with a fresh timestamp', async () => {
  await db.query(`update public.jobs set is_active=false,last_seen_at=now() where apply_url='fresh'`);
  await db.exec('set role service_role');
  try {
    const { rows } = await db.query(`select public.update_ats_metadata($1,$2::jsonb) result`, [
      'throttle-board', JSON.stringify([{ apply_url: 'fresh', title: 'Changed immediately', description: 'Same',
        location: 'Remote', remote: true, workplace_hint: 'remote', salary_text: 'USD 100k-120k',
        salary_min: 100000, salary_max: 120000, currency: 'USD', flagged: false }]),
    ]);
    assert.deepEqual(rows[0].result, { updated: 1, reactivated: 1 });
  } finally { await db.exec('reset role'); }
  assert.equal((await db.query(`select is_active from public.jobs where apply_url='fresh'`)).rows[0].is_active, true);
});

test('v79 preserves service_role-only execution permission', async () => {
  const { rows } = await db.query(`select
    has_function_privilege('service_role','public.update_ats_metadata(text,jsonb)','execute') service_ok,
    has_function_privilege('anon','public.update_ats_metadata(text,jsonb)','execute') anon_ok,
    has_function_privilege('authenticated','public.update_ats_metadata(text,jsonb)','execute') authenticated_ok`);
  assert.deepEqual(rows[0], { service_ok: true, anon_ok: false, authenticated_ok: false });
});

test('retires only missing jobs from the exact completed board', async () => {
  await db.query(
    `insert into public.jobs(title, source, source_url, apply_url) values
      ('Other board', 'api', 'other-board', 'other'),
      ('Manual role', 'manual', 'board', 'manual')`,
  );
  await db.exec('set role service_role');
  try {
    const { rows } = await db.query(
      `select public.retire_missing_ats_jobs('board', array['one']) as removed`,
    );
    assert.equal(rows[0].removed, 2);
  } finally {
    await db.exec('reset role');
  }
  const { rows } = await db.query(
    `select apply_url, is_active from public.jobs order by apply_url`,
  );
  assert.equal(rows.find(row => row.apply_url === 'one').is_active, true);
  assert.equal(rows.find(row => row.apply_url === 'two').is_active, false);
  assert.equal(rows.find(row => row.apply_url === 'three').is_active, false);
  assert.equal(rows.find(row => row.apply_url === 'manual').is_active, true);
  assert.equal(rows.find(row => row.apply_url === 'other').is_active, true);
});

test.after(async () => {
  await db.close();
});
