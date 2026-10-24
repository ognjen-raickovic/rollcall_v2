-- Synthetic records below are transaction-local test fixtures, never imported source data.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
do $$
declare testing_function regprocedure;
begin
  for testing_function in
    select p.oid::regprocedure from pg_proc p
    join pg_depend d on d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
    join pg_extension e on e.oid = d.refobjid and e.extname = 'pgtap'
  loop
    execute format('grant execute on function %s to anon, authenticated', testing_function);
  end loop;
end;
$$;
select no_plan();

select has_table('public', 'city_aliases', 'aliases are relational records rather than duplicate cities');
select has_index('public', 'cities', 'cities_country_name_prefix_idx', 'canonical country/prefix index retained');
select has_index('public', 'cities', 'cities_country_suggestions_idx', 'population suggestions index retained');
select has_index('public', 'cities', 'cities_name_trigram_idx', 'canonical substring search has a trigram index');
select has_index('public', 'city_aliases', 'city_aliases_country_prefix_idx', 'aliases have a country/prefix index');
select has_index('public', 'city_aliases', 'city_aliases_name_trigram_idx', 'alias substring search has a trigram index');
select ok((select relrowsecurity from pg_class where oid = 'public.city_aliases'::regclass), 'aliases use RLS');
select ok(not has_table_privilege('anon', 'public.city_aliases', 'insert'), 'anonymous callers cannot import aliases');
select ok(not has_table_privilege('authenticated', 'public.city_aliases', 'update'), 'authenticated callers cannot edit aliases');
select ok(not (select prosecdef from pg_proc where oid = 'public.search_cities(text,text,integer)'::regprocedure), 'enhanced search preserves caller RLS');
select is(public.normalize_place_name('Čačak'), 'cacak', 'Latin diacritics normalize');
select is(public.normalize_place_name('НИКШИЋ'), 'niksic', 'Serbian Cyrillic normalizes to the same search key');
select is(public.normalize_place_name('Ђаково'), 'djakovo', 'Cyrillic Dj digraph is represented');
select is(public.normalize_place_name('Đakovo'), 'djakovo', 'Latin Dj spelling matches its Cyrillic equivalent');
select is(public.normalize_place_name('Љубљана'), 'ljubljana', 'Cyrillic Lj digraph is represented');

insert into public.cities(country_id, name, population, administrative_division, admin1_code,
  admin2_code, external_source, external_source_id)
select c.id, fixture.name, fixture.population, fixture.division, 'fixture-admin1', 'fixture-admin2',
  'rollcall-test-m2', fixture.source_id
from (values
  ('ME', 'RollCall Prefix fixture', 1::bigint, 'Test region A', 'prefix'),
  ('ME', 'Other RollCall fixture', 999999999999::bigint, 'Test region B', 'substring'),
  ('ME', 'Distinct canonical fixture', 2::bigint, 'Test region C', 'alias'),
  ('RS', 'RollCall Prefix fixture', 3::bigint, 'Test region RS', 'rs'),
  ('BA', 'RollCall Prefix fixture', 4::bigint, 'Test region BA', 'ba'),
  ('HR', 'RollCall Prefix fixture', 5::bigint, 'Test region HR', 'hr'),
  ('ME', 'RollCall Prefix fixture', 0::bigint, 'Test region D', 'same-name'),
  ('RS', 'Serbian alternate fixture', 0::bigint, 'Test region E', 'cyrillic'),
  ('ME', 'Literal %_ fixture', 0::bigint, 'Test region F', 'literal')
) fixture(iso_code, name, population, division, source_id)
join public.countries c on c.iso_code = fixture.iso_code;
insert into public.city_aliases(city_id, country_id, name, source)
select id, country_id, 'RollCall Alternative fixture', 'rollcall-test-m2' from public.cities
where external_source = 'rollcall-test-m2' and external_source_id = 'alias';
insert into public.city_aliases(city_id, country_id, name, source)
select id, country_id, 'Београдска проба', 'rollcall-test-m2' from public.cities
where external_source = 'rollcall-test-m2' and external_source_id = 'cyrillic';
insert into public.city_aliases(city_id, country_id, name, source)
select id, country_id, 'RollCall Prefix fixture spelling', 'rollcall-test-m2' from public.cities
where external_source = 'rollcall-test-m2' and external_source_id = 'prefix';

select throws_ok($$insert into public.city_aliases(city_id, country_id, name, source)
  select id, country_id, 'ROLLCALL ALTERNATIVE FIXTURE', 'rollcall-test-m2' from public.cities
  where external_source = 'rollcall-test-m2' and external_source_id = 'alias'$$,
  '23505', null, 'normalized aliases are unique within a city');
