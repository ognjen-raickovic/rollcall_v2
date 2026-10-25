-- Milestone 3A: create only the minimal Auth-linked profile, without public access.
-- Do not copy email, editable metadata, geographic selections or roles into the profile.
begin;

create function private.initialize_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, 'RollCall player')
  on conflict (id) do nothing;
  return new;
end;
$$;

-- The trigger is the only entry point. No ordinary API role may invoke this function.
revoke all on function private.initialize_auth_profile()
  from public, anon, authenticated, service_role;

create trigger initialize_rollcall_profile
  after insert on auth.users
  for each row execute function private.initialize_auth_profile();

-- Preserve any previously initialized profile. Registration can precede this migration.
insert into public.profiles (id, display_name)
select id, 'RollCall player' from auth.users
on conflict (id) do nothing;

comment on function private.initialize_auth_profile() is
  'Minimal Auth UUID initialization only. Fixed placeholder name; no metadata-derived roles or email. Profile onboarding remains Milestone 3B.';

-- Existing table grants, deny-by-default RLS and private-schema restrictions are retained.
commit;
