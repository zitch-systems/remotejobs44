# RemoteJobs44 — Cloudflare Environment Inspection & DNS/WAF Audit (2026)

> Task: *"Inspect the Cloudflare environment and audit DNS/WAF settings."*
> This document records **what was inspected**, **what the connected tooling
> can and cannot see**, **the findings**, and a **runnable methodology** for
> performing the real DNS/WAF audit once zone-scoped access is available.
> Written to be honest: the headline result is that the DNS/WAF control plane
> is **not reachable** from the tooling connected to this session, and the
> production domain does **not appear to be served through Cloudflare** at all.

---

## 0. Audit verdict (TL;DR)

| Question | Finding |
|---|---|
| Can DNS records be audited from the connected tooling? | ❌ **No** — the connected Cloudflare MCP is the **Developer Platform** scope (Workers/KV/R2/D1/Hyperdrive + docs). It exposes **no** zone, DNS, WAF, ruleset, or SSL/TLS-settings API. |
| Can WAF settings be audited from the connected tooling? | ❌ **No** — same reason. There is no `rulesets`, `firewall`, `settings`, or `zones` tool in the connected server. |
| Is `remotejobs44.com` served through Cloudflare's edge today? | ⚠️ **Evidence says no.** The apex resolves to **Vercel** anycast IPs, the repo is Vercel-hosted, and there is **zero** Cloudflare infra config anywhere in the codebase. Any Cloudflare WAF would therefore be **out of the request path** for this site. |
| What *is* in the connected Cloudflare account? | 2 Workers (`projecttrivion`, `c44-bm-rates`), **0** KV namespaces, **0** D1 DBs, **0** Hyperdrive configs, **R2 not enabled**. None of these map to this repo. |
| Net risk | The brief assumes a Cloudflare DNS/WAF posture that this project does not appear to have. Edge security for the live site is handled (if at all) by **Vercel**, not Cloudflare. |

**Bottom line.** A live DNS/WAF audit could not be executed because (a) the
Cloudflare API token behind this session is scoped to the developer/compute
plane, not zone management, and (b) the domain itself is fronted by Vercel, so
there is likely no Cloudflare zone protecting it in the first place. §4 and §5
give the exact access and commands to close both gaps.

---

## 1. What was inspected (method)

Read-only inspection only — no resources were created, modified, or deleted.

1. **Enumerated the connected Cloudflare MCP server's complete tool set** to
   establish what the token can reach.
2. **Listed every resource type the token *can* read** (Workers, KV, R2, D1,
   Hyperdrive).
3. **Resolved the production hostnames** from the environment's resolver to see
   where traffic actually terminates.
4. **Swept the repository** for any Cloudflare *infrastructure* usage
   (`wrangler`, `_headers`/`_redirects`, `pages.dev`/`workers.dev`, CF API
   tokens/env, DNS/WAF config).
5. Cross-referenced the existing `docs/SECURITY_SEO_AUDIT_2026.md`.

---

## 2. Finding 1 — the connected tooling cannot audit DNS or WAF

The Cloudflare MCP server attached to this session is **"Cloudflare Developer
Platform."** Its **entire** tool inventory is:

| Domain | Tools present |
|---|---|
| Workers | `workers_list`, `workers_get_worker`, `workers_get_worker_code` |
| KV | `kv_namespaces_list`, `kv_namespace_get/create/update/delete` |
| R2 | `r2_buckets_list`, `r2_bucket_get/create/delete` |
| D1 | `d1_databases_list`, `d1_database_get/create/query/delete` |
| Hyperdrive | `hyperdrive_configs_list`, `hyperdrive_config_get/edit/delete` |
| Docs | `search_cloudflare_documentation` |
| Pages | `migrate_pages_to_workers_guide` |

**Absent** (and required for this task): `zones` (list/read), `dns_records`,
`rulesets` / `firewall` (WAF), zone `settings` (SSL/TLS, HSTS, min-TLS,
Always-Use-HTTPS), `dnssec`, `page_rules`, `bot_management`, `rate_limits`.

> **Consequence.** DNS records and WAF rules live behind the **zone
> management** surface of the Cloudflare API
> (`/client/v4/zones/{zone_id}/...`). None of that surface is exposed here, so
> a live read of DNS/WAF state is **not possible with the current
> connection.** This is a *scope/permissions* gap, not a "nothing to audit"
> result — see §4 to grant the right access.

---

## 3. Finding 2 — the Cloudflare account contents (what *is* visible)

Using the read-only list tools that the token *does* have:

