// lib/api-schemas.ts
// ─────────────────────────────────────────────────────────────────────────
// Central zod schemas for API request boundaries.
//
// Every route that reads untrusted input (a JSON body, a query param, a
// webhook payload) validates it against a schema defined here rather than
// hand-rolling `typeof` / regex checks inline. Keeping the schemas in one
// place means:
//   • the shape of every payment boundary is auditable from a single file;
//   • plan lists / id formats can't silently drift between routes;
//   • parse + type-narrowing happen together, so route bodies work with
//     already-validated, correctly-typed data.
//
// Closes SECURITY_REPORT item: "no zod at API boundaries (lib/api-schemas.ts
// doesn't exist)". Behaviour is intentionally identical to the previous
// inline checks — same accepted inputs, same rejections — the validation is
// just centralised and type-safe now.
// ─────────────────────────────────────────────────────────────────────────
import { z } from 'zod';
import { PLAN_AMOUNTS_KOBO, type PaymentPlan } from '@/lib/paystack/plans';

// Derive the accepted plan list from the canonical price table so the two can
// never drift. `Object.keys` widens to `string[]`, but `z.enum` needs a
// non-empty literal tuple — asserting the `PaymentPlan` union here makes the
// parsed output type-check against callers (canPurchase, chargeMatchesPlan)
// while the runtime values still come solely from plans.ts, so adding a plan
// there automatically extends this schema.
const PLAN_KEYS = Object.keys(PLAN_AMOUNTS_KOBO) as [PaymentPlan, ...PaymentPlan[]];

/**
 * POST /api/paystack/initialize — request body.
 * Only field a client controls is the plan they want to buy; it must be one
 * of the tiers in the price table (daily | pro | pro_annual).
 */
export const initializePaymentSchema = z.object({
  plan: z.enum(PLAN_KEYS),
});
export type InitializePaymentInput = z.infer<typeof initializePaymentSchema>;

/**
 * POST /api/applications — request body.
 * `jobId` must be a UUID (applications.job_id is a uuid column — a bad shape
 * would otherwise cascade into a Postgres 22P02). `autoApplied` is a soft
 * flag: it is coerced rather than rejected, so a client sending a non-boolean
 * (`"hello"`) degrades to `false` instead of failing the whole request —
 * preserving the route's original `body.autoApplied === true` semantics.
 */
export const applicationCreateSchema = z.object({
  jobId: z.string().uuid(),
  autoApplied: z.boolean().catch(false),
});
export type ApplicationCreateInput = z.infer<typeof applicationCreateSchema>;

/**
 * Paystack transaction reference (the `?reference=` / `?trxref=` on the
 * verify callback). Paystack's own references are alphanumeric + `_`/`-`
 * (e.g. `T_675846_3yk2j`). Whitelisting the charset stops path-walking into
 * other Paystack endpoints when the value is interpolated into the verify URL
 * — the Bearer key is auto-attached, so a crafted reference is a real risk.
 */
export const paystackReferenceSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,80}$/);

/**
 * Paystack webhook envelope. Applied *after* the HMAC-SHA512 signature check
 * has already proven the body came from Paystack — this only asserts the
 * top-level shape so the switch below can trust `event.event` is a non-empty
 * string. Deliberately permissive on `data` (each event branch reads its own
 * fields defensively with `?? {}`), so a new Paystack event type is never
 * rejected here.
 */
export const paystackWebhookEnvelopeSchema = z
  .object({
    event: z.string().min(1),
    data: z.record(z.unknown()).optional(),
  })
  .passthrough();
export type PaystackWebhookEnvelope = z.infer<typeof paystackWebhookEnvelopeSchema>;
