-- Frequent ingestion touches clear visibility-map bits on jobs. With the
-- default 20% vacuum scale factor, roughly 40k dead tuples accumulated before
-- vacuum could run; exact listing counts then visited tens of thousands of
-- heap tuples despite using the existing covering index.
-- Keep that index effective without adding another index to every ingestion
-- write. At ~200k rows these settings vacuum after ~3k dead tuples and analyze
-- after ~5k changes. All job data, grants, filters, and count semantics stay intact.
alter table public.jobs set (
  autovacuum_vacuum_scale_factor = 0.01,
  autovacuum_vacuum_threshold = 1000,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_analyze_threshold = 1000
);

-- Run VACUUM (ANALYZE) public.jobs separately from a migration transaction
-- when applying this to an existing table with accumulated dead tuples.
