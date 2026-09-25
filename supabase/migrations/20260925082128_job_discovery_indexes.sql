create index if not exists jobs_workplace_discovery_idx
  on public.jobs(workplace_type, posted_at desc) where is_active=true;
create index if not exists jobs_relocation_discovery_idx
  on public.jobs(posted_at desc) where is_active=true and (relocation_supported or visa_sponsorship);
