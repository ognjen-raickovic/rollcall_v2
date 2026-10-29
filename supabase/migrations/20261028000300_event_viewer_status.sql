-- Bounded self-only card state. Public discovery remains anonymous and unchanged.
begin;
grant rollcall_events_executor to current_user;
create function private.event_api_viewer_status(p_event_ids uuid[]) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=private.require_active_account(); result jsonb;
begin
 if actor is null then raise exception using errcode='42501',message='Authentication required.'; end if;
 if p_event_ids is null or cardinality(p_event_ids)<1 or cardinality(p_event_ids)>50
   or array_ndims(p_event_ids)<>1 or array_position(p_event_ids,null) is not null
   or (select count(distinct id) from unnest(p_event_ids) id)<>cardinality(p_event_ids) then
  raise exception using errcode='22023',message='Choose 1 to 50 unique event identifiers.';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('eventId',e.id,'isHost',e.host_id=actor,
  'hasJoined',e.host_id<>actor and exists(select 1 from public.event_participants p
    where p.event_id=e.id and p.profile_id=actor)) order by e.id),'[]'::jsonb)
 into result from public.events e where e.id=any(p_event_ids)
  and (e.visibility in ('public','unlisted') or e.host_id=actor or exists(
   select 1 from public.event_participants p where p.event_id=e.id and p.profile_id=actor));
 return jsonb_build_object('userId',actor,'items',result);
end; $$;
grant create on schema private to rollcall_events_executor;
alter function private.event_api_viewer_status(uuid[]) owner to rollcall_events_executor;
revoke create on schema private from rollcall_events_executor;
revoke all on function private.event_api_viewer_status(uuid[]) from public,anon,authenticated,service_role;
grant execute on function private.event_api_viewer_status(uuid[]) to authenticated;
create function public.event_viewer_status(p_event_ids uuid[]) returns jsonb
language sql volatile security invoker set search_path='' as $$
 select private.event_api_viewer_status(p_event_ids);
$$;
revoke all on function public.event_viewer_status(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.event_viewer_status(uuid[]) to authenticated;
revoke rollcall_events_executor from current_user;
notify pgrst,'reload schema';
commit;
