// lib/paystack/event-id.ts
//
// Resolve the canonical dedup key for a Paystack webhook payload. Each
// event type carries its identifier in a different field; we pick the
// most specific available so a retry of (say) charge.success with the
// same `reference` short-circuits via the paystack_webhook_events
// unique index even when an internal numeric `data.id` rotates.
//
// Extracted from app/api/paystack/webhook/route.ts so it can be tested.

export interface PaystackEvent {
  event?: string;
  data?: {
    reference?:        string | null;
    invoice_code?:     string | null;
    subscription_code?: string | null;
    subscription?: {
      subscription_code?: string | null;
    } | null;
    id?: string | number | null;
    [k: string]: unknown;
  } | null;
  [k: string]: unknown;
}

export function extractPaystackId(event: PaystackEvent): string | null {
  const d = event?.data ?? {};
  // Most → least specific. The first non-empty string wins.
  const candidates = [
    d.reference,
    d.invoice_code,
    d.subscription?.subscription_code,
    d.subscription_code,
    d.id != null ? String(d.id) : null,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
  }
  return null;
}
