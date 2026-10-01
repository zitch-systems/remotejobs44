#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration74 = await readFile(new URL('../supabase/migration_v74_application_identity_privacy.sql', import.meta.url), 'utf8');
const migration76 = await readFile(new URL('../supabase/migration_v76_application_capability_hardening.sql', import.meta.url), 'utf8');
const migration77 = await readFile(new URL('../supabase/migration_v77_application_limits_atomic.sql', import.meta.url), 'utf8');
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const JOB = '33333333-3333-4333-8333-333333333333';
const OTHER_JOB = '44444444-4444-4444-8444-444444444444';
const db = new PGlite();

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create function auth.role() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claim.role', true), '')
  $$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid(), auth.role() to authenticated;

  create table public.profiles (
    id uuid primary key, plan text not null default 'free', role text not null default 'user',
    plan_expires_at timestamptz, created_at timestamptz not null default now(),
    suspended boolean not null default false
  );
  create table public.jobs (
    id uuid primary key, title text not null, company text not null, logo text,
    is_active boolean not null default true, flagged boolean default false,
    expires_at timestamptz
  );
  create table public.applications (
    id uuid default gen_random_uuid() primary key,
    user_id uuid not null references public.profiles(id),
    job_id uuid not null references public.jobs(id),
    job_title text not null, company text not null, company_logo text,
    status text not null default 'applied', applied_at timestamptz default now(),
    updated_at timestamptz default now(), notes text, auto_applied boolean default false,
    steps jsonb default '[]'::jsonb, unique(user_id, job_id)
  );
  create table public.subscriptions (
    user_id uuid not null, billing text, status text,
    current_period_start timestamptz, current_period_end timestamptz
  );
  insert into auth.users values ('${USER}',now()), ('${OTHER}',now());
  insert into public.profiles(id) values ('${USER}'), ('${OTHER}');
  insert into public.jobs(id,title,company) values
    ('${JOB}', 'Senior C++ Engineer at Acme (Remote)', 'Acme'),
    ('${OTHER_JOB}', 'Platform Engineer', 'Other Corp');
  insert into public.applications(user_id,job_id,job_title,company,company_logo)
    values ('${USER}','${JOB}','Senior C++ Engineer at Acme (Remote)','Acme','logo');
  grant all on public.applications, public.jobs, public.profiles to authenticated;
  alter table public.applications enable row level security;
  create policy apps_select on public.applications for select using (auth.uid() = user_id);
  create policy apps_insert on public.applications for insert with check (auth.uid() = user_id);
  create policy apps_update on public.applications for update using (auth.uid() = user_id);
`);
await db.exec(migration74);
await db.exec(migration76);
await db.exec(migration77);

async function asUser(operation) {
  await db.exec(`select set_config('request.jwt.claim.sub','${USER}',false), set_config('request.jwt.claim.role','authenticated',false); set role authenticated;`);
  try { return await operation(); } finally { await db.exec('reset role'); }
}

test('migration scrubs only identity and preserves the historical role title', async () => {
  const { rows } = await db.query('select job_title, company, company_logo from public.applications where job_id=$1', [JOB]);
  assert.deepEqual(rows[0], { job_title: 'Senior C++ Engineer at [Hidden Company] (Remote)', company: null, company_logo: null });
});

test('direct insert canonicalizes owner, title, and timestamp', async () => {
  const before = Date.now();
  await asUser(() => db.query(`insert into public.applications(user_id,job_id,job_title,company,applied_at,auto_applied)
    values ($1,$2,'Fake title','Leaked Co','2000-01-01',true)`, [OTHER, OTHER_JOB]));
  const { rows } = await db.query('select user_id,job_title,company,applied_at,auto_applied from public.applications where job_id=$1', [OTHER_JOB]);
  assert.equal(rows[0].user_id, USER);
  assert.equal(rows[0].job_title, 'Platform Engineer');
  assert.equal(rows[0].company, null);
  assert.equal(rows[0].auto_applied, false);
  assert.ok(new Date(rows[0].applied_at).getTime() >= before);
});

test('job linkage and application timestamp are immutable while tracker status remains editable', async () => {
  await assert.rejects(asUser(() => db.query('update public.applications set job_id=$1 where job_id=$2', [OTHER_JOB, JOB])), /permission denied/i);
  await assert.rejects(asUser(() => db.query("update public.applications set applied_at='2000-01-01' where job_id=$1", [JOB])), /permission denied/i);
  await asUser(() => db.query("update public.applications set status='interview', notes='follow up' where job_id=$1", [JOB]));
  const { rows } = await db.query('select status,notes from public.applications where job_id=$1', [JOB]);
  assert.deepEqual(rows[0], { status: 'interview', notes: 'follow up' });
});

test('inactive jobs cannot be fabricated as tracked applications', async () => {
  const dead = '55555555-5555-4555-8555-555555555555';
  await db.query("insert into public.jobs(id,title,company,is_active) values ($1,'Engineer','Dead Co',false)", [dead]);
  await assert.rejects(asUser(() => db.query(`insert into public.applications(user_id,job_id,job_title,company) values ($1,$2,'Fake','Fake')`, [USER, dead])), /job_not_available/i);
});

test('concurrent free inserts stop atomically at three', async () => {
  const freeUser = '66666666-6666-4666-8666-666666666666';
  await db.query('insert into auth.users values ($1,now())', [freeUser]);
  await db.query('insert into public.profiles(id) values ($1)', [freeUser]);
  const jobIds = Array.from({ length: 6 }, (_, i) => `70000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
  for (const [i, id] of jobIds.entries()) await db.query('insert into public.jobs(id,title,company) values ($1,$2,$3)', [id, `Engineer ${i}`, 'Example Co']);
  await db.exec(`select set_config('request.jwt.claim.sub','${freeUser}',false), set_config('request.jwt.claim.role','authenticated',false); set role authenticated;`);
  const results = await Promise.allSettled(jobIds.map(id => db.query(
    `insert into public.applications(user_id,job_id,job_title,company) values ($1,$2,'Fake','Fake')`, [freeUser, id],
  )));
  await db.exec('reset role');
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 3);
  const { rows } = await db.query('select count(*)::int as n from public.applications where user_id=$1', [freeUser]);
  assert.equal(rows[0].n, 3);
});

