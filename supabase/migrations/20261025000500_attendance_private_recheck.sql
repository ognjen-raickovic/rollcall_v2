-- Recheck private participation after the row lock using a fresh command snapshot.
-- A concurrent leave may commit while a second request waits; its original RLS
-- snapshot must not authorize a later private no-op or reveal the event's state.
begin;
grant rollcall_events_executor to current_user;

create or replace function private.event_api_attendance(p_event_id uuid, p_join boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  actor uuid := private.event_api_actor();
  item public.events%rowtype;
  joined boolean;
begin
  if actor is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  select * into item from public.events where id = p_event_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Event not found.'; end if;

  -- VOLATILE command execution obtains a current membership snapshot after waiting.
  -- Authorize private access before returning any state-specific error or safe summary.
  joined := exists (select 1 from public.event_participants p
    where p.event_id = item.id and p.profile_id = actor);
  if item.visibility = 'private' and item.host_id <> actor and not joined then
    raise exception using errcode = 'P0002', message = 'Event not found.';
  end if;
  if item.status <> 'scheduled' or item.starts_at <= clock_timestamp() then
    raise exception using errcode = 'RA001', message = 'Attendance can only change before a scheduled event starts.';
  end if;
  if item.host_id = actor then
    raise exception using errcode = 'RA002', message = 'The host does not occupy a participant seat.';
  end if;
  if p_join and not joined then
    if item.participant_count >= item.capacity then
      raise exception using errcode = 'RA003', message = 'This event is full.';
    end if;
    insert into public.event_participants(event_id, profile_id) values (item.id, actor);
    item.participant_count := item.participant_count + 1;
  elsif not p_join and joined then
    delete from public.event_participants where event_id = item.id and profile_id = actor;
    item.participant_count := item.participant_count - 1;
  end if;
  return jsonb_build_object('eventId', item.id, 'hasJoined', p_join,
    'capacity', item.capacity, 'participantCount', item.participant_count,
    'availableSlots', item.capacity - item.participant_count);
end;
$$;

-- CREATE OR REPLACE retains the executor owner and closed helper ACLs.
revoke rollcall_events_executor from current_user;
commit;
