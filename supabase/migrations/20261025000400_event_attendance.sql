-- Milestone 4B: verified, row-locked attendance on the existing membership table.
-- Clients keep no raw event/membership/location access. Counters use the existing triggers.
begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'rollcall_attendance_counter') then
    create role rollcall_attendance_counter nologin noinherit nosuperuser nocreatedb
      nocreaterole noreplication nobypassrls;
  elsif exists (select 1 from pg_roles where rolname = 'rollcall_attendance_counter'
    and (rolcanlogin or rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication)) then
    raise exception 'The attendance counter role has unexpected privileges.';
  end if;
  if pg_has_role('anon', 'rollcall_attendance_counter', 'member')
    or pg_has_role('authenticated', 'rollcall_attendance_counter', 'member')
    or pg_has_role('rollcall_events_executor', 'rollcall_attendance_counter', 'member') then
    raise exception 'Request roles must not be members of the attendance counter role.';
  end if;
end;
$$;

grant usage on schema public, private to rollcall_attendance_counter;
grant select (id, host_id, status, starts_at, capacity, participant_count)
  on public.events to rollcall_attendance_counter;
grant update (participant_count) on public.events to rollcall_attendance_counter;
grant select (event_id) on private.event_locations to rollcall_attendance_counter;
grant execute on function private.valid_event_tags(text[], text) to rollcall_attendance_counter;
create policy attendance_counter_event_read on public.events for select
  to rollcall_attendance_counter using (true);
create policy attendance_counter_event_update on public.events for update
  to rollcall_attendance_counter using (true) with check (true);
create policy attendance_counter_location_check on private.event_locations for select
  to rollcall_attendance_counter using (true);

-- Preserve the established trigger bodies, counter arithmetic and deferred invariants.
-- These argument-free trigger functions cannot be called as ordinary SQL/RPC operations.
-- The invariant helper needs only location identifiers, never an exact address.
grant rollcall_attendance_counter, rollcall_events_executor to current_user;
grant create on schema private to rollcall_attendance_counter;
alter function private.track_event_participation() security definer;
alter function private.track_event_participation() owner to rollcall_attendance_counter;
alter function private.require_event_location() security definer;
alter function private.require_event_location() owner to rollcall_attendance_counter;
revoke all on function private.track_event_participation(), private.require_event_location()
  from public, anon, authenticated, service_role, rollcall_events_executor;
revoke create on schema private from rollcall_attendance_counter;

grant select (event_id, profile_id) on public.event_participants to rollcall_events_executor;
grant insert (event_id, profile_id), delete on public.event_participants to rollcall_events_executor;
create policy event_executor_membership_read on public.event_participants for select
  to rollcall_events_executor using (profile_id = (select private.event_api_actor()));
create policy event_executor_membership_insert on public.event_participants for insert
  to rollcall_events_executor with check (profile_id = (select private.event_api_actor()));
create policy event_executor_membership_delete on public.event_participants for delete
  to rollcall_events_executor using (profile_id = (select private.event_api_actor()));

-- Membership policies intentionally have no event-table dependency: this avoids RLS cycles.
alter policy event_executor_read on public.events using (
  visibility in ('public', 'unlisted') or host_id = (select private.event_api_actor())
  or exists (select 1 from public.event_participants p where p.event_id = id
    and p.profile_id = (select private.event_api_actor())));
alter policy event_executor_location_read on private.event_locations using (
  exists (select 1 from public.events e where e.id = event_id
    and (e.host_id = (select private.event_api_actor()) or exists
      (select 1 from public.event_participants p where p.event_id = e.id
        and p.profile_id = (select private.event_api_actor())))));

-- SELECT FOR UPDATE applies UPDATE USING policies. This permits attendance to lock a
-- readable event, but WITH CHECK(false) never authorizes a resulting content write.
-- The separate existing host-only UPDATE policy remains the only content-write check.
create policy event_executor_attendance_lock on public.events for update
  to rollcall_events_executor using (
    visibility in ('public', 'unlisted') or host_id = (select private.event_api_actor())
    or exists (select 1 from public.event_participants p where p.event_id = id
      and p.profile_id = (select private.event_api_actor()))) with check (false);