test('concurrent Day Pass inserts stop atomically at ten', async () => {
  const dailyUser = '88888888-8888-4888-8888-888888888888';
  await db.query('insert into auth.users values ($1,now())', [dailyUser]);
  await db.query("insert into public.profiles(id,plan,plan_expires_at) values ($1,'daily',now()+interval '1 day')", [dailyUser]);
  await db.query("insert into public.subscriptions values ($1,'daily','active',now()-interval '1 minute',now()+interval '1 day')", [dailyUser]);
  const jobIds = Array.from({ length: 12 }, (_, i) => `90000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
  for (const [i, id] of jobIds.entries()) await db.query('insert into public.jobs(id,title,company) values ($1,$2,$3)', [id, `Engineer ${i}`, 'Example Co']);
  await db.exec(`select set_config('request.jwt.claim.sub','${dailyUser}',false), set_config('request.jwt.claim.role','authenticated',false); set role authenticated;`);
  const results = await Promise.allSettled(jobIds.map(id => db.query(
    `insert into public.applications(user_id,job_id,job_title,company) values ($1,$2,'Fake','Fake')`, [dailyUser, id],
  )));
  await db.exec('reset role');
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 10);
  const { rows } = await db.query('select count(*)::int as n from public.applications where user_id=$1', [dailyUser]);
  assert.equal(rows[0].n, 10);
});

test('replacement labels are not reprocessed when employer is Company', async () => {
  const { rows } = await db.query("select public.application_safe_job_title('Company Engineer at Company','Company') as title");
  assert.equal(rows[0].title, '[Hidden Company] Engineer at [Hidden Company]');
});

test('unconfirmed users and Day Passes without a live subscription fail closed', async () => {
  const unconfirmed = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const noSub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const jobA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const jobB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  await db.query('insert into auth.users values ($1,null),($2,now())', [unconfirmed, noSub]);
  await db.query('insert into public.profiles(id) values ($1)', [unconfirmed]);
  await db.query("insert into public.profiles(id,plan,plan_expires_at) values ($1,'daily',now()+interval '1 day')", [noSub]);
  await db.query("insert into public.jobs(id,title,company) values ($1,'Engineer','Example'),($2,'Engineer','Example')", [jobA, jobB]);

  for (const [user, job, message] of [[unconfirmed, jobA, /email_unconfirmed/], [noSub, jobB, /day_pass_not_active/]]) {
    await db.exec(`select set_config('request.jwt.claim.sub','${user}',false), set_config('request.jwt.claim.role','authenticated',false); set role authenticated;`);
    await assert.rejects(db.query(`insert into public.applications(user_id,job_id,job_title,company) values ($1,$2,'Fake','Fake')`, [user, job]), message);
    await db.exec('reset role');
  }
});

test('suspended users cannot insert even with an otherwise active Pro plan', async () => {
  const suspended = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const job = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  await db.query('insert into auth.users values ($1,now())', [suspended]);
  await db.query("insert into public.profiles(id,plan,plan_expires_at,suspended) values ($1,'pro',now()+interval '1 month',true)", [suspended]);
  await db.query("insert into public.jobs(id,title,company) values ($1,'Engineer','Example')", [job]);
  await db.exec(`select set_config('request.jwt.claim.sub','${suspended}',false), set_config('request.jwt.claim.role','authenticated',false); set role authenticated;`);
  await assert.rejects(db.query(`insert into public.applications(user_id,job_id,job_title,company) values ($1,$2,'Fake','Fake')`, [suspended, job]), /account_suspended/);
  await db.exec('reset role');
});
