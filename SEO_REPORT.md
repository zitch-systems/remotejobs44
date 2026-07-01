# RemoteJobs44 — SEO Report

**Date:** 2026-07-01

## Executive Summary

RemoteJobs44's SEO architecture is **the strongest area found in this audit** — genuinely industry-leading practice for a jobs marketplace, not just "adequate." It shows deliberate, documented engineering decisions rather than defaults left in place. Two small, low-effort gaps remain.

## Findings

**Structured data:**
- Root layout emits a JSON-LD graph: `WebSite` (with `SearchAction`), `Organization` (with `sameAs` social links), `WebApplication` (with pricing offers).
- Job detail pages (`app/jobs/[id]/page.tsx`) emit server-rendered `JobPosting` schema with correct `applicantLocationRequirements` (countries only, not vague regions), `jobLocationType: TELECOMMUTE`, and a `validThrough` computed as the max of the upstream expiry, posted+45 days, or now+14 days — a genuinely thoughtful default rather than a hardcoded date.
- `baseSalary` is only emitted for USD-denominated listings, and only for users who can actually see it (paywall-aware — anonymous/free users never get `apply_url`/`apply_email` leaked into the schema either).
- Blog/resource articles emit `BlogPosting` with a named author (`"RemoteJobs44 Editorial"` linked to `/about#editorial`) rather than an anonymous organization byline — better for E-E-A-T signals than the common alternative.
- `BreadcrumbList` schema on job details (Home › Jobs › Company › Title) — enables Google SERP sitelinks.
- `FAQPage` schema with 13 Q&As plus `SpeakableSpecification` for voice-assistant integration.

**Crawl infrastructure:**
- `app/sitemap.ts` shards 58,000+ job URLs into 20k-per-shard sitemaps plus a shard-0 for static/slice routes and the top 1,000 companies by hiring activity — this is real engineering for scale, not a naive single sitemap.
- `app/robots.ts` blocks the faceted-query surface (`/jobs?*`), protects `/admin`, `/api/`, and member-only routes, and **explicitly allows AI crawlers** (GPTBot, ClaudeBot, PerplexityBot) — a deliberate choice given the "surfaces well in AI search" goal implied by the product vision.
- 8+ programmatic SEO route families exist and all carry real per-page metadata + dynamic OG images: `/jobs/category/[slug]`, `/jobs/city/[slug]`, `/jobs/skill/[slug]`, `/jobs/country/[slug]`, `/jobs/industry/[slug]`, `/jobs/region/[slug]`, `/jobs/timezone/[slug]`, `/jobs/company/[slug]`, plus `/salary-guide/[slug]`, `/compare/[slug]`, `/resources/[slug]`. All use `force-static` + `revalidate: 3600`.
- Dynamic OG images (`app/api/og/route.tsx`) are edge-rendered per-job/category/city/resource with a 1-year CDN cache after first render.
- Auth pages (`/login`, `/register`, `/forgot-password`) are correctly excluded from the sitemap.
- Several key listing pages (`/jobs`, `/jobs/[id]`, `/companies`, `/companies/[slug]`) were deliberately converted from client-rendered to server-rendered specifically so crawlers (including AI crawlers, which frequently don't execute JS) receive the structured data in the initial HTML — this is called out in code comments as an intentional fix, not an accident.

## Gaps

| Gap | Severity | Effort |
|---|---|---|
| No `CollectionPage` + `ItemList` schema on the programmatic slice-listing pages (`/jobs/category/[slug]`, `/jobs/city/[slug]`, etc.) — thousands of indexed URLs have metadata and OG images but no structured data confirming they're job-listing collections | Medium | ~1 hour — mirror the pattern already used on `/companies` |
| No aggregate salary schema (min/max `Occupation` data) on skill/category pages, despite `/salary-guide` already correctly emitting this pattern | Low | Requires a data-aggregation query, not a quick fix |

## Recommendations (Prioritized)

1. **[Medium]** Add `CollectionPage` + `ItemList` schema to all `/jobs/[slice]/[slug]` listing pages, reusing the pattern already implemented on `/companies`.
2. **[Low]** Aggregate min/max salary from active listings per category/skill slice and emit `Occupation` schema, matching the existing `/salary-guide` pattern.
3. **[Optional, not urgent]** `hreflang`/i18n tags only become relevant if expanding beyond the current market positioning — no action needed now.

No critical or high-severity SEO issues were found.
