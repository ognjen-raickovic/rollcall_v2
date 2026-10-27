-- Milestone 4A: bounded event RPCs. Ordinary API roles receive no event table grants.
-- A non-login, non-bypass executor remains subject to explicit RLS and host checks.
begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'rollcall_events_executor') then
    create role rollcall_events_executor nologin noinherit nosuperuser nocreatedb
      nocreaterole noreplication nobypassrls;
  elsif exists (select 1 from pg_roles where rolname = 'rollcall_events_executor'
    and (rolcanlogin or rolsuper or rolbypassrls or rolcreaterole or rolcreatedb)) then
    raise exception 'The event executor role has unexpected privileges.';
  end if;
  if pg_has_role('anon', 'rollcall_events_executor', 'member')
    or pg_has_role('authenticated', 'rollcall_events_executor', 'member') then
    raise exception 'API roles must not be members of the event executor role.';
  end if;
end;
$$;

-- Initial hosted rollout compatibility: managed Auth privileges cannot be delegated.
-- Define the same narrow resolver used by the following identity migration now,
-- before executor-owned functions and RLS policies need it.
grant usage on schema public, private to rollcall_events_executor;
create function private.event_api_actor()
returns uuid language sql stable security definer set search_path = '' as $$
  select auth.uid();
$$;
revoke all on function private.event_api_actor() from public, anon, authenticated, service_role;
grant execute on function private.event_api_actor() to rollcall_events_executor;
grant execute on function private.valid_event_tags(text[], text) to rollcall_events_executor;
grant select on public.events, public.games, public.profiles, public.cities, public.countries
  to rollcall_events_executor;
grant insert (host_id, game_id, city_id, title, description, venue, starts_at, ends_at,
  capacity, experience_level, price, tags, minimum_age, visibility, status, cover_storage_path)
  on public.events to rollcall_events_executor;
grant update (game_id, city_id, title, description, venue, starts_at, ends_at,
  capacity, experience_level, price, tags, minimum_age, visibility, status, cover_storage_path)
  on public.events to rollcall_events_executor;
grant delete on public.events to rollcall_events_executor;
grant select on private.event_locations to rollcall_events_executor;
grant insert (event_id, address), update (address) on private.event_locations to rollcall_events_executor;

create policy event_executor_reference_countries on public.countries for select
  to rollcall_events_executor using (true);
create policy event_executor_reference_cities on public.cities for select
  to rollcall_events_executor using (true);
create policy event_executor_reference_games on public.games for select
  to rollcall_events_executor using (true);
create policy event_executor_reference_profiles on public.profiles for select
  to rollcall_events_executor using (true);
create policy event_executor_read on public.events for select to rollcall_events_executor
  using (visibility in ('public', 'unlisted') or host_id = (select private.event_api_actor()));
create policy event_executor_insert on public.events for insert to rollcall_events_executor
  with check (host_id = (select private.event_api_actor()));
create policy event_executor_update on public.events for update to rollcall_events_executor
  using (host_id = (select private.event_api_actor())) with check (host_id = (select private.event_api_actor()));
create policy event_executor_delete on public.events for delete to rollcall_events_executor
  using (host_id = (select private.event_api_actor()));
create policy event_executor_location_read on private.event_locations for select
  to rollcall_events_executor using (exists
    (select 1 from public.events e where e.id = event_id and e.host_id = (select private.event_api_actor())));
create policy event_executor_location_insert on private.event_locations for insert
  to rollcall_events_executor with check (exists
    (select 1 from public.events e where e.id = event_id and e.host_id = (select private.event_api_actor())));
create policy event_executor_location_update on private.event_locations for update
  to rollcall_events_executor using (exists
    (select 1 from public.events e where e.id = event_id and e.host_id = (select private.event_api_actor())))
  with check (exists
    (select 1 from public.events e where e.id = event_id and e.host_id = (select private.event_api_actor())));

-- Substring title search supplements the existing chronological/city/game indexes.
create index events_public_title_trgm_idx on public.events using gin (title extensions.gin_trgm_ops)
  where visibility = 'public' and status = 'scheduled';

