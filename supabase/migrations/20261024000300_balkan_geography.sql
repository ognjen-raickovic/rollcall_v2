-- Milestone 2A: preserve city identities while adding source metadata and indexed aliases.
begin;

create extension if not exists pg_trgm with schema extensions;

alter table public.cities
  add column ascii_name text check (ascii_name = btrim(ascii_name) and char_length(ascii_name) between 1 and 200),
  add column admin1_code text check (char_length(admin1_code) between 1 and 20),
  add column admin2_code text check (char_length(admin2_code) between 1 and 80),
  add column feature_code text check (char_length(feature_code) between 1 and 10),
  add column source_modified_at date;

-- STABLE, deliberately not IMMUTABLE: unaccent dictionaries can be updated. Search keys
-- are persisted by triggers; dictionary changes require an explicit key/index refresh.
create function public.normalize_place_name(value text)
returns text language plpgsql stable strict security invoker set search_path = '' as $$
declare
  normalized text;
begin
  if char_length(value) > 200 then
    raise exception using errcode = '22023', message = 'Place names must contain at most 200 characters.';
  end if;
  normalized := pg_catalog.lower(pg_catalog.btrim(value));
  -- Common Serbian/Montenegrin Latin spelling and Serbian Cyrillic transliteration.
  -- Other scripts remain searchable through aliases actually supplied by GeoNames.
  normalized := pg_catalog.replace(normalized, 'đ', 'dj');
  normalized := pg_catalog.replace(normalized, 'ђ', 'dj');
  normalized := pg_catalog.replace(normalized, 'љ', 'lj');
  normalized := pg_catalog.replace(normalized, 'њ', 'nj');
  normalized := pg_catalog.replace(normalized, 'џ', 'dz');
  normalized := pg_catalog.translate(normalized,
    'абвгдежзијклмнопрстћуфхцчш',
    'abvgdezzijklmnoprstcufhccs');
  return pg_catalog.regexp_replace(extensions.unaccent(normalized), '\s+', ' ', 'g');
end;
$$;
revoke all on function public.normalize_place_name(text) from public, anon, authenticated, service_role;
grant execute on function public.normalize_place_name(text) to anon, authenticated;

create or replace function private.normalize_city_name()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.normalized_name := public.normalize_place_name(new.name);
  return new;
end;
$$;
-- Recompute existing keys in place, without replacing IDs or affecting foreign keys.
update public.cities set normalized_name = public.normalize_place_name(name);

create table public.city_aliases (
  city_id integer not null,
  country_id integer not null,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 200),
  normalized_name text collate "C" not null check (char_length(normalized_name) between 1 and 400),
  source text not null default 'geonames' check (char_length(source) between 1 and 50),
  primary key (city_id, normalized_name),
  foreign key (city_id, country_id) references public.cities(id, country_id) on delete cascade
);

create function private.normalize_city_alias()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.normalized_name := public.normalize_place_name(new.name);
  return new;
end;
$$;
create trigger normalize_city_alias before insert or update of name, normalized_name
  on public.city_aliases for each row execute function private.normalize_city_alias();
revoke all on function private.normalize_city_alias() from public, anon, authenticated, service_role;

create index city_aliases_country_prefix_idx
  on public.city_aliases(country_id, normalized_name text_pattern_ops);
create index city_aliases_name_trigram_idx
  on public.city_aliases using gin(normalized_name extensions.gin_trgm_ops);
create index cities_name_trigram_idx
  on public.cities using gin(normalized_name extensions.gin_trgm_ops);

alter table public.city_aliases enable row level security;
revoke all on public.city_aliases from public, anon, authenticated, service_role;
grant select on public.city_aliases to anon, authenticated;
create policy city_aliases_enabled_country_read on public.city_aliases for select to anon, authenticated
  using (exists (select 1 from public.countries c where c.id = country_id and c.enabled));