| Resource | Result |
|---|---|
| **Workers** | 2 — `projecttrivion` (tag `17149bd3…`, created 2026-06-28, modified 2026-06-30) and `c44-bm-rates` (tag `3fed6993…`, created/modified 2026-05-21) |
| **KV namespaces** | 0 |
| **D1 databases** | 0 |
| **Hyperdrive configs** | 0 |
| **R2 buckets** | Not enabled (`403 code 10042 — "Please enable R2 through the Cloudflare Dashboard"`) |

**Observations & flags:**

- **Neither Worker maps to this repository.** RemoteJobs44 has no
  `wrangler.toml`, no Workers/Pages source, and no reference to either Worker
  name anywhere in the tree. The names suggest **unrelated projects sharing the
  same Cloudflare account** (`c44-bm-rates` ≈ a rates/FX worker;
  `projecttrivion` unknown).
  → **Action:** confirm ownership. If this account is meant to be dedicated to
  RemoteJobs44, orphaned/foreign Workers are an attack surface and a
  blast-radius concern — remove or move them. If it's a shared account, note
  that the API token here has read/write reach over *those* projects too
  (least-privilege concern).
- **No KV/D1/Hyperdrive/R2** are provisioned for anything RemoteJobs44 uses —
  consistent with the app's real data plane being **Supabase** (see
  `.mcp.json`, `next.config.js` image host `gnyilmahiyddplsrrhoq.supabase.co`).

---

## 4. Finding 3 — `remotejobs44.com` is Vercel-fronted, not Cloudflare-fronted

Independent evidence, all pointing the same way:

