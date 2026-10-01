#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../supabase/migration_v73_admin_2fa_atomic_verify.sql', import.meta.url), 'utf8');
const USER = '11111111-1111-4111-8111-111111111111';
const db = new PGlite();

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  insert into auth.users values ('${USER}');
  create table public.admin_2fa_codes (
    id uuid default gen_random_uuid() primary key,
    user_id uuid not null references auth.users(id),
    code_hash text not null,
    expires_at timestamptz not null,
    consumed_at timestamptz,
    attempts integer not null default 0,
    created_at timestamptz not null default now()
  );
  grant select, update on public.admin_2fa_codes to service_role;
`);
await db.exec(migration);

async function reset(hash = 'correct') {
  await db.exec('truncate public.admin_2fa_codes');
  await db.query(`insert into public.admin_2fa_codes(user_id, code_hash, expires_at) values ($1, $2, now() + interval '10 minutes')`, [USER, hash]);
}
async function verify(hash) {
  await db.exec('set role service_role');
  try {
    const { rows } = await db.query('select public.verify_admin_2fa_code($1::uuid,$2::text,5) as status', [USER, hash]);
    return rows[0].status;
  } finally { await db.exec('reset role'); }
}
async function verifyAsOwner(hash) {
  const { rows } = await db.query('select public.verify_admin_2fa_code($1::uuid,$2::text,5) as status', [USER, hash]);
  return rows[0].status;
}

test('correct code is consumed and cannot be replayed', async () => {
  await reset();
  assert.equal(await verify('correct'), 'verified');
  assert.equal(await verify('correct'), 'missing');
});

test('the fifth failed attempt locks and consumes the code', async () => {
  await reset();
  for (let i = 0; i < 4; i++) assert.equal(await verify('wrong'), 'mismatch');
  assert.equal(await verify('wrong'), 'locked');
  assert.equal(await verify('correct'), 'missing');
  const { rows } = await db.query('select attempts, consumed_at is not null as consumed from public.admin_2fa_codes');
  assert.deepEqual(rows[0], { attempts: 5, consumed: true });
});

test('concurrent failures cannot consume more than the attempt threshold', async () => {
  await reset();
  const statuses = await Promise.all(Array.from({ length: 8 }, () => verifyAsOwner('wrong')));
  assert.equal(statuses.filter(s => s === 'mismatch').length, 4);
  assert.equal(statuses.filter(s => s === 'locked').length, 1);
  assert.equal(statuses.filter(s => s === 'missing').length, 3);
  const { rows } = await db.query('select attempts, consumed_at is not null as consumed from public.admin_2fa_codes');
  assert.deepEqual(rows[0], { attempts: 5, consumed: true });
});

test('browser roles cannot invoke the verifier', async () => {
  await reset();
  await db.exec('set role authenticated');
  try {
    await assert.rejects(db.query('select public.verify_admin_2fa_code($1::uuid,$2::text,5)', [USER, 'correct']), /permission denied/i);
  } finally { await db.exec('reset role'); }
});
