#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(
  new URL('../supabase/payment_fulfillment.sql', import.meta.url),
  'utf8',
);

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_USER_ID = '22222222-2222-4222-8222-222222222222';
const UNKNOWN_USER_ID = '99999999-9999-4999-8999-999999999999';

const db = new PGlite();

async function scalar(sql, params = []) {
  const { rows } = await db.query(sql, params);
  return Object.values(rows[0])[0];
}

async function resetData() {
  await db.exec(`
    truncate table public.paystack_transactions, public.subscriptions,
      public.profiles, public.paystack_webhook_events restart identity;
  `);
}

async function insertProfile({
  id = USER_ID,
  role = 'user',
  plan = 'free',
  expiresAt = null,
} = {}) {
  await db.query(
    `insert into public.profiles(id, role, plan, plan_expires_at)
     values ($1, $2, $3, $4)`,
    [id, role, plan, expiresAt],
  );
}

async function asRole(role, operation) {
  await db.exec(`set role ${role}`);
  try {
    return await operation();
  } finally {
    await db.exec('reset role');
  }
}

async function fulfill({
  reference = 'ref_test',
  userId = USER_ID,
  selection = 'pro',
  amount = 299900,
  currency = 'NGN',
  customerCode = null,
  subscriptionCode = null,
  emailToken = null,
} = {}, role = 'service_role') {
  return asRole(role, async () => {
    const { rows } = await db.query(
      `select public.fulfill_paystack_charge(
        $1::text, $2::uuid, $3::text, $4::integer, $5::text,
        $6::text, $7::text, $8::text
      ) as result`,
      [
        reference, userId, selection, amount, currency,
        customerCode, subscriptionCode, emailToken,
      ],
    );
    return rows[0].result;
  });
}

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;

  create table public.profiles (
    id uuid primary key,
    role text not null default 'user',
    plan text not null default 'free',
    plan_expires_at timestamptz,
    updated_at timestamptz not null default now()
  );

  create table public.paystack_transactions (
    id bigint generated always as identity primary key,
    reference text not null unique,
    user_id uuid not null,
    plan text not null,
    selection text not null,
    amount integer not null,
    currency text not null,
    created_at timestamptz not null default now()
  );

  create table public.subscriptions (
    id bigint generated always as identity primary key,
    user_id uuid not null unique,
    plan text not null,
    billing text not null,
    status text not null,
    paystack_reference text not null unique,
    paystack_customer_code text,
    paystack_subscription_code text,
    paystack_email_token text,
    current_period_start timestamptz not null,
    current_period_end timestamptz not null,
    currency text not null,
    price numeric not null,
    updated_at timestamptz not null default now()
  );

  create table public.paystack_webhook_events (
    event_id text primary key,
    processed boolean not null default true
  );

  grant select, insert, update on public.profiles,
    public.paystack_transactions, public.subscriptions to service_role;
  grant usage, select on all sequences in schema public to service_role;
