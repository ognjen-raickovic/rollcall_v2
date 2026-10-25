-- Milestone 3B: public-safe profiles and owner-scoped personal details/experience.
-- Registration initialization from 3A is preserved; no event or role privileges change.
begin;

grant select on public.profiles, public.games, public.user_game_experience to anon, authenticated;
create policy profiles_public_read on public.profiles for select to anon, authenticated using (true);
create policy games_public_read on public.games for select to anon, authenticated using (true);
create policy game_experience_public_read on public.user_game_experience for select to anon, authenticated using (true);

grant update (display_name, country_id, city_id, biography) on public.profiles to authenticated;
create policy profiles_owner_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

grant insert (profile_id, game_id, experience_level), update (experience_level), delete
  on public.user_game_experience to authenticated;
create policy game_experience_owner_insert on public.user_game_experience for insert to authenticated
  with check (profile_id = (select auth.uid()));
create policy game_experience_owner_update on public.user_game_experience for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy game_experience_owner_delete on public.user_game_experience for delete to authenticated
  using (profile_id = (select auth.uid()));

-- Private remains outside PostgREST's exposed schemas. These permissions are used only
-- under the caller's identity by the SECURITY INVOKER functions below, retaining RLS.
grant usage on schema private to authenticated;
grant select on private.profile_private to authenticated;
grant insert (profile_id, birth_year, age_declared_at), update (birth_year, age_declared_at)
  on private.profile_private to authenticated;
create policy private_profile_owner_read on private.profile_private for select to authenticated
  using (profile_id = (select auth.uid()));
create policy private_profile_owner_insert on private.profile_private for insert to authenticated
  with check (profile_id = (select auth.uid()));
create policy private_profile_owner_update on private.profile_private for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

create function private.validate_profile_location()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.display_name ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'Display name cannot contain control characters.';
  end if;
  if new.country_id is not null and not exists
    (select 1 from public.countries where id = new.country_id and enabled) then
    raise exception using errcode = '23514', message = 'Choose an enabled country.';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_profile_location() from public, anon, authenticated, service_role;
create trigger validate_profile_location before insert or update on public.profiles
  for each row execute function private.validate_profile_location();

create function public.public_profile(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'displayName', p.display_name, 'biography', p.biography,
    'createdAt', p.created_at, 'updatedAt', p.updated_at,
    'country', case when c.id is null then null else jsonb_build_object(
      'id', c.id, 'isoCode', c.iso_code, 'name', c.name) end,
    'city', case when city.id is null then null else jsonb_build_object(
      'id', city.id, 'countryId', city.country_id, 'name', city.name,
      'administrativeDivision', city.administrative_division,
      'admin1Code', city.admin1_code, 'admin2Code', city.admin2_code) end,
    'gameExperience', coalesce((select jsonb_agg(jsonb_build_object(
      'gameId', g.id, 'gameName', g.name, 'experience', x.experience_level) order by g.name, g.id)
      from public.user_game_experience x join public.games g on g.id = x.game_id
      where x.profile_id = p.id), '[]'::jsonb)
  ) from public.profiles p
  left join public.countries c on c.id = p.country_id
  left join public.cities city on city.id = p.city_id and city.country_id = p.country_id
  where p.id = p_user_id;
$$;
revoke all on function public.public_profile(uuid) from public, anon, authenticated, service_role;
grant execute on function public.public_profile(uuid) to anon, authenticated;

create function public.get_my_profile()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare profile jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  profile := public.public_profile(auth.uid());
  if profile is null then return null; end if;
  return profile || jsonb_build_object(
    'birthYear', (select birth_year from private.profile_private where profile_id = auth.uid()),
    'ageDeclaredAt', (select age_declared_at from private.profile_private where profile_id = auth.uid()));
end;
$$;
revoke all on function public.get_my_profile() from public, anon, authenticated, service_role;
grant execute on function public.get_my_profile() to authenticated;

