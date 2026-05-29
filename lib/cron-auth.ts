// lib/cron-auth.ts — shared Bearer-secret guard for /api/cron/* routes.
//
// All cron routes share two failure modes:
//   1. CRON_SECRET unset or too short → fail closed with 503 (misconfig).
//      Without this the route would accept ANY auth header when the env
//      var is empty (the literal compare `"" === "Bearer "` is true).
//   2. Header missing or doesn't match → 401.
//
// Compare with `timingSafeEqual` (constant-time) rather than ===. The
// strings are user-controlled (attacker sets the Authorization header)
// and a short-circuit string compare can leak length+prefix one byte at
// a time. The webhook route already does this for the Paystack signature;
// the cron routes were inconsistent.
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { logError } from '@/lib/log';

const CRON_MIN_LEN = 16;

export interface CronAuthOk { ok: true }
export interface CronAuthFail { ok: false; res: NextResponse }
export type CronAuthResult = CronAuthOk | CronAuthFail;

export function requireCronSecret(req: NextRequest, logEvent: string): CronAuthResult {
  const secret = process.env.CRON_SECRET ?? '';
  if (!secret || secret.length < CRON_MIN_LEN) {
    logError({ event: `${logEvent}.misconfigured`, detail: 'CRON_SECRET missing or too short' });
    return {
      ok: false,
      res: NextResponse.json({ error: 'Cron secret not configured' }, { status: 503 }),
    };
  }
  const auth = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  // timingSafeEqual requires equal-length Buffers — bail before the call
  // when lengths differ, otherwise it throws and we'd 500 instead of 401.
  if (auth.length !== expected.length) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  const a = Buffer.from(auth);
  const b = Buffer.from(expected);
  if (!timingSafeEqual(a, b)) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { ok: true };
}
