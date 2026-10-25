-- Local/hosted Supabase owns auth schema separately from the migration role. Resolve
-- the request subject through one private, argument-free helper instead of granting
-- the event executor broad Auth-schema access. No table is read by this helper.
begin;

create function private.event_api_actor()
returns uuid language sql stable security definer set search_path = '' as $$
  select auth.uid();
$$;
revoke all on function private.event_api_actor() from public, anon, authenticated, service_role;
grant execute on function private.event_api_actor() to rollcall_events_executor;

grant rollcall_events_executor to current_user;
-- Replace only the four reviewed function bodies; retain owners, ACLs and search paths.
do $$
declare routine regprocedure;
begin
  foreach routine in array array[
    'private.event_api_details(uuid)'::regprocedure,
    'private.event_api_create(jsonb)'::regprocedure,
    'private.event_api_update(uuid,jsonb)'::regprocedure,
    'private.event_api_delete(uuid)'::regprocedure
  ] loop
    execute replace(pg_get_functiondef(routine), 'auth.uid()', 'private.event_api_actor()');
  end loop;
end;
$$;

-- Timestamp conversion and generic JSON conversion are STABLE, not IMMUTABLE.
alter function private.event_api_time(text) stable;
alter function private.event_api_input(jsonb, boolean) stable;

alter policy event_executor_read on public.events
  using (visibility in ('public', 'unlisted') or host_id = (select private.event_api_actor()));
alter policy event_executor_insert on public.events
  with check (host_id = (select private.event_api_actor()));
alter policy event_executor_update on public.events
  using (host_id = (select private.event_api_actor()))
  with check (host_id = (select private.event_api_actor()));
alter policy event_executor_delete on public.events
  using (host_id = (select private.event_api_actor()));
alter policy event_executor_location_read on private.event_locations
  using (exists (select 1 from public.events e where e.id = event_id and e.host_id = (select private.event_api_actor())));
alter policy event_executor_location_insert on private.event_locations
  with check (exists (select 1 from public.events e where e.id = event_id and e.host_id = (select private.event_api_actor())));
alter policy event_executor_location_update on private.event_locations
  using (exists (select 1 from public.events e where e.id = event_id and e.host_id = (select private.event_api_actor())))
  with check (exists (select 1 from public.events e where e.id = event_id and e.host_id = (select private.event_api_actor())));

revoke rollcall_events_executor from current_user;
comment on function private.event_api_actor() is
  'Argument-free Auth subject resolver only; no table access. Not executable by API roles.';
commit;