-- A changed TABLE return type requires recreating the function. Original fields and
-- call arguments stay intact; new country/region columns are additive.
drop function public.search_cities(text, text, integer);
create function public.search_cities(
  country_code text,
  search_query text default '',
  result_limit integer default 4
)
returns table (
  id integer,
  country_id integer,
  name text,
  normalized_name text,
  administrative_division text,
  latitude numeric,
  longitude numeric,
  population bigint,
  external_source_id text,
  country_iso_code text,
  country_name text,
  admin1_code text,
  admin2_code text
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  selected_country_id integer;
  normalized_query text;
  literal_query text;
begin
  if country_code is null or country_code !~ '^[A-Z]{2}$'
    or search_query is null or char_length(search_query) > 80
    or search_query ~ '[[:cntrl:]]'
    or result_limit is null or result_limit not between 1 and 20 then
    raise exception using errcode = '22023', message = 'Invalid city search parameters.';
  end if;
  select country.id into selected_country_id from public.countries country
    where country.iso_code = country_code and country.enabled
      and country.iso_code in ('ME', 'RS', 'BA', 'HR');
  if selected_country_id is null then return; end if;

  normalized_query := public.normalize_place_name(search_query);
  if normalized_query = '' then
    return query
      select c.id, c.country_id, c.name, c.normalized_name, c.administrative_division,
        c.latitude, c.longitude, c.population, c.external_source_id,
        country.iso_code, country.name, c.admin1_code, c.admin2_code
      from public.cities c join public.countries country on country.id = c.country_id
      where c.country_id = selected_country_id
      order by c.population desc nulls last, c.normalized_name, c.id
      limit result_limit;
    return;
  end if;

  -- Input remains literal SQL data. Dynamic execution uses bound parameters and ensures
  -- the planner sees each prefix, rather than eventually choosing a generic LIKE plan.
  literal_query := pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(normalized_query,
    E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');
  return query execute $search$
    with matches as (
      select c.id, case when c.normalized_name = $4 then 0 else 1 end as match_rank
      from public.cities c
      where c.country_id = $1 and c.normalized_name like $2 escape E'\\'
      union all
      select a.city_id, case when a.normalized_name = $4 then 0 else 1 end
      from public.city_aliases a
      where a.country_id = $1 and a.normalized_name like $2 escape E'\\'
      union all
      select c.id, 2 from public.cities c
      where char_length($4) >= 3 and c.country_id = $1
        and c.normalized_name like $3 escape E'\\'
        and c.normalized_name not like $2 escape E'\\'
      union all
      select a.city_id, 2 from public.city_aliases a
      where char_length($4) >= 3 and a.country_id = $1
        and a.normalized_name like $3 escape E'\\'
        and a.normalized_name not like $2 escape E'\\'
    ), ranked as (
      select matches.id, min(matches.match_rank) as match_rank from matches group by matches.id
    )
    select c.id, c.country_id, c.name, c.normalized_name, c.administrative_division,
      c.latitude, c.longitude, c.population, c.external_source_id,
      country.iso_code, country.name, c.admin1_code, c.admin2_code
    from ranked join public.cities c on c.id = ranked.id
    join public.countries country on country.id = c.country_id
    order by ranked.match_rank, c.population desc nulls last, c.normalized_name, c.id
    limit $5
  $search$ using selected_country_id, literal_query || '%', '%' || literal_query || '%', normalized_query, result_limit;
end;
$$;
revoke all on function public.search_cities(text, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.search_cities(text, text, integer) to anon, authenticated;

comment on table public.city_aliases is 'GeoNames source aliases, not additional places. Normalized per-city uniqueness prevents duplicate suggestions; source scripts/languages are retained in name.';
comment on function public.normalize_place_name(text) is 'Stable persisted-key normalizer: lowercase/unaccent plus Serbian Cyrillic and common Dj transliteration. Refresh stored keys/indexes explicitly after dictionary changes.';
comment on function public.search_cities(text, text, integer) is 'RLS-preserving parameterized country search. Exact/prefix before substring; one/two characters use prefix only. Population-ranked empty suggestions. Default4, maximum20.';

commit;
