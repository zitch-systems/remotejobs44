#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(
  new URL('../supabase/migrations/20260925082127_job_discovery_metadata.sql', import.meta.url),
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
