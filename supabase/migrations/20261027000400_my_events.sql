begin;
grant rollcall_events_executor to current_user;
create index events_host_schedule on public.events(host_id,starts_at,id);
create index event_participants_profile_events on public.event_participants(profile_id,event_id);

create function private.event_api_my_events(p_filters jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=private.require_active_account(); n integer:=12; number_value numeric;
 relation text:=coalesce(p_filters->>'relation','hosting'); timing text:=coalesce(p_filters->>'period','upcoming');
 ordering text:=coalesce(p_filters->>'sort','soonest'); cursor_time timestamptz; cursor_id uuid; result jsonb;
begin
 if actor is null then raise exception using errcode='42501',message='Authentication required.'; end if;
 if p_filters is null or jsonb_typeof(p_filters)<>'object' or exists(select 1 from jsonb_object_keys(p_filters) k
 where k not in ('relation','period','sort','limit','afterStartsAt','afterId')) then
  raise exception using errcode='22023',message='Invalid personal event filters.';
 end if;
 if relation not in ('hosting','joined') or timing not in ('upcoming','past','all') or ordering not in ('soonest','latest')
 or exists(select 1 from jsonb_each(p_filters) where key<>'limit' and jsonb_typeof(value)<>'string') then
  raise exception using errcode='22023',message='Invalid personal event filter value.';
 end if;
 if p_filters ? 'limit' then
  if jsonb_typeof(p_filters->'limit')<>'number' then raise exception using errcode='22023',message='Invalid page bound.'; end if;
  number_value:=(p_filters->>'limit')::numeric;
  if number_value<>trunc(number_value) or number_value<1 or number_value>50 then raise exception using errcode='22023',message='Invalid page bound.'; end if;
  n:=number_value::integer;
 end if;
 if (p_filters ? 'afterStartsAt')<>(p_filters ? 'afterId') then raise exception using errcode='22023',message='Cursor fields must be paired.'; end if;
 if p_filters ? 'afterStartsAt' then
  cursor_time:=private.event_api_time(p_filters->>'afterStartsAt');
  if p_filters->>'afterId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception using errcode='22023',message='Invalid event cursor.'; end if;
  cursor_id:=(p_filters->>'afterId')::uuid;
 end if;
 with candidates as materialized (
  select e.id,e.starts_at from public.events e
  where (relation='hosting' and e.host_id=actor or relation='joined' and e.host_id<>actor and exists(
   select 1 from public.event_participants p where p.event_id=e.id and p.profile_id=actor))
  and (timing='all' or timing='upcoming' and e.starts_at>now() or timing='past' and e.ends_at<=now())
  and (cursor_time is null or ordering='soonest' and (e.starts_at,e.id)>(cursor_time,cursor_id)
    or ordering='latest' and (e.starts_at,e.id)<(cursor_time,cursor_id))
  order by case when ordering='soonest' then e.starts_at end,case when ordering='soonest' then e.id end,
   case when ordering='latest' then e.starts_at end desc,case when ordering='latest' then e.id end desc limit n+1
 ), page as (
  select *,row_number() over(order by case when ordering='soonest' then starts_at end,case when ordering='soonest' then id end,
   case when ordering='latest' then starts_at end desc,case when ordering='latest' then id end desc) rn from candidates
 ), chosen as (select * from page where rn<=n)
 select jsonb_build_object('items',coalesce((select jsonb_agg(private.event_api_summary(id) order by rn) from chosen),'[]'::jsonb),
  'hasMore',(select count(*)>n from candidates)) || coalesce((select jsonb_build_object('position',jsonb_build_object(
   'id',id,'startsAt',starts_at,'sort',ordering)) from chosen order by rn desc limit 1),'{}'::jsonb) into result;
 return result;
end; $$;
grant create on schema private to rollcall_events_executor;
alter function private.event_api_my_events(jsonb) owner to rollcall_events_executor;
revoke create on schema private from rollcall_events_executor;
revoke all on function private.event_api_my_events(jsonb) from public,anon,authenticated,service_role;
grant execute on function private.event_api_my_events(jsonb) to authenticated;
create function public.my_events(p_filters jsonb) returns jsonb language sql volatile security invoker set search_path='' as $$
 select private.event_api_my_events(p_filters);
$$;
revoke all on function public.my_events(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.my_events(jsonb) to authenticated;
revoke rollcall_events_executor from current_user;
notify pgrst,'reload schema';
commit;