create or replace function private.event_api_details(p_event_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  item public.events%rowtype;
  actor uuid := private.event_api_actor();
  joined boolean;
  detail jsonb;
begin
  select * into item from public.events where id = p_event_id;
  if not found then raise exception using errcode = 'P0002', message = 'Event not found.'; end if;
  joined := actor is not null and exists (select 1 from public.event_participants p
    where p.event_id = item.id and p.profile_id = actor);
  detail := private.event_api_summary(item.id) || jsonb_build_object(
    'description', item.description,
    'host', (select jsonb_build_object('id', p.id, 'displayName', p.display_name)
      from public.profiles p where p.id = item.host_id),
    'minimumAge', item.minimum_age, 'experienceLevel', item.experience_level,
    'price', item.price, 'currency', item.currency,
    'createdAt', item.created_at, 'updatedAt', item.updated_at,
    'viewer', jsonb_build_object('userId', actor, 'isHost', coalesce(item.host_id = actor, false),
      'hasJoined', joined));
  if item.host_id = actor or joined then
    detail := detail || jsonb_build_object('address',
      (select address from private.event_locations where event_id = item.id));
  end if;
  return detail;
end;
$$;

-- Internal shared implementation; only checked entry points may call it.
create function private.event_api_attendance(p_event_id uuid, p_join boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  actor uuid := private.event_api_actor();
  item public.events%rowtype;
  joined boolean;
begin
  if actor is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  select * into item from public.events where id = p_event_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Event not found.'; end if;
  -- Evaluate actual time after acquiring the lock, not the transaction's earlier now().
  if item.status <> 'scheduled' or item.starts_at <= clock_timestamp() then
    raise exception using errcode = 'RA001', message = 'Attendance can only change before a scheduled event starts.';
  end if;
  if item.host_id = actor then
    raise exception using errcode = 'RA002', message = 'The host does not occupy a participant seat.';
  end if;
  joined := exists (select 1 from public.event_participants p
    where p.event_id = item.id and p.profile_id = actor);
  if p_join and not joined then
    -- A private outsider is already invisible under RLS. Keep this explicit defense too.
    if item.visibility = 'private' then
      raise exception using errcode = 'P0002', message = 'Event not found.';
    end if;
    if item.participant_count >= item.capacity then
      raise exception using errcode = 'RA003', message = 'This event is full.';
    end if;
    insert into public.event_participants(event_id, profile_id) values (item.id, actor);
    item.participant_count := item.participant_count + 1;
  elsif not p_join and joined then
    delete from public.event_participants where event_id = item.id and profile_id = actor;
    item.participant_count := item.participant_count - 1;
  end if;
  -- No-op calls never touch memberships, participant_count or updated_at. A private leave
  -- intentionally returns only this safe summary after the participant loses read access.
  return jsonb_build_object('eventId', item.id, 'hasJoined', p_join,
    'capacity', item.capacity, 'participantCount', item.participant_count,
    'availableSlots', item.capacity - item.participant_count);
end;
$$;

create function private.event_api_join(p_event_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select private.event_api_attendance(p_event_id, true);
$$;
create function private.event_api_leave(p_event_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select private.event_api_attendance(p_event_id, false);
$$;
grant create on schema private to rollcall_events_executor;
alter function private.event_api_attendance(uuid, boolean) owner to rollcall_events_executor;
alter function private.event_api_join(uuid) owner to rollcall_events_executor;
alter function private.event_api_leave(uuid) owner to rollcall_events_executor;
revoke create on schema private from rollcall_events_executor;
revoke all on function private.event_api_attendance(uuid, boolean),
  private.event_api_join(uuid), private.event_api_leave(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.event_api_join(uuid), private.event_api_leave(uuid) to authenticated;

create function public.join_event(p_event_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.event_api_join(p_event_id);
$$;
create function public.leave_event(p_event_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.event_api_leave(p_event_id);
$$;
revoke all on function public.join_event(uuid), public.leave_event(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.join_event(uuid), public.leave_event(uuid) to authenticated;

comment on role rollcall_attendance_counter is
  'NOLOGIN/NOBYPASSRLS owner of existing counter/invariant triggers. Counter-column and location-ID access only; never granted to request roles.';
comment on function public.join_event(uuid) is
  'Verified subject joins a public/unlisted future scheduled event; existing private participants may repeat. Serializes on event row.';
comment on function public.leave_event(uuid) is
  'Verified subject leaves only their own membership; safe summary after private access is removed.';
comment on function public.get_event(uuid) is
  'Public/unlisted detail or verified private host/participant. Exact addresses require host/current membership; no role/sharing override.';
revoke rollcall_attendance_counter, rollcall_events_executor from current_user;
commit;
