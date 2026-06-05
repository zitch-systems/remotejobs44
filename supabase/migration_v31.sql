-- migration_v31.sql
-- Audit trail for admin grants / revokes.
--
-- Context: a personal account ended up with profiles.role = 'admin' with no
-- record of how or by whom. Regular users already CANNOT change role — the
-- column-level GRANT limits the `authenticated` role to UPDATE (name,
-- updated_at) only — so a role change can only come from the service role, an
-- admin API route, or a manual SQL / Supabase-dashboard edit. The last two
-- are exactly the silent path that created the stray admin.
--
-- This trigger records EVERY role change into admin_actions (the existing
-- append-only audit log surfaced at /admin/audit), so an accidental 'admin'
-- grant is never silent and is always traceable to who + when.
--
-- SECURITY DEFINER: the insert must bypass admin_actions' RLS, because the
-- actor making the change may be the service role / SQL editor with no
-- auth.uid(). search_path is pinned per advisory 0011 so the function can't
-- be influenced by a caller's search_path.

create or replace function public.audit_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    -- New profiles are created as 'user' (auth callback / on_auth_user_created).
    -- A row inserted directly with a privileged role is worth recording.
    if new.role is distinct from 'user' then
      insert into public.admin_actions (admin_id, admin_email, action, target_type, target_id, metadata)
      values (auth.uid(), null, 'profile.role_set_on_insert', 'profile', new.id,
              jsonb_build_object('new_role', new.role, 'target_email', new.email));
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    insert into public.admin_actions (admin_id, admin_email, action, target_type, target_id, metadata)
    values (auth.uid(), null, 'profile.role_change', 'profile', new.id,
            jsonb_build_object('old_role', old.role, 'new_role', new.role, 'target_email', new.email));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_audit_profile_role_change on public.profiles;
create trigger trg_audit_profile_role_change
  after insert or update of role on public.profiles
  for each row execute function public.audit_profile_role_change();

-- After applying, every grant/revoke shows up in the Admin → Audit Log as
-- 'profile.role_change' (or 'profile.role_set_on_insert'), with old_role /
-- new_role / target_email in metadata. In-app admin actions also keep their
-- own recordAdminAction() entry; this trigger is the backstop that catches
-- out-of-band changes (SQL editor, dashboard) those would miss.
