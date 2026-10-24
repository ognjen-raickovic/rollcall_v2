begin;

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
  external_source_id text
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  search_prefix text;
begin
  if country_code is null or country_code !~ '^[A-Z]{2}$'
    or search_query is null or char_length(search_query) > 80
    or search_query ~ '[[:cntrl:]]'
    or result_limit is null or result_limit not between 1 and 20 then
    raise exception using errcode = '22023', message = 'Invalid city search parameters.';
  end if;
  search_prefix := pg_catalog.lower(extensions.unaccent(pg_catalog.btrim(search_query)));
  -- User input is literal; percent, underscore and backslash are not wildcards.
  search_prefix := pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(search_prefix,
    E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
  return query
    select c.id, c.country_id, c.name, c.normalized_name, c.administrative_division,
      c.latitude, c.longitude, c.population, c.external_source_id
    from public.cities c
    join public.countries country on country.id = c.country_id
    where country.iso_code = country_code and country.enabled
      and c.normalized_name like search_prefix escape E'\\'
    order by c.population desc nulls last, c.normalized_name, c.id
    limit result_limit;
end;
$$;
revoke all on function public.search_cities(text, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.search_cities(text, text, integer) to anon, authenticated;
comment on function public.search_cities(text, text, integer) is 'RLS-preserving country-scoped, literal prefix search. Accent/case tolerant; not fuzzy transliteration or a comprehensive dataset.';

-- Supported countries are relational catalog rows, not a frontend country enum.
insert into public.countries(iso_code, name) values
  ('ME', 'Montenegro'), ('RS', 'Serbia'), ('BA', 'Bosnia and Herzegovina'), ('HR', 'Croatia');
commit;