create function public.update_my_profile(p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  account_id uuid := auth.uid();
  existing public.profiles%rowtype;
  new_name text;
  new_bio text;
  new_country integer;
  new_city integer;
  new_birth integer;
begin
  if account_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception using errcode = '22023', message = 'Provide a nonempty profile patch.';
  end if;
  if exists (select 1 from jsonb_object_keys(p_patch) key
    where key not in ('displayName', 'biography', 'countryId', 'cityId', 'birthYear')) then
    raise exception using errcode = '22023', message = 'Unexpected profile field.';
  end if;
  select * into existing from public.profiles where id = account_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Profile not found.'; end if;

  if p_patch ? 'displayName' and (jsonb_typeof(p_patch->'displayName') <> 'string'
    or char_length(btrim(p_patch->>'displayName')) not between 2 and 80
    or (p_patch->>'displayName') ~ '[[:cntrl:]]') then
    raise exception using errcode = '22023', message = 'Invalid display name.';
  end if;
  if p_patch ? 'biography' and jsonb_typeof(p_patch->'biography') not in ('string', 'null') then
    raise exception using errcode = '22023', message = 'Invalid biography.';
  end if;
  if char_length(p_patch->>'biography') > 500 then
    raise exception using errcode = '22023', message = 'Biography is too long.';
  end if;
  -- Check JSON number types before casting; strings/decimals/oversized values are invalid.
  if exists (select 1 from jsonb_each(p_patch) entry where entry.key in ('countryId','cityId','birthYear')
    and jsonb_typeof(entry.value) <> 'null' and
      (jsonb_typeof(entry.value) <> 'number' or entry.value::text !~ '^[0-9]+$'
       or length(entry.value::text) > 10)) then
    raise exception using errcode = '22023', message = 'Invalid numeric profile field.';
  end if;
  new_name := case when p_patch ? 'displayName' then btrim(p_patch->>'displayName') else existing.display_name end;
  new_bio := case when p_patch ? 'biography' then nullif(btrim(p_patch->>'biography'), '') else existing.biography end;
  new_country := case when p_patch ? 'countryId' then (p_patch->>'countryId')::integer else existing.country_id end;
  new_city := case when p_patch ? 'cityId' then (p_patch->>'cityId')::integer else existing.city_id end;
  if new_country is not null and (new_country < 1 or not exists
    (select 1 from public.countries where id = new_country and enabled)) then
    raise exception using errcode = '23514', message = 'Choose an enabled country.';
  end if;
  if new_city is not null and (new_country is null or not exists
    (select 1 from public.cities where id = new_city and country_id = new_country)) then
    raise exception using errcode = '23514', message = 'Choose a city in the selected country.';
  end if;
  if p_patch ? 'birthYear' then
    new_birth := (p_patch->>'birthYear')::integer;
    if new_birth is not null and (new_birth < 1900 or new_birth > extract(year from current_date)) then
      raise exception using errcode = '23514', message = 'Invalid birth year.';
    end if;
  end if;

  update public.profiles set display_name = new_name, biography = new_bio,
    country_id = new_country, city_id = new_city where id = account_id;
  if p_patch ? 'birthYear' then
    insert into private.profile_private (profile_id, birth_year, age_declared_at)
    values (account_id, new_birth, case when new_birth is null then null else now() end)
    on conflict (profile_id) do update set birth_year = excluded.birth_year,
      age_declared_at = excluded.age_declared_at;
  end if;
  return public.get_my_profile();
end;
$$;
revoke all on function public.update_my_profile(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.update_my_profile(jsonb) to authenticated;

comment on function public.public_profile(uuid) is 'Public-safe profile DTO only. No auth.users join, email, age, role or privileged metadata.';
comment on function public.update_my_profile(jsonb) is 'Atomic own-profile/private-birth-year update under caller RLS. No client-supplied account UUID.';

create function public.set_my_game_experience(p_game_id integer, p_experience text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare game_name text;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  if p_experience is null or p_experience not in ('beginner', 'intermediate', 'veteran') then
    raise exception using errcode = '22023', message = 'Choose a valid experience level.';
  end if;
  select name into game_name from public.games where id = p_game_id;
  if not found then raise exception using errcode = 'P0002', message = 'Game not found.'; end if;
  insert into public.user_game_experience (profile_id, game_id, experience_level)
  values (auth.uid(), p_game_id, p_experience)
  on conflict (profile_id, game_id) do update set experience_level = excluded.experience_level;
  return jsonb_build_object('gameId', p_game_id, 'gameName', game_name, 'experience', p_experience);
end;
$$;
revoke all on function public.set_my_game_experience(integer, text) from public, anon, authenticated, service_role;
grant execute on function public.set_my_game_experience(integer, text) to authenticated;

create function public.remove_my_game_experience(p_game_id integer)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  if not exists (select 1 from public.games where id = p_game_id) then
    raise exception using errcode = 'P0002', message = 'Game not found.';
  end if;
  delete from public.user_game_experience where profile_id = auth.uid() and game_id = p_game_id;
end;
$$;
revoke all on function public.remove_my_game_experience(integer) from public, anon, authenticated, service_role;
grant execute on function public.remove_my_game_experience(integer) to authenticated;
commit;
