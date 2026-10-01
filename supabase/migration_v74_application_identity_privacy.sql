-- Employer identity is hydrated from jobs only for Pro/admin responses. Do not
-- retain company names or logos in user-owned application rows.
alter table public.applications alter column company drop not null;
update public.applications set company = null, company_logo = null
where company is not null or company_logo is not null;
