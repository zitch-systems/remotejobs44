-- ============================================================
-- RemoteJobs44 — Migration v15
-- Adds: full-text search on jobs(title, company, description) via a
-- generated `search_vector` tsvector column with a GIN index. Closes
-- the audit's "/api/jobs description ILIKE will collapse at 100k+
-- rows" finding.
-- Idempotent — safe to re-run.
-- ============================================================
--
-- WHY
-- ---
-- The /jobs search query was:
--   .or('title.ilike.%q%,company.ilike.%q%,description.ilike.%q%')
--
-- Three ILIKE OR'd together across `description` (up to 5000 chars)
-- forces a full sequential scan because none of the columns has an
-- index that ILIKE on substring can use. At 50k rows the scan was
-- already 800-1500 ms; the audit projected sub-second timeouts past
-- 100k. /jobs hits this query on every keystroke in the search box.
--
-- Postgres has had FTS since 2008. We add a generated tsvector column
-- weighted A/B/C (title matches > company matches > description
-- matches) and a GIN index. The /api/jobs query switches from the
-- OR-of-ILIKEs to .textSearch('search_vector', q, { type: 'websearch' })
-- which translates to `search_vector @@ websearch_to_tsquery('english', q)`
-- — index-friendly, milliseconds at any scale.
--
-- websearch_to_tsquery handles the search shapes users actually type:
--   * `frontend engineer`         → tsquery 'frontend' & 'engineer'
--   * `"frontend engineer"`       → phrase query
--   * `frontend OR engineer`      → boolean OR
--   * `frontend -intern`          → exclude term
--
-- Compared to plainto_tsquery (which only AND's), websearch is the
-- right default for a user-facing search box.

-- Generated column: auto-updates on every UPDATE / INSERT to title,
-- company, description. No trigger required. STORED so the index can
-- use it.
alter table public.jobs
  add column if not exists search_vector tsvector
    generated always as (
      setweight(to_tsvector('english', coalesce(title,       '')), 'A') ||
      setweight(to_tsvector('english', coalesce(company,     '')), 'B') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'C')
    ) stored;

create index if not exists jobs_search_vector_idx
  on public.jobs using gin (search_vector);

-- ── Optional: trigram index for the LANDING-page ILIKE filters ─────
-- The skill/country/timezone/region landing pages filter `.ilike('
-- location', '%foo%')` etc. — these are tighter (short columns) so
-- they're less urgent than the description scan above, but enabling
-- pg_trgm + a trigram GIN index on `location` makes them index-
-- friendly too. Wrapped in a CREATE EXTENSION IF NOT EXISTS so this
-- migration succeeds even on Supabase plans that don't have it.
create extension if not exists pg_trgm;

create index if not exists jobs_location_trgm_idx
  on public.jobs using gin (location gin_trgm_ops);

create index if not exists jobs_title_trgm_idx
  on public.jobs using gin (title gin_trgm_ops);

create index if not exists jobs_company_trgm_idx
  on public.jobs using gin (company gin_trgm_ops);