`);

await db.exec(migration);

test('payment fulfillment SQL regression suite', async (t) => {
  await t.test('migration changes new webhook events to unprocessed', async () => {
    await resetData();
    await db.exec(`insert into public.paystack_webhook_events(event_id) values ('evt_1')`);
    assert.equal(
      await scalar(`select processed from public.paystack_webhook_events where event_id = 'evt_1'`),
      false,
    );
  });

  await t.test('first valid charge credits the profile, ledger, and subscription', async () => {
    await resetData();
    await insertProfile();

    const result = await fulfill({
      reference: 'first_credit',
      customerCode: 'CUS_1',
      subscriptionCode: 'SUB_1',
      emailToken: 'EMAIL_1',
    });

    assert.equal(result.credited, true);
    assert.equal(result.plan, 'pro');
    assert.equal(await scalar(`select plan from public.profiles where id = '${USER_ID}'`), 'pro');
    assert.equal(await scalar(`select count(*)::int from public.paystack_transactions`), 1);
    assert.equal(await scalar(`select count(*)::int from public.subscriptions`), 1);
    assert.equal(await scalar(`select price = 2999 as price_matches from public.subscriptions`), true);
    assert.equal(await scalar(`select billing from public.subscriptions`), 'monthly');
  });

  await t.test('a duplicate reference is idempotent and does not extend access twice', async () => {
    await resetData();
    await insertProfile();

    const first = await fulfill({ reference: 'same_reference' });
    const duplicate = await fulfill({ reference: 'same_reference' });

    assert.equal(first.credited, true);
    assert.equal(duplicate.credited, false);
    assert.equal(new Date(duplicate.expires_at).getTime(), new Date(first.expires_at).getTime());
    assert.equal(await scalar(`select count(*)::int from public.paystack_transactions`), 1);
    assert.equal(await scalar(`select count(*)::int from public.subscriptions`), 1);
  });

  await t.test('the same reference cannot be claimed by a different user', async () => {
    await resetData();
    await insertProfile();
    await insertProfile({ id: SECOND_USER_ID });
    await fulfill({ reference: 'owned_reference' });

    await assert.rejects(
      fulfill({ reference: 'owned_reference', userId: SECOND_USER_ID }),
      /Payment account mismatch/,
    );
    assert.equal(await scalar(`select count(*)::int from public.paystack_transactions`), 1);
    assert.equal(await scalar(`select count(*)::int from public.subscriptions`), 1);
    assert.deepEqual(
      (await db.query(`select plan, plan_expires_at from public.profiles where id = $1`, [SECOND_USER_ID])).rows[0],
      { plan: 'free', plan_expires_at: null },
    );
  });

  await t.test('a legacy subscription is ledger-backfilled without extending entitlement', async () => {
    await resetData();
    const existingExpiry = new Date(Date.now() + 20 * 86_400_000).toISOString();
    const periodStart = new Date(Date.now() - 10 * 86_400_000).toISOString();
    await insertProfile({ plan: 'pro', expiresAt: existingExpiry });
    await db.query(
      `insert into public.subscriptions(
        user_id, plan, billing, status, paystack_reference,
        current_period_start, current_period_end, currency, price
      ) values ($1, 'pro', 'monthly', 'active', $2, $3, $4, 'NGN', 2999)`,
      [USER_ID, 'legacy_reference', periodStart, existingExpiry],
    );

    const result = await fulfill({ reference: 'legacy_reference' });

    assert.equal(result.credited, false);
    assert.equal(new Date(result.expires_at).getTime(), new Date(existingExpiry).getTime());
    assert.equal(await scalar(`select count(*)::int from public.paystack_transactions`), 1);
    assert.equal(await scalar(`select count(*)::int from public.subscriptions`), 1);
    assert.equal(
      (await scalar(`select plan_expires_at from public.profiles where id = '${USER_ID}'`)).getTime(),
      new Date(existingExpiry).getTime(),
    );
    assert.equal(
      (await scalar(`select current_period_end from public.subscriptions`)).getTime(),
      new Date(existingExpiry).getTime(),
    );
  });

  await t.test('an old duplicate cannot replay after a later renewal', async () => {
    await resetData();
    await insertProfile();

    const first = await fulfill({ reference: 'older_payment' });
    const renewal = await fulfill({ reference: 'newer_payment' });
    const replay = await fulfill({ reference: 'older_payment' });
    const storedExpiry = await scalar(`select plan_expires_at from public.profiles where id = '${USER_ID}'`);

    assert.equal(first.credited, true);
    assert.equal(renewal.credited, true);
    assert.equal(replay.credited, false);
    assert.equal(new Date(replay.expires_at).getTime(), new Date(renewal.expires_at).getTime());
    assert.equal(storedExpiry.getTime(), new Date(renewal.expires_at).getTime());
    assert.equal(await scalar(`select count(*)::int from public.paystack_transactions`), 2);
    assert.equal(await scalar(`select count(*)::int from public.subscriptions`), 1);
    assert.equal(await scalar(`select paystack_reference from public.subscriptions`), 'newer_payment');
  });

  await t.test('distinct successful payments preserve and extend remaining paid time', async () => {
    await resetData();
    await insertProfile();

    const first = await fulfill({ reference: 'monthly_one' });
    const second = await fulfill({ reference: 'monthly_two' });
    const extensionDays = (
      new Date(second.expires_at).getTime() - new Date(first.expires_at).getTime()
    ) / 86_400_000;

    assert.equal(first.credited, true);
    assert.equal(second.credited, true);
    assert.ok(extensionDays >= 28 && extensionDays <= 31, `unexpected extension: ${extensionDays} days`);
    assert.equal(await scalar(`select count(*)::int from public.paystack_transactions`), 2);
    assert.equal(await scalar(`select count(*)::int from public.subscriptions`), 1);
  });

  await t.test('subscription failure rolls back ledger and profile, then the same charge can retry', async () => {
    await resetData();
    await insertProfile();
    await db.exec(`
      alter table public.subscriptions
        add constraint force_subscription_failure check (false);
    `);

    await assert.rejects(
      fulfill({ reference: 'retry_after_rollback' }),
      (error) => error?.code === '23514',
    );
    assert.equal(await scalar(`select count(*)::int from public.paystack_transactions`), 0);
    assert.equal(await scalar(`select count(*)::int from public.subscriptions`), 0);
    assert.deepEqual(
      (await db.query(`select plan, plan_expires_at from public.profiles where id = $1`, [USER_ID])).rows[0],
      { plan: 'free', plan_expires_at: null },
    );

    await db.exec(`alter table public.subscriptions drop constraint force_subscription_failure`);
    const retried = await fulfill({ reference: 'retry_after_rollback' });
    assert.equal(retried.credited, true);
    assert.equal(await scalar(`select count(*)::int from public.paystack_transactions`), 1);
    assert.equal(await scalar(`select plan from public.profiles where id = '${USER_ID}'`), 'pro');
  });

  await t.test('an unknown user fails before creating any payment records', async () => {
    await resetData();

    await assert.rejects(
      fulfill({ reference: 'orphan_charge', userId: UNKNOWN_USER_ID }),
      /Payment account not found/,
    );
    assert.equal(await scalar(`select count(*)::int from public.paystack_transactions`), 0);
    assert.equal(await scalar(`select count(*)::int from public.subscriptions`), 0);
  });

  await t.test('bad amount and currency are rejected without writes', async () => {
    for (const badCharge of [
      { reference: 'underpaid', amount: 299799 },
      { reference: 'overpaid', amount: 300001 },
      { reference: 'wrong_currency', currency: 'USD' },
    ]) {
      await resetData();
      await insertProfile();
      await assert.rejects(
        fulfill(badCharge),
        /Invalid payment plan, amount or currency/,
      );
      assert.equal(await scalar(`select count(*)::int from public.paystack_transactions`), 0);
      assert.equal(await scalar(`select count(*)::int from public.subscriptions`), 0);
      assert.equal(await scalar(`select plan from public.profiles where id = '${USER_ID}'`), 'free');
    }
  });

  await t.test('all configured plan prices and the 100-kobo tolerance boundary are accepted', async () => {
    const validCharges = [
      { reference: 'daily_price', selection: 'daily', amount: 50000, plan: 'daily', billing: 'daily' },
      { reference: 'pro_price', selection: 'pro', amount: 299900, plan: 'pro', billing: 'monthly' },
      { reference: 'annual_price', selection: 'pro_annual', amount: 2999900, plan: 'pro', billing: 'annually' },
      { reference: 'lower_tolerance', selection: 'pro', amount: 299800, plan: 'pro', billing: 'monthly' },
      { reference: 'upper_tolerance', selection: 'pro', amount: 300000, plan: 'pro', billing: 'monthly' },
    ];

    for (const charge of validCharges) {
      await resetData();
      await insertProfile();
      const result = await fulfill(charge);
      assert.equal(result.credited, true);
      assert.equal(result.plan, charge.plan);
      assert.equal(await scalar(`select billing from public.subscriptions`), charge.billing);
      assert.equal(await scalar(`select amount from public.paystack_transactions`), charge.amount);
    }
  });

  await t.test('a delayed lower-tier charge cannot downgrade active Pro access', async () => {
    await resetData();
    const proExpiry = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await insertProfile({ plan: 'pro', expiresAt: proExpiry });

    await assert.rejects(
      fulfill({ reference: 'late_daily', selection: 'daily', amount: 50000 }),
      /Lower-tier charge requires review/,
    );
    const profile = (
      await db.query(`select plan, plan_expires_at from public.profiles where id = $1`, [USER_ID])
    ).rows[0];
    assert.equal(profile.plan, 'pro');
    assert.equal(profile.plan_expires_at.getTime(), new Date(proExpiry).getTime());
    assert.equal(await scalar(`select count(*)::int from public.paystack_transactions`), 0);
    assert.equal(await scalar(`select count(*)::int from public.subscriptions`), 0);
  });

  await t.test('admin entitlement is preserved while the payment is recorded', async () => {
    await resetData();
    await insertProfile({ role: 'admin', plan: 'admin' });

    const result = await fulfill({
      reference: 'admin_daily',
      selection: 'daily',
      amount: 50000,
    });

    assert.equal(result.credited, true);
    assert.equal(await scalar(`select plan from public.profiles where id = '${USER_ID}'`), 'admin');
    assert.equal(await scalar(`select plan from public.subscriptions`), 'daily');
    assert.equal(await scalar(`select count(*)::int from public.paystack_transactions`), 1);
  });

  await t.test('anon and authenticated roles cannot invoke the fulfillment RPC', async () => {
    for (const role of ['anon', 'authenticated']) {
      await resetData();
      await insertProfile();
      await assert.rejects(
        fulfill({ reference: `forbidden_${role}` }, role),
        (error) => error?.code === '42501' && /permission denied for function/.test(error.message),
      );
      assert.equal(await scalar(`select count(*)::int from public.paystack_transactions`), 0);
      assert.equal(await scalar(`select plan from public.profiles where id = '${USER_ID}'`), 'free');
    }
  });
});

test.after(async () => {
  await db.close();
});
