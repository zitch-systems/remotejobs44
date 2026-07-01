# RemoteJobs44 — Security Report

**Date:** 2026-07-01
**Scope:** Static, read-only source review. No exploits were attempted; no live systems (production Supabase project, production deployment) were tested or reached from this environment.

## Executive Summary

RemoteJobs44 demonstrates a **mature, defense-in-depth security posture**. No critical vulnerabilities were found. The codebase shows specific, deliberate hardening against real-world attack classes: timing attacks on signature comparisons, redirect-to-attacker-domain, prompt injection into LLM calls, RLS policy recursion, and Paystack webhook metadata tampering. This reads as a codebase that has been through incident response, not one that's merely following a checklist.

## Findings

**Secrets management — Good**
- `.env.example` contains only placeholder values; no real keys are committed anywhere in the repository.
- Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, admin 2FA secrets, Paystack secret key) are gated behind `process.env` with no `NEXT_PUBLIC_` prefix, so they cannot leak into the client bundle.

**Authentication & authorization — Excellent**
- Tiered guard functions (`requireAdmin`, `requireAgent`, `requireCronSecret`) with appropriate scope per caller type.
- Admin 2FA uses hashed (not plaintext) one-time codes bound to the user ID, a 5-attempt throttle, and an HMAC-signed session cookie — and is deliberately shipped **disabled by default**, enabled only after email delivery is manually confirmed, so a broken mail integration can't lock admins out.
- A `suspended` flag on `profiles` acts as an independent kill-switch even for hardcoded admin emails.
- Open-redirect protection: the post-auth `next` redirect parameter is sanitized (rejects `//`, `://`, backslashes, and redirect loops) before use.

**Cryptography — Excellent**
- Constant-time comparison (`timingSafeEqual`) is used consistently for Paystack webhook signature verification and admin 2FA code checks, with length checks performed *before* the constant-time comparison to avoid a length-based timing leak — a detail that's easy to get wrong and was gotten right here.
- 2FA codes are stored as `sha256(userId:code)`, not plaintext, so a leaked hash can't be replayed against a different account.

**Input validation & injection — Excellent**
- UUID format is regex-validated before every Supabase query that takes one, preventing malformed-input database errors.
- LLM prompt-injection defense: candidate CV text passed to the AI review endpoint is wrapped in XML tags with angle brackets escaped.
- SSRF guard on the ATS-fetch endpoint validates the target platform against an allowlist before making any outbound request.
- `dangerouslySetInnerHTML` is used **only** for JSON-LD schema injection, with `<` properly escaped to `<` — no other use of `dangerouslySetInnerHTML`, `eval`, or `innerHTML` was found anywhere in the app source.

**Security headers — Excellent**
- CSP, HSTS (2-year max-age, `preload`, `includeSubDomains`), `X-Frame-Options: DENY`, a locked-down `Permissions-Policy`, and `Referrer-Policy: strict-origin-when-cross-origin` are all configured in `next.config.js`.
- `unsafe-eval` is dev-only and correctly omitted from the production CSP.
- Cache-Control is deliberately **not** set on auth-variant routes, specifically to prevent a paywall-bypass-via-cache scenario — called out as an explicit fix in code comments.

**Payment security — Excellent**
- Paystack webhook idempotency is dual-layered: a generic audit-table dedup plus a reference-keyed transaction ledger used as the canonical guard against double-granting a subscription.
- Charge amounts are validated against the claimed plan's price — a metadata-tampering attempt (claim `plan=pro_annual` but pay the price of a cheaper plan) is rejected and alerts ops, rather than silently trusting client-supplied metadata.
- The Paystack checkout redirect URL is validated against an explicit host allowlist (`checkout.paystack.com`) before use, preventing a redirect-to-attacker-domain substitution.

**Row-Level Security — Good**
- RLS is enabled across the schema. A previously-discovered recursion bug in admin-check policies (self-referential queries against `profiles` from within its own policy) was fixed via a `SECURITY DEFINER is_admin()` helper function, documented in `supabase/fix_rls_recursion.sql`.
- **Not independently verified in this audit** (no live database access from this environment) — the full RLS policy matrix should be reviewed directly against the production database, not just inferred from migration files.

**Rate limiting — Good, with a known limitation**
- A sliding-window in-memory rate limiter covers contact forms, admin 2FA send/verify, and Paystack initialization, with sensible per-route limits (e.g. 5/hour for contact, 30/hour IP-level for Paystack init to tolerate carrier-grade NAT).
- **Known limitation, already documented in code:** the limiter is single-process/in-memory, so it does not enforce a truly global cap across Vercel's multi-region serverless instances. This is a real gap for a determined attacker, though not an active vulnerability today.

**Dependencies — Good**
- Modern, actively-maintained versions across the stack (Next.js, React, TypeScript, Supabase client, Zod). No obviously abandoned or end-of-life packages found.

## Recommendations (Prioritized)

1. **[High]** Move rate limiting to a shared store (e.g. Upstash Redis) so limits are enforced globally across Vercel's multi-region deployment, not per-instance.
2. **[Medium]** Independently verify the full RLS policy matrix against the live database (this audit could only review migration files, not the deployed policies) — specifically confirm a member cannot read another member's `applications`/`saved_jobs` rows, and that the hardcoded-admin-email fast path cannot be spoofed by a non-admin session.
3. **[Medium]** Give admin 2FA its own dedicated secret (`ADMIN_2FA_SECRET`) rather than falling back to `SUPABASE_SERVICE_ROLE_KEY` — acceptable for a single-deployment today, but a key-reuse smell worth removing.
4. **[Low]** If CSP is tightened further in the future, migrate JSON-LD `<script>` injection from `unsafe-inline` to a nonce-based approach.

**No critical vulnerabilities were identified.** The two "High" items above are hardening/operational improvements for scale, not exploitable weaknesses today.