-- These helpers are callable only by the executor. No client-controlled address flag exists.
create function private.event_api_time(value text)
returns timestamptz language plpgsql immutable security invoker set search_path = '' as $$
declare parsed timestamptz;
begin
  if value is null or length(value) > 64 or value !~
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' then
    raise exception using errcode = '22023', message = 'Use an ISO timestamp with timezone.';
  end if;
  begin parsed := value::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '22023', message = 'Use a valid timestamp.';
  end;
  if not isfinite(parsed) then
    raise exception using errcode = '22023', message = 'Use a finite timestamp.';
  end if;
  return parsed;
end;
$$;

create function private.event_api_input(p_input jsonb, p_patch boolean)
returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare
  cleaned jsonb := p_input;
  field text;
  value jsonb;
  numeric_value numeric;
  strings text[] := array['title','description','address','experienceLevel','visibility','status','startsAt','endsAt'];
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' or p_input = '{}'::jsonb then
    raise exception using errcode = '22023', message = 'Provide event fields.';
  end if;
  if exists (select 1 from jsonb_object_keys(p_input) key where key not in
    ('title','description','gameId','cityId','venue','address','startsAt','endsAt','capacity',
     'minimumAge','experienceLevel','price','tags','visibility','coverStoragePath','status'))
    or (not p_patch and p_input ? 'status') then
    raise exception using errcode = '22023', message = 'Unexpected event field.';
  end if;
  if not p_patch and not (p_input ?& array['title','description','gameId','cityId',
    'address','startsAt','endsAt','capacity','experienceLevel']) then
    raise exception using errcode = '22023', message = 'Required event fields are missing.';
  end if;
  foreach field in array strings loop
    if p_input ? field then
      if jsonb_typeof(p_input->field) <> 'string' then
        raise exception using errcode = '22023', message = 'Invalid event field type.';
      end if;
      cleaned := jsonb_set(cleaned, array[field], to_jsonb(btrim(p_input->>field)));
    end if;
  end loop;
  if (cleaned ? 'title' and char_length(cleaned->>'title') not between 3 and 100)
    or (cleaned ? 'description' and char_length(cleaned->>'description') not between 10 and 5000)
    or (cleaned ? 'address' and char_length(cleaned->>'address') not between 3 and 200) then
    raise exception using errcode = '22023', message = 'Invalid event text length.';
  end if;
  if cleaned ? 'venue' then
    if jsonb_typeof(cleaned->'venue') not in ('string','null') then
      raise exception using errcode = '22023', message = 'Invalid venue.';
    end if;
    if nullif(btrim(cleaned->>'venue'), '') is null then
      cleaned := jsonb_set(cleaned, '{venue}', 'null'::jsonb);
    elsif char_length(btrim(cleaned->>'venue')) not between 2 and 120 then
      raise exception using errcode = '22023', message = 'Invalid venue length.';
    else cleaned := jsonb_set(cleaned, '{venue}', to_jsonb(btrim(cleaned->>'venue')));
    end if;
  end if;
  if (cleaned ? 'experienceLevel' and cleaned->>'experienceLevel' not in ('all-levels','beginner','experienced'))
    or (cleaned ? 'visibility' and cleaned->>'visibility' not in ('public','private','unlisted'))
    or (cleaned ? 'status' and cleaned->>'status' not in ('scheduled','cancelled')) then
    raise exception using errcode = '22023', message = 'Choose a valid event state.';
  end if;
  foreach field in array array['gameId','cityId','capacity','minimumAge'] loop
    if cleaned ? field then
      value := cleaned->field;
      if jsonb_typeof(value) <> 'number' then
        raise exception using errcode = '22023', message = 'Use integer event fields.';
      end if;
      numeric_value := (value::text)::numeric;
      if numeric_value <> trunc(numeric_value) or numeric_value > 2147483647
        or numeric_value < (case when field = 'minimumAge' then 0 else 1 end)
        or (field = 'capacity' and numeric_value > 100)
        or (field = 'minimumAge' and numeric_value > 99) then
        raise exception using errcode = '22023', message = 'Invalid integer event field.';
      end if;
    end if;
  end loop;
  if cleaned ? 'price' then
    if jsonb_typeof(cleaned->'price') <> 'number' then
      raise exception using errcode = '22023', message = 'Use a valid price.';
    end if;
    numeric_value := (cleaned->>'price')::numeric;
    if numeric_value < 0 or numeric_value > 10000 or numeric_value <> round(numeric_value, 2) then
      raise exception using errcode = '22023', message = 'Use a valid EUR price.';
    end if;
  end if;
  if cleaned ? 'coverStoragePath' and cleaned->'coverStoragePath' <> 'null'::jsonb then
    raise exception using errcode = '22023', message = 'Only default covers are supported.';
  end if;
  if cleaned ? 'tags' then
    if jsonb_typeof(cleaned->'tags') <> 'array' then
      raise exception using errcode = '22023', message = 'Use predefined event tags.';
    end if;
    if jsonb_array_length(cleaned->'tags') > 6 or exists
      (select 1 from jsonb_array_elements(cleaned->'tags') tag where jsonb_typeof(tag) <> 'string') then
      raise exception using errcode = '22023', message = 'Use up to six predefined event tags.';
    end if;
  end if;
  foreach field in array array['startsAt','endsAt'] loop
    if cleaned ? field then perform private.event_api_time(cleaned->>field); end if;
  end loop;
  return cleaned;
