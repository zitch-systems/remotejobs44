# Hardening Phase 1 — Authentication Audit
**Verdict: no auth behavior changes required or made.**

## Phase-2 required fix — ALREADY IMPLEMENTED
`handle_new_user()` has had `ON CONFLICT (id) DO NOTHING` since **migration_v3.sql:58**; reaffirmed when the function was rewritten in **migration_v22.sql:51** (which also removed hardcoded admin emails from the trigger). `setup.sql:92` matches. **No new migration needed; none created.**

## Flows validated (code review; full detail in SECURITY_REPORT.md / ARCHITECTURE_AUDIT.md §5)
| Flow | Status |
|---|---|
| OAuth + PKCE (`exchangeCodeForSession`) | ✅ `app/auth/callback/route.ts`, redirect-first, background upsert via `waitUntil` |
| Magic link / email confirm / password reset | ✅ token-hash + PKCE variants both handled |
| Session refresh | ✅ transient-vs-confirmed-unauthed distinction; refresh-token rotation guarded (>60s validity check) |
| Middleware auth | ✅ `getUser()` scoped to `/admin/*` only (auth-server connection-pool fix); member routes gate on cookie presence, validated client/API-side |
| Spurious SIGNED_OUT | ✅ 2.5s grace + cookie re-check before logout |
| Chunked cookies | ✅ shared regex helper, unit-tested |
| Open-redirect on `next` param | ✅ sanitized (`lib/auth/redirect.ts`) |
| Profile creation race | ✅ ON CONFLICT (above) |

## Notes
- `getSession` is not used for authorization decisions server-side (grep-verified; `getUser`/profile row is the source of truth).
- Plan downgrade race guarded client-side via `resolvePlan` persisted-plan preference.
