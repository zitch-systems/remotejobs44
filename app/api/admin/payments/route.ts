// app/api/admin/payments/route.ts — server-side payment history.
//
// Lists successful Paystack charges for the admin Payments page. Runs
// server-side because the browser has no Paystack credentials and must never
// receive PAYSTACK_SECRET_KEY. Behind requireAdmin(), which honours both the
// profiles.role='admin' admins and the hardcoded-email admins (the same gate
// /api/admin/subscriptions and /api/admin/users use). Only display columns
// (PaymentRecord) cross the wire.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { listPaystackTransactions } from '@/lib/paystack/transactions';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const pageParam = Number(new URL(req.url).searchParams.get('page') ?? '1');
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;

  // listPaystackTransactions never throws — on a Paystack outage it returns an
  // empty page with `error` set, which the page surfaces inline.
  const result = await listPaystackTransactions({ page, perPage: 50 });
  return NextResponse.json(result);
}