select throws_ok($$insert into public.city_aliases(city_id, country_id, name, source)
  select city.id, country.id, 'Mismatched country fixture', 'rollcall-test-m2' from public.cities city
  cross join public.countries country where city.external_source = 'rollcall-test-m2'
  and city.external_source_id = 'alias' and country.iso_code = 'RS'$$,
  '23503', null, 'aliases cannot refer to a country different from their city');

-- A country outside the supported rollout is not admitted even if manually enabled.
insert into public.countries(iso_code, name) values ('XY', 'Unsupported test country');
insert into public.cities(country_id, name)
select id, 'RollCall outside fixture' from public.countries where iso_code = 'XY';
insert into public.countries(iso_code, name, enabled) values ('ZZ', 'Disabled test country', false);
insert into public.cities(country_id, name)
select id, 'RollCall hidden fixture' from public.countries where iso_code = 'ZZ';
insert into public.city_aliases(city_id, country_id, name, source)
select id, country_id, 'RollCall hidden alias', 'rollcall-test-m2' from public.cities
where name = 'RollCall hidden fixture';

set local role anon;
select is((select external_source_id from public.search_cities('ME', 'RollCall', 1)), 'alias',
  'prefix aliases rank ahead of canonical prefixes by population and ahead of populous substrings');
select results_eq($$select external_source_id from public.search_cities('ME', 'RollCall', 4)$$,
  $$values ('alias'::text), ('prefix'::text), ('same-name'::text), ('substring'::text)$$,
  'all prefix matches precede substring matches and duplicate alias hits return one city');
select is((select external_source_id from public.search_cities('ME', 'Other RollCall fixture', 1)), 'substring',
  'an exact canonical match ranks first');
select is((select external_source_id from public.search_cities('RS', 'Beogradska proba', 1)), 'cyrillic',
  'Latin input searches a Cyrillic alias supplied by the source');
select is((select external_source_id from public.search_cities('RS', 'Београдска проба', 1)), 'cyrillic',
  'Cyrillic input searches the same alias');
select ok(not exists (select 1 from public.search_cities('ME', 'll', 20) result
  where result.normalized_name not like 'll%' and not exists
    (select 1 from public.city_aliases alias where alias.city_id = result.id and alias.normalized_name like 'll%')),
  'one/two-character queries match prefixes only');
select is((select external_source_id from public.search_cities('ME', 'Literal %_', 1)), 'literal',
  'percent and underscore remain literal input');
select is((select count(*)::integer from public.search_cities('ME', 'No matching RollCall place', 4)), 0,
  'unmatched query returns empty');
select is((select count(*)::integer from public.search_cities('XY', '', 4)), 0,
  'only the four supported countries are searchable');
select is((select count(*)::integer from public.search_cities('ZZ', '', 4)), 0,
  'disabled countries return empty');
select is((select count(*)::integer from public.city_aliases where name = 'RollCall hidden alias'), 0,
  'direct alias reads cannot bypass disabled-country RLS');
select is((select external_source_id from public.search_cities('ME', '', 1)), 'substring',
  'empty query favors the most populous available place');
select is((select count(*)::integer from public.search_cities('ME', 'RollCall')), 4,
  'unspecified limit returns a maximum of four suggestions');
select ok((select count(*) <= 20 from public.search_cities('ME', '', 20)), 'explicit result limits remain bounded');
select throws_ok($$select * from public.search_cities('ME', '', 21)$$, '22023',
  'Invalid city search parameters.', 'maximum query result limit is validated');
select throws_ok($$select * from public.search_cities('ME', 'bad' || chr(10) || 'query', 4)$$, '22023',
  'Invalid city search parameters.', 'control characters are rejected');
select throws_ok($$select * from public.search_cities('MNE', '', 4)$$, '22023',
  'Invalid city search parameters.', 'malformed country codes are rejected');
select ok((select bool_and(country_iso_code = 'ME' and country_name = 'Montenegro')
  from public.search_cities('ME', 'RollCall', 4)), 'country information accompanies suggestions');
select ok((select count(distinct administrative_division) >= 2
  from public.search_cities('ME', 'RollCall Prefix fixture', 4)), 'same-name places retain distinct administrative information');
select ok((select bool_and(admin1_code = 'fixture-admin1' and admin2_code = 'fixture-admin2')
  from public.search_cities('ME', 'RollCall', 4)), 'administrative codes accompany suggestions');
select is((select external_source_id from public.search_cities('RS', 'RollCall Prefix fixture', 1)), 'rs', 'Serbia is scoped');
select is((select external_source_id from public.search_cities('BA', 'RollCall Prefix fixture', 1)), 'ba', 'Bosnia and Herzegovina is scoped');
select is((select external_source_id from public.search_cities('HR', 'RollCall Prefix fixture', 1)), 'hr', 'Croatia is scoped');
select throws_ok($$delete from public.city_aliases$$, '42501', 'permission denied for table city_aliases',
  'source aliases cannot be removed by anonymous callers');
reset role;
select * from finish();
rollback;