1. **DNS resolution (from this environment's resolver):**
   ```
   remotejobs44.com → 216.150.1.193, 216.150.16.193
   ```
   These are within **Vercel's anycast ranges** (`216.150.1.1` / `216.150.16.1`),
   **not** Cloudflare edge ranges (`104.16/13`, `172.64/13`, `188.114/16`, …).
   A Cloudflare-**proxied** (orange-cloud) record would return a Cloudflare edge
   IP. It does not → traffic is **not** transiting Cloudflare's edge, so a
   Cloudflare WAF (managed rules, custom rules, rate-limiting, Bot Fight Mode)
   would be **inert for this hostname**.
2. **Hosting config in-repo is Vercel:** `vercel.json` (region `dub1`, cron
   jobs, per-route function limits), `next.config.js` security headers +
   `www → apex` redirect handled at the **Next.js/Vercel** layer.
3. **No Cloudflare infrastructure in the codebase.** A repo-wide sweep for
   `wrangler`, `_headers`, `_redirects`, `pages.dev`, `workers.dev`,
   `CLOUDFLARE_API*`, `CF_ZONE`, `cf-connecting-ip`, `cf-ray` returned **zero**
   infra hits. Every `cloudflare` string in the code is **Cloudflare-as-a-listed-employer**
   (job-board content in `CompanyMarquee.tsx`, `lib/mock-data.ts`) or a logo
   asset — not infrastructure.
4. **The existing security audit agrees indirectly.**
   `docs/SECURITY_SEO_AUDIT_2026.md` §2.3/§4 recommends enabling **"Vercel WAF /
   bot management on `/api/*`"** — i.e. the team's own edge-security plan is
   Vercel-based, with no mention of Cloudflare.

### 4.1 The one open sub-question: is Cloudflare the *DNS provider* (grey-cloud)?

A Vercel origin IP is consistent with **two** scenarios:

- **(A) Cloudflare is the authoritative DNS host, records set to "DNS only"
  (grey cloud).** Cloudflare would then be auditable *as a DNS provider* but
  provides **no** proxy/WAF for the site.
- **(B) Cloudflare is not involved with this domain at all** (nameservers are
  Vercel's or the registrar's). The Workers account in §3 would then be
  unrelated to this domain.

The environment lacks `dig`/`nslookup` and the outbound proxy blocks DoH, so the
**nameservers could not be read from here.** Disambiguate with one command from
any machine with DNS access:

```bash
dig +short NS remotejobs44.com
# *.ns.cloudflare.com  → scenario (A): Cloudflare hosts DNS (grey-cloud)
# *.vercel-dns.com / registrar NS → scenario (B): Cloudflare not in the path
```

Either way, **the live-traffic conclusion is unchanged**: the site is **not
protected by a Cloudflare WAF today** because requests reach Vercel directly.

> **Note on live-header verification.** A direct `curl` to
> `https://remotejobs44.com` from this session is blocked by the agent proxy's
> host allowlist (`403 CONNECT tunnel failed` — a sandbox policy, not a site
> issue), so response-header confirmation (`server: cloudflare` + `cf-ray`
> would prove proxying) must be run from an unrestricted network — see §5.4.

---

## 5. How to actually audit Cloudflare DNS/WAF (runnable playbook)

Everything below is what *should* be run once (a) it's confirmed a Cloudflare
zone exists for the domain (§4.1) and (b) a **read-only, zone-scoped** API token
is available. None of it can be executed from this session's current token.

### 5.1 Grant a least-privilege audit token

Create a **scoped API token** (My Profile → API Tokens) with **read-only**
permissions — never use the Global API Key:

| Scope | Permission | Access |
|---|---|---|
| Account | Workers Scripts | Read |
| Account | Account Settings | Read |
| Zone (all, or the specific zone) | Zone | Read |
| Zone | DNS | Read |
| Zone | Zone Settings | Read |
| Zone | Zone WAF | Read |
| Zone | Firewall Services | Read |
| Zone | Page Rules | Read |

Export it: `export CF_API_TOKEN=…` and verify with
`curl https://api.cloudflare.com/client/v4/user/tokens/verify -H "Authorization: Bearer $CF_API_TOKEN"`.

### 5.2 Discover zones, then DNS

```bash
API=https://api.cloudflare.com/client/v4
AUTH=(-H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json")

# 1) Find the zone id (and read its nameservers + status + plan)
curl -s "$API/zones?name=remotejobs44.com" "${AUTH[@]}" \
  | jq '.result[] | {id, name, status, paused, name_servers, plan: .plan.name}'
ZONE_ID=<paste id>

# 2) DNS records — full dump for review
curl -s "$API/zones/$ZONE_ID/dns_records?per_page=100" "${AUTH[@]}" \
  | jq -r '.result[] | [.type, .name, .content, ("proxied="+(.proxied|tostring)), ("ttl="+(.ttl|tostring))] | @tsv'

# 3) DNSSEC status (want: "active")
curl -s "$API/zones/$ZONE_ID/dnssec" "${AUTH[@]}" | jq '.result.status'

# 4) Dangling / shadowed record check (subdomain-takeover surface)
curl -s "$API/zones/$ZONE_ID/dns_records?include_shadow_metadata=true&per_page=1000" "${AUTH[@]}" \
  | jq '.result[] | select(.settings.shadowed // .shadow_metadata) | {name, type, content}'
```

**DNS audit checklist**

- [ ] **Proxy status** — every record that *should* get WAF/CDN is `proxied:true`
      (orange cloud). A grey-cloud apex means the WAF is bypassed (this is what
      we suspect here).
- [ ] **No dangling records** — CNAMEs/A records pointing at decommissioned
      hosts/SaaS (subdomain-takeover risk).
- [ ] **Email hardening TXT present** — SPF (`v=spf1 … -all`), DKIM selector(s),
      and DMARC at `_dmarc` (`v=DMARC1; p=quarantine|reject; rua=…`). If the
      domain doesn't send mail, publish a null SPF/DMARC + `MX .`.
- [ ] **CAA records** restrict which CAs may issue (least surprise on cert
      issuance).
- [ ] **DNSSEC = active** at both Cloudflare and the registrar (DS record set).
- [ ] **No stale wildcard** `*` records widening exposure.

### 5.3 Audit the WAF (Rulesets engine)

```bash
# Entrypoint rulesets by phase (WAF lives in these phases)
curl -s "$API/zones/$ZONE_ID/rulesets" "${AUTH[@]}" \
  | jq -r '.result[] | [.phase, .kind, .id, (.name//"")] | @tsv'

# Managed rules actually deployed (Cloudflare Managed + OWASP Core) + overrides
curl -s "$API/zones/$ZONE_ID/rulesets/phases/http_request_firewall_managed/entrypoint" "${AUTH[@]}" \
  | jq '.result.rules[] | {action, expression, enabled, managed: .action_parameters.id, overrides: .action_parameters.overrides}'

# Custom WAF rules
curl -s "$API/zones/$ZONE_ID/rulesets/phases/http_request_firewall_custom/entrypoint" "${AUTH[@]}" \
  | jq '.result.rules[] | {description, action, expression, enabled}'

# Rate-limiting rules
curl -s "$API/zones/$ZONE_ID/rulesets/phases/http_ratelimit/entrypoint" "${AUTH[@]}" \
  | jq '.result.rules[] | {description, action, expression, ratelimit: .ratelimit}'
```

**WAF audit checklist**

- [ ] **Cloudflare Managed Ruleset** deployed and *enabled* (managed id
      `efb7b8c949ac4650a09736fc376e9aee`), not left in log-only.
- [ ] **OWASP Core Ruleset** deployed (id `4814384a9e5d4991b9815dcfc25d2f1f`)
      with a sane **paranoia level / anomaly score threshold** (tune to avoid
      false positives on `/api/*`).
- [ ] **Custom rules** cover the app's real risks: lock down `/api/admin/*`,
      the Paystack webhook path, and abusive faceted `/jobs?…` crawling
      (mirrors the app's own `robots.ts` intent).
- [ ] **Rate-limiting** on the public search API and auth endpoints (the app's
      in-memory `lib/rate-limit.ts` is per-instance only — an edge limiter is
      the cross-instance backstop the security audit calls for).
- [ ] **Bot Fight Mode / SBFM** enabled if on a plan that offers it.
- [ ] No rule left in **`log`/`skip`** that was meant to `block`/`challenge`.

### 5.4 Zone security settings + live-header sanity check

```bash
for s in ssl always_use_https min_tls_version tls_1_3 automatic_https_rewrites \
         opportunistic_encryption security_level security_header; do
  printf '%-24s ' "$s"
  curl -s "$API/zones/$ZONE_ID/settings/$s" "${AUTH[@]}" | jq -c '.result.value'
done

# Live edge fingerprint (run from an UNRESTRICTED network, not this sandbox):
curl -sSI https://remotejobs44.com | grep -iE 'server|cf-ray|strict-transport|content-security'
#   server: cloudflare + cf-ray:  → proxied through Cloudflare (WAF is in-path)
#   server: Vercel (no cf-ray)     → NOT proxied (our current hypothesis)
```

**Settings checklist:** SSL mode **Full (strict)**; **Always Use HTTPS = on**;
**min TLS 1.2+**; **TLS 1.3 = on**; **HSTS** enabled
(`max-age ≥ 63072000; includeSubDomains; preload` — matches the app's own
`Strict-Transport-Security` header in `next.config.js`); Automatic HTTPS
Rewrites **on**.

### 5.5 Alternative: snapshot state as code for review/diffing

```bash
# Terraform importer — produces reviewable HCL of the live DNS + WAF config
cf-terraforming generate --resource-type "cloudflare_record"  --zone "$ZONE_ID" --token "$CF_API_TOKEN"
cf-terraforming generate --resource-type "cloudflare_ruleset" --zone "$ZONE_ID" --token "$CF_API_TOKEN"
```
Committing the generated HCL gives change-tracked, diff-able DNS/WAF state and a
drift-detection baseline for future audits.

---

## 6. Recommendations (prioritised)

1. **Decide the edge-security owner and make it real.** Either:
   - **(a) Front the domain with Cloudflare** — put the zone on Cloudflare DNS,
     set the apex/`www` records to **proxied (orange-cloud)** to Vercel, deploy
     the Managed + OWASP rulesets and rate-limiting per §5.3, and then this
     audit becomes continuously runnable; **or**
   - **(b) Stay Vercel-only** — then enable **Vercel WAF / bot management** and
     rate-limiting (as `docs/SECURITY_SEO_AUDIT_2026.md` §4 Phase 2 already
     recommends) and treat Cloudflare as out of scope for this project. Pick one
     deliberately; today it's ambiguous.
2. **Re-scope (or add) a Cloudflare token for auditing.** The connected token is
   developer-plane only. Issue the **read-only zone token** in §5.1 so DNS/WAF
   can actually be reviewed (and re-run this playbook).
3. **Reconcile the shared Cloudflare account.** Confirm ownership of
   `projecttrivion` and `c44-bm-rates`; remove/relocate anything not
   RemoteJobs44, and confirm least-privilege on whatever token is stored for
   this project.
4. **Publish email-auth DNS** (SPF/DKIM/DMARC) and **CAA**, and enable
   **DNSSEC** — cheap, high-value hardening regardless of which edge (a/b) wins.
5. **Once a zone exists, snapshot DNS/WAF as Terraform** (§5.5) and add a
   quarterly drift review to the existing security cadence.

---

## 7. Evidence log

| Check | Command / tool | Result |
|---|---|---|
| Connected CF MCP tool set | tool enumeration | Developer Platform only — no zone/DNS/WAF tools |
| Workers | `workers_list` | `projecttrivion`, `c44-bm-rates` (2) |
| KV / D1 / Hyperdrive | `*_list` | 0 / 0 / 0 |
| R2 | `r2_buckets_list` | `403` — R2 not enabled |
| Apex DNS | system resolver (`getent hosts`) | `216.150.1.193`, `216.150.16.193` (Vercel) |
| Nameservers | — | **could not read** here (`dig`/`nslookup` absent, DoH proxy-blocked) → run §4.1 |
| Live headers | `curl -I` | **blocked** by agent proxy allowlist (`403 CONNECT`) → run §5.4 off-sandbox |
| Repo CF infra | repo-wide grep | none — only employer/logo references |
| Hosting | `vercel.json`, `next.config.js` | Vercel (region `dub1`) |

*Prepared as a read-only inspection. No Cloudflare resources were created,
modified, or deleted.*
