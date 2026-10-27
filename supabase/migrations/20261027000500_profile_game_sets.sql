-- Explicit draft saves: one owner-scoped transaction and value-based compare-and-swap.
begin;

-- Serialize every authenticated statement, including legacy RPCs and direct Data API
-- writes, BEFORE row locks. RLS remains the independent per-row ownership boundary.
create function private.lock_my_game_experience() returns trigger
language plpgsql security invoker set search_path='' as $$
declare actor uuid;
begin
  if auth.uid() is not null then
    actor := private.require_active_account();
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,8263153));
  end if;
  return null;
end; $$;
revoke all on function private.lock_my_game_experience() from public,anon,authenticated,service_role;
create trigger game_experience_statement_lock before insert or update or delete
  on public.user_game_experience for each statement execute function private.lock_my_game_experience();

create function public.replace_my_game_experience(p_games jsonb, p_expected jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor uuid := private.require_active_account(); payload jsonb; item jsonb;
  desired jsonb; expected jsonb; current_set jsonb;
begin
  if actor is null then raise exception using errcode='42501',message='Authentication required.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,8263153));
  foreach payload in array array[p_games,p_expected] loop
    if payload is null or jsonb_typeof(payload)<>'array' then
      raise exception using errcode='22023',message='Provide a game set.';
    end if;
    if jsonb_array_length(payload)>50 then
      raise exception using errcode='22023',message='Choose at most 50 games.';
    end if;
    for item in select value from jsonb_array_elements(payload) loop
      if jsonb_typeof(item)<>'object' then raise exception using errcode='22023',message='Invalid game entry.'; end if;
      if (select count(*) from jsonb_object_keys(item))<>2
        or not (item ? 'gameId' and item ? 'experience')
        or jsonb_typeof(item->'gameId')<>'number'
        or (item->>'gameId') !~ '^[1-9][0-9]{0,9}$'
        or (item->>'gameId')::numeric>2147483647
        or jsonb_typeof(item->'experience')<>'string'
        or item->>'experience' not in ('beginner','intermediate','veteran') then
        raise exception using errcode='22023',message='Invalid game entry.';
      end if;
      if not exists(select 1 from public.games where id=(item->>'gameId')::integer) then
        raise exception using errcode='22023',message='Choose a catalog game.';
      end if;
    end loop;
    if (select count(distinct value->>'gameId') from jsonb_array_elements(payload))<>jsonb_array_length(payload) then
      raise exception using errcode='22023',message='Choose each game once.';
    end if;
  end loop;
  select coalesce(jsonb_agg(value order by (value->>'gameId')::integer),'[]') into desired from jsonb_array_elements(p_games);
  select coalesce(jsonb_agg(value order by (value->>'gameId')::integer),'[]') into expected from jsonb_array_elements(p_expected);
  select coalesce(jsonb_agg(jsonb_build_object('gameId',game_id,'experience',experience_level) order by game_id),'[]')
    into current_set from public.user_game_experience where profile_id=actor;
  if current_set<>expected then
    raise exception using errcode='PT409',message='Saved games changed. Reload before saving.';
  end if;
  if current_set<>desired then
    delete from public.user_game_experience where profile_id=actor
      and not exists(select 1 from jsonb_array_elements(desired) x where (x->>'gameId')::integer=game_id);
    insert into public.user_game_experience(profile_id,game_id,experience_level)
      select actor,(value->>'gameId')::integer,value->>'experience' from jsonb_array_elements(desired)
      on conflict(profile_id,game_id) do update set experience_level=excluded.experience_level
      where public.user_game_experience.experience_level<>excluded.experience_level;
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('gameId',x.game_id,'gameName',g.name,'experience',x.experience_level)
    order by g.name,g.id),'[]') from public.user_game_experience x join public.games g on g.id=x.game_id where x.profile_id=actor);
end; $$;
revoke all on function public.replace_my_game_experience(jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.replace_my_game_experience(jsonb,jsonb) to authenticated;
commit;
