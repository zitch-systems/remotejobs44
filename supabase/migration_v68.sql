-- migration_v68.sql
-- Close the direct PostgREST bypass around employer-identity/apply gating.
--
-- Job rows are served through trusted Next.js routes, where requester-plan
-- checks mask company identity and only reveal application channels after an
-- authorised action. The base jobs table previously retained historical
-- column grants for anon/authenticated, so anyone with the browser-safe
-- Supabase key could query raw company/source/description data directly.
--
-- Keep the existing public-read RLS policy as a second row-visibility guard,
-- but remove base-table privileges entirely. All production job reads and
-- admin mutations already use the service-role server client.
REVOKE ALL PRIVILEGES ON TABLE public.jobs FROM anon, authenticated;

-- PostgreSQL keeps explicit column grants even after a table-level REVOKE.
-- Remove every historical per-column grant as well.
DO $$
DECLARE
  column_name text;
BEGIN
  FOR column_name IN
    SELECT a.attname
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'public.jobs'::regclass
      AND a.attnum > 0
      AND NOT a.attisdropped
  LOOP
    EXECUTE format(
      'REVOKE SELECT (%I) ON TABLE public.jobs FROM anon, authenticated',
      column_name
    );
    EXECUTE format(
      'REVOKE INSERT (%I) ON TABLE public.jobs FROM anon, authenticated',
      column_name
    );
    EXECUTE format(
      'REVOKE UPDATE (%I) ON TABLE public.jobs FROM anon, authenticated',
      column_name
    );
    EXECUTE format(
      'REVOKE REFERENCES (%I) ON TABLE public.jobs FROM anon, authenticated',
      column_name
    );
  END LOOP;
END
$$;

-- Legacy client-callable helpers exposed raw job rows. The application now
-- uses /api/recommendations and service-role search routes, both of which
-- enforce plan-aware masking before serialising a response.
REVOKE EXECUTE ON FUNCTION public.recommended_jobs(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recommended_jobs(integer) TO service_role;

-- Trigger functions never need to be callable through /rest/v1/rpc.
REVOKE EXECUTE ON FUNCTION public.jobs_search_vector_update()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jobs_search_vector_update() TO service_role;