end;
$$;

create function private.event_api_summary(p_event_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id, 'title', e.title,
    'game', jsonb_build_object('id', g.id, 'name', g.name, 'category', g.category),
    'city', jsonb_build_object('id', city.id, 'name', city.name, 'administrativeDivision', city.administrative_division),
    'country', jsonb_build_object('id', country.id, 'isoCode', country.iso_code, 'name', country.name),
    'venue', e.venue, 'startsAt', e.starts_at, 'endsAt', e.ends_at,
    'capacity', e.capacity, 'participantCount', e.participant_count,
    'availableSlots', e.capacity - e.participant_count,
    'tags', e.tags, 'visibility', e.visibility, 'status', e.status,
    'cover', jsonb_build_object('kind', 'default', 'imageUrl', case g.category
      when 'board-game' then '/images/board-games.svg'
      when 'role-playing' then '/images/role-playing.svg'
      when 'trading-card' then '/images/trading-card.svg'
      when 'social-deduction' then '/images/social-deduction.svg' end)
  ) from public.events e join public.games g on g.id = e.game_id
    join public.cities city on city.id = e.city_id
    join public.countries country on country.id = city.country_id
  where e.id = p_event_id;
$$;

create function private.event_api_details(p_event_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare item public.events%rowtype; detail jsonb;
begin
  select * into item from public.events where id = p_event_id;
  if not found then raise exception using errcode = 'P0002', message = 'Event not found.'; end if;
  detail := private.event_api_summary(item.id) || jsonb_build_object(
    'description', item.description,
    'host', (select jsonb_build_object('id', p.id, 'displayName', p.display_name) from public.profiles p where p.id = item.host_id),
    'minimumAge', item.minimum_age, 'experienceLevel', item.experience_level,
    'price', item.price, 'currency', item.currency,
    'createdAt', item.created_at, 'updatedAt', item.updated_at);
  if item.host_id = private.event_api_actor() then
    detail := detail || jsonb_build_object('address', (select address from private.event_locations where event_id = item.id));
  end if;
  return detail;
end;
$$;

create function private.event_api_discover(p_filters jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  n integer := 12;
  search_text text := '';
  country_code text;
  city_filter integer;
  game_filter integer;
  upcoming boolean := true;
  available boolean := false;
  after_time timestamptz;
  before_time timestamptz;
  cursor_time timestamptz;
  cursor_id uuid;
  field text;
  number_value numeric;
begin
  if p_filters is null or jsonb_typeof(p_filters) <> 'object' or exists
    (select 1 from jsonb_object_keys(p_filters) key where key not in
      ('search','country','cityId','gameId','startsAfter','startsBefore','upcomingOnly','availableOnly','status','limit','afterStartsAt','afterId')) then
    raise exception using errcode = '22023', message = 'Invalid discovery filters.';
  end if;
  foreach field in array array['search','country','status','startsAfter','startsBefore','afterStartsAt','afterId'] loop
    if p_filters ? field and jsonb_typeof(p_filters->field) <> 'string' then
      raise exception using errcode = '22023', message = 'Invalid discovery field type.';
    end if;
  end loop;
  if p_filters ? 'search' then
    search_text := btrim(p_filters->>'search');
    if length(search_text) > 100 then raise exception using errcode = '22023', message = 'Search is too long.'; end if;
  end if;
  if p_filters ? 'country' then
    country_code := upper(btrim(p_filters->>'country'));
    if country_code !~ '^[A-Z]{2}$' then raise exception using errcode = '22023', message = 'Invalid country.'; end if;
  end if;
  if p_filters ? 'status' and p_filters->>'status' <> 'scheduled' then
    raise exception using errcode = '22023', message = 'Discovery includes scheduled events only.';
  end if;
  foreach field in array array['cityId','gameId','limit'] loop
    if p_filters ? field then
      if jsonb_typeof(p_filters->field) <> 'number' then
        raise exception using errcode = '22023', message = 'Invalid discovery integer.';
      end if;
      number_value := (p_filters->>field)::numeric;
      if number_value <> trunc(number_value) or number_value < 1 or number_value > 2147483647
        or (field = 'limit' and number_value > 50) then
        raise exception using errcode = '22023', message = 'Invalid discovery bound.';
      end if;
      if field = 'limit' then n := number_value::integer;
      elsif field = 'cityId' then city_filter := number_value::integer;
      else game_filter := number_value::integer; end if;
    end if;
  end loop;
  foreach field in array array['upcomingOnly','availableOnly'] loop
    if p_filters ? field then
      if jsonb_typeof(p_filters->field) <> 'boolean' then
        raise exception using errcode = '22023', message = 'Invalid discovery boolean.';
      end if;
      if field = 'upcomingOnly' then upcoming := (p_filters->>field)::boolean;
      else available := (p_filters->>field)::boolean; end if;
    end if;
  end loop;
  if p_filters ? 'startsAfter' then after_time := private.event_api_time(p_filters->>'startsAfter'); end if;
  if p_filters ? 'startsBefore' then before_time := private.event_api_time(p_filters->>'startsBefore'); end if;
  if after_time > before_time then raise exception using errcode = '22023', message = 'Date range is reversed.'; end if;
  if (p_filters ? 'afterStartsAt') <> (p_filters ? 'afterId') then
    raise exception using errcode = '22023', message = 'Cursor fields must be paired.';
  end if;
  if p_filters ? 'afterStartsAt' then
    cursor_time := private.event_api_time(p_filters->>'afterStartsAt');
    if p_filters->>'afterId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'Invalid event cursor.';
    end if;
    cursor_id := (p_filters->>'afterId')::uuid;
  end if;
  -- Escape wildcard syntax; filter values are parameters, never SQL fragments.
  search_text := replace(replace(replace(search_text, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');
  return (
    with candidates as materialized (
      select e.id, e.starts_at from public.events e
      join public.cities city on city.id = e.city_id
      join public.countries country on country.id = city.country_id
      where e.visibility = 'public' and e.status = 'scheduled'
        and country.enabled and country.iso_code in ('ME','RS','BA','HR')
        and (country_code is null or country.iso_code = country_code)
        and (city_filter is null or e.city_id = city_filter)
        and (game_filter is null or e.game_id = game_filter)
        and e.title ilike ('%' || search_text || '%') escape E'\\'
        and (not upcoming or e.starts_at > now())
        and (not available or (e.starts_at > now() and e.participant_count < e.capacity))
        and (after_time is null or e.starts_at >= after_time)
        and (before_time is null or e.starts_at <= before_time)
        and (cursor_time is null or (e.starts_at, e.id) > (cursor_time, cursor_id))
      order by e.starts_at, e.id limit n + 1
    ), page as (select * from candidates order by starts_at, id limit n)
    select jsonb_build_object(
      'items', coalesce((select jsonb_agg(private.event_api_summary(id) order by starts_at, id) from page), '[]'::jsonb),
      'hasMore', (select count(*) > n from candidates))
  );
end;
$$;

create function private.event_api_get(p_event_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.event_api_details(p_event_id);
$$;

create function private.event_api_create(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare input jsonb; event_id uuid; chosen_city integer; chosen_game integer; event_tags text[];
begin
  if private.event_api_actor() is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  input := private.event_api_input(p_input, false);
  chosen_city := ((input->>'cityId')::numeric)::integer;
  chosen_game := ((input->>'gameId')::numeric)::integer;
  if not exists (select 1 from public.games where id = chosen_game) or not exists
    (select 1 from public.cities city join public.countries country on country.id = city.country_id
      where city.id = chosen_city and country.enabled and country.iso_code in ('ME','RS','BA','HR')) then
    raise exception using errcode = '23503', message = 'Choose an existing game and supported city.';
  end if;
  event_tags := case when input ? 'tags' then array(select jsonb_array_elements_text(input->'tags')) else '{}'::text[] end;
  insert into public.events (host_id, game_id, city_id, title, description, venue, starts_at, ends_at,
    capacity, experience_level, price, tags, minimum_age, visibility, status, cover_storage_path)
  values (private.event_api_actor(), chosen_game, chosen_city, input->>'title', input->>'description', input->>'venue',
    private.event_api_time(input->>'startsAt'), private.event_api_time(input->>'endsAt'),
    ((input->>'capacity')::numeric)::integer, input->>'experienceLevel', coalesce((input->>'price')::numeric, 0),
    event_tags, coalesce(((input->>'minimumAge')::numeric)::integer, 0), coalesce(input->>'visibility','public'), 'scheduled', null)
  returning id into event_id;
  insert into private.event_locations(event_id, address) values (event_id, input->>'address');
  -- Flush deferred invariants before the definer context ends; caller tables stay closed.
  set constraints public.events_require_location, private.event_locations_required immediate;
  set constraints public.events_require_location, private.event_locations_required deferred;
  return private.event_api_details(event_id);
end;
$$;

create function private.event_api_update(p_event_id uuid, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare input jsonb; previous public.events%rowtype; next public.events%rowtype;
begin
  if private.event_api_actor() is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  select * into previous from public.events where id = p_event_id and host_id = private.event_api_actor() for update;
  if not found then raise exception using errcode = 'P0002', message = 'Event not found.'; end if;
  input := private.event_api_input(p_patch, true);
  next := previous;
  if input ? 'title' then next.title := input->>'title'; end if;
  if input ? 'description' then next.description := input->>'description'; end if;
  if input ? 'venue' then next.venue := input->>'venue'; end if;
  if input ? 'gameId' then next.game_id := ((input->>'gameId')::numeric)::integer; end if;
  if input ? 'cityId' then next.city_id := ((input->>'cityId')::numeric)::integer; end if;
  if input ? 'startsAt' then next.starts_at := private.event_api_time(input->>'startsAt'); end if;
  if input ? 'endsAt' then next.ends_at := private.event_api_time(input->>'endsAt'); end if;
  if input ? 'capacity' then next.capacity := ((input->>'capacity')::numeric)::integer; end if;
  if input ? 'minimumAge' then next.minimum_age := ((input->>'minimumAge')::numeric)::integer; end if;
  if input ? 'experienceLevel' then next.experience_level := input->>'experienceLevel'; end if;
  if input ? 'price' then next.price := (input->>'price')::numeric; end if;
  if input ? 'tags' then next.tags := array(select jsonb_array_elements_text(input->'tags')); end if;
  if input ? 'visibility' then next.visibility := input->>'visibility'; end if;
  if input ? 'status' then next.status := input->>'status'; end if;
  if input ? 'coverStoragePath' then next.cover_storage_path := null; end if;
  if next.starts_at <= now() or next.ends_at <= next.starts_at then
    raise exception using errcode = '23514', message = 'Choose a future start and a later end.';
  end if;
  if next.capacity < previous.participant_count then
    raise exception using errcode = 'PT409', message = 'Capacity cannot be below current attendance.';
  end if;
  if not exists (select 1 from public.games where id = next.game_id) or not exists
    (select 1 from public.cities city join public.countries country on country.id = city.country_id
      where city.id = next.city_id and country.enabled and country.iso_code in ('ME','RS','BA','HR')) then
    raise exception using errcode = '23503', message = 'Choose an existing game and supported city.';
  end if;
  update public.events set title = next.title, description = next.description, venue = next.venue,
    game_id = next.game_id, city_id = next.city_id, starts_at = next.starts_at, ends_at = next.ends_at,
    capacity = next.capacity, minimum_age = next.minimum_age, experience_level = next.experience_level,
    price = next.price, tags = next.tags, visibility = next.visibility, status = next.status,
    cover_storage_path = next.cover_storage_path where id = p_event_id;
  if input ? 'address' then update private.event_locations set address = input->>'address' where event_id = p_event_id; end if;
  set constraints public.events_require_location, private.event_locations_required immediate;
  set constraints public.events_require_location, private.event_locations_required deferred;
  return private.event_api_details(p_event_id);
end;
$$;

create function private.event_api_delete(p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.event_api_actor() is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  delete from public.events where id = p_event_id and host_id = private.event_api_actor();
  if not found then raise exception using errcode = 'P0002', message = 'Event not found.'; end if;
  set constraints public.events_require_location, private.event_locations_required immediate;
  set constraints public.events_require_location, private.event_locations_required deferred;
end;
$$;

-- Only the dedicated non-bypass role owns definer entry points. API roles cannot SET ROLE.
-- Local Supabase's migration role is not a superuser. Temporarily permit ownership
-- transfer, then remove membership again within this migration transaction.
grant rollcall_events_executor to current_user;
grant create on schema private to rollcall_events_executor;
alter function private.event_api_time(text) owner to rollcall_events_executor;
alter function private.event_api_input(jsonb, boolean) owner to rollcall_events_executor;
alter function private.event_api_summary(uuid) owner to rollcall_events_executor;
alter function private.event_api_details(uuid) owner to rollcall_events_executor;
alter function private.event_api_discover(jsonb) owner to rollcall_events_executor;
alter function private.event_api_get(uuid) owner to rollcall_events_executor;
alter function private.event_api_create(jsonb) owner to rollcall_events_executor;
alter function private.event_api_update(uuid, jsonb) owner to rollcall_events_executor;
alter function private.event_api_delete(uuid) owner to rollcall_events_executor;
revoke create on schema private from rollcall_events_executor;

revoke all on function private.event_api_time(text), private.event_api_input(jsonb, boolean),
  private.event_api_summary(uuid), private.event_api_details(uuid), private.event_api_discover(jsonb),
  private.event_api_get(uuid), private.event_api_create(jsonb), private.event_api_update(uuid, jsonb),
  private.event_api_delete(uuid) from public, anon, authenticated, service_role;

-- Schema USAGE permits only naming the explicitly executable entry points, not table reads.
grant usage on schema private to anon;
grant execute on function private.event_api_discover(jsonb), private.event_api_get(uuid) to anon, authenticated;
grant execute on function private.event_api_create(jsonb), private.event_api_update(uuid, jsonb),
  private.event_api_delete(uuid) to authenticated;

create function public.discover_events(p_filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.event_api_discover(p_filters);
$$;
create function public.get_event(p_event_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.event_api_get(p_event_id);
$$;
create function public.create_event(p_input jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.event_api_create(p_input);
$$;
create function public.update_event(p_event_id uuid, p_patch jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.event_api_update(p_event_id, p_patch);
$$;
create function public.delete_event(p_event_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.event_api_delete(p_event_id);
$$;
revoke all on function public.discover_events(jsonb), public.get_event(uuid), public.create_event(jsonb),
  public.update_event(uuid,jsonb), public.delete_event(uuid) from public, anon, authenticated, service_role;
grant execute on function public.discover_events(jsonb), public.get_event(uuid) to anon, authenticated;
grant execute on function public.create_event(jsonb), public.update_event(uuid,jsonb), public.delete_event(uuid) to authenticated;

comment on role rollcall_events_executor is 'NOLOGIN/NOBYPASSRLS owner of checked event functions; never granted to API roles.';
comment on function public.discover_events(jsonb) is 'Bounded scheduled/public event discovery. No direct client event table grant.';
comment on function public.get_event(uuid) is 'Public/unlisted detail or private host. Exact address is host-only regardless of sharing flag.';
revoke rollcall_events_executor from current_user;
commit;
