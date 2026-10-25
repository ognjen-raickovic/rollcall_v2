-- Run against the migrated LOCAL Supabase database: pnpm db:test.
-- Transaction rolls back all fixtures and temporary testing grants.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
-- Test-only grants, restricted to pgTAP rather than unrelated extension functions.
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

select has_table('public', 'countries', 'countries table exists');
select has_table('public', 'cities', 'cities table exists');
select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'games', 'games table exists');
select has_table('public', 'user_game_experience', 'user/game experience table exists');
select has_table('public', 'events', 'events table exists');
select has_table('public', 'event_participants', 'participation table exists');
select has_table('private', 'profile_private', 'private age table exists');
select has_table('private', 'account_roles', 'private role assignments exist');
select has_table('private', 'event_locations', 'private addresses table exists');
select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private') and c.relname in
  ('countries', 'cities', 'profiles', 'games', 'user_game_experience', 'events',
   'event_participants', 'profile_private', 'account_roles', 'event_locations')
  and c.relrowsecurity), 10, 'RLS enabled on every application table');
select ok(has_schema_privilege('anon', 'private', 'usage'), 'anon can name only explicitly executable event wrappers in the unexposed private schema');
select ok(has_schema_privilege('authenticated', 'private', 'usage'), 'private invoker age functions have narrow authenticated schema usage');
select ok(not has_table_privilege('anon', 'public.events', 'select'), 'no public event table read yet');
select ok(not has_table_privilege('authenticated', 'public.events', 'insert'), 'no client event writes yet');
select ok(not has_table_privilege('authenticated', 'private.account_roles', 'update'), 'clients cannot promote themselves');
select ok(not has_table_privilege('anon', 'private.profile_private', 'select'), 'private age is inaccessible');
select ok(not has_table_privilege('anon', 'private.event_locations', 'select'), 'exact addresses are inaccessible');
select ok(not exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'events' and column_name = 'address'), 'public event rows contain no address');
select ok(not (select prosecdef from pg_proc where oid = 'public.search_cities(text,text,integer)'::regprocedure), 'city RPC preserves caller RLS');

-- A disabled country is hidden even if addressed directly through the Data API.
insert into public.countries(iso_code, name, enabled) values ('ZZ', 'Disabled test fixture', false);
insert into public.cities(country_id, name) select id, 'Hidden fixture' from public.countries where iso_code = 'ZZ';
create temporary table expected_visible_city_count as
  select count(*)::integer as value from public.cities city
  join public.countries country on country.id = city.country_id where country.enabled;
grant select on expected_visible_city_count to anon;
set local role anon;
select is((select count(*)::integer from public.countries), 4, 'anonymous callers see the four enabled countries');
select is((select count(*)::integer from public.cities),
  (select value from expected_visible_city_count), 'anonymous callers see only enabled-country cities regardless of import size');
select ok(exists (select 1 from public.search_cities('RS', 'Cacak', 4) where normalized_name = 'cacak'),
  'ASCII city search matches diacritics');
select ok(exists (select 1 from public.search_cities('ME', 'NIKSIC', 4) where normalized_name = 'niksic'),
  'search ignores case and accents');
select is((select count(*)::integer from public.search_cities('HR', '', 2)), 2, 'limit controls suggestions');
select ok(not exists (select 1 from public.search_cities('ME', 'Čačak', 4) where country_iso_code <> 'ME'),
  'country scope cannot leak another country');
select is((select count(*)::integer from public.search_cities('ME', '%', 4)), 0, 'percent is literal rather than a search wildcard');
select is((select count(*)::integer from public.search_cities('ME', '_', 4)), 0, 'underscore is literal rather than a search wildcard');
select is((select count(*)::integer from public.search_cities('ZZ', '', 4)), 0, 'disabled country returns no cities');
select is((select count(*)::integer from public.search_cities('US', '', 4)), 0, 'unknown country returns an empty result');
select throws_ok($$select * from public.search_cities('ME', '', 21)$$, '22023', 'Invalid city search parameters.', 'database enforces maximum limit');
select throws_ok($$select * from public.search_cities('ME', repeat('x', 81), 4)$$, '22023', 'Invalid city search parameters.', 'database bounds query length');
select throws_ok($$select * from public.events$$, '42501', 'permission denied for table events', 'raw event table remains unavailable to anon');
select throws_ok($$insert into public.countries(iso_code, name) values ('XX', 'Unauthorized')$$,
  '42501', 'permission denied for table countries', 'anonymous clients cannot write geography');
reset role;

-- Real UUID-shaped Auth relationships, not converted frontend demo users.
insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000003');
insert into public.profiles(id, display_name) values
  ('00000000-0000-4000-8000-000000000001', 'Host fixture'),
  ('00000000-0000-4000-8000-000000000002', 'Player one fixture'),
  ('00000000-0000-4000-8000-000000000003', 'Player two fixture')
  on conflict (id) do update set display_name = excluded.display_name;
select throws_ok($$insert into public.profiles(id, display_name) values
  ('00000000-0000-4000-8000-000000000004', 'Missing Auth user')$$,
  '23503', null, 'profiles require an existing Supabase Auth UUID');
select throws_ok($$update public.profiles set country_id = (select id from public.countries where iso_code = 'ME'),
  city_id = (select id from public.cities where name = 'Sarajevo' order by population desc nulls last, id limit 1) where display_name = 'Host fixture'$$,
  '23503', null, 'profile city must belong to its selected country');
select throws_ok($$insert into private.profile_private(profile_id, birth_year, age_declared_at) values
  ('00000000-0000-4000-8000-000000000001', extract(year from current_date)::integer + 1, now())$$,
  '23514', 'Birth year cannot be in the future.', 'self-declared age cannot use a future birth year');
insert into public.user_game_experience(profile_id, game_id, experience_level)
  select '00000000-0000-4000-8000-000000000002', id,
    case when name = 'Dungeons & Dragons' then 'veteran' else 'beginner' end
  from public.games where name in ('Dungeons & Dragons', 'Magic: The Gathering');
select is((select count(distinct experience_level)::integer from public.user_game_experience), 2,
  'experience is independent for each user/game pair');
select throws_ok($$insert into public.user_game_experience(profile_id, game_id, experience_level)
  select '00000000-0000-4000-8000-000000000002', id, 'verified'
  from public.games where name = 'Catan'$$, '23514', null, 'experience accepts only self-declared catalog values');

insert into public.events(id, host_id, game_id, city_id, title, description, starts_at, ends_at,
  capacity, experience_level, visibility, tags)
select '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
  (select id from public.games where name = 'Dungeons & Dragons'),
  (select id from public.cities where name = 'Podgorica' order by population desc nulls last, id limit 1),
  'One seat fixture', 'A development-only event used to verify seat invariants.',
  now() + interval '1 day', now() + interval '1 day 3 hours', 1, 'all-levels', 'private', array['Casual'];
insert into private.event_locations(event_id, address) values
  ('10000000-0000-4000-8000-000000000001', 'Private test address');
set constraints events_require_location immediate;
select throws_ok($$insert into public.events(host_id, game_id, city_id, title, description,
  starts_at, ends_at, capacity, experience_level)
  select host_id, game_id, city_id, 'Missing address fixture', description,
    starts_at, ends_at, capacity, experience_level from public.events where title = 'One seat fixture'$$,
  '23514', 'An in-person event requires a private address record.', 'events require a private location in the creation transaction');
select is((select share_publicly from private.event_locations where event_id = '10000000-0000-4000-8000-000000000001'),
  false, 'exact addresses are private by default');
select is((select venue from public.events where id = '10000000-0000-4000-8000-000000000001'),
  null::text, 'venue is optional in the database model');
select throws_ok($$update public.events set capacity = 0 where title = 'One seat fixture'$$,
  '23514', null, 'capacity must be positive');
select throws_ok($$update public.events set price = 1.999 where title = 'One seat fixture'$$,
  '23514', null, 'price does not silently round excessive precision');
select throws_ok($$update public.events set tags = array['Veterans only'] where title = 'One seat fixture'$$,
  '23514', null, 'experience compatibility is enforced for tags');
select throws_ok($$update public.events set tags = array['Casual', 'Casual'] where title = 'One seat fixture'$$,
  '23514', null, 'duplicate tags are rejected');
select throws_ok($$update public.events set starts_at = now() - interval '1 day' where title = 'One seat fixture'$$,
  '23514', 'Event start must be in the future.', 'event changes require future starts');
select throws_ok($$update public.events set host_id = '00000000-0000-4000-8000-000000000002' where title = 'One seat fixture'$$,
  '23514', 'Event identity and host are immutable.', 'event host identity cannot be reassigned');
select throws_ok($$insert into public.event_participants(event_id, profile_id) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001')$$,
  '23514', 'Event is full, unavailable, or the participant is its host.', 'hosts do not consume player seats');
insert into public.event_participants(event_id, profile_id) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');
select is((select participant_count from public.events where title = 'One seat fixture'), 1, 'membership consumes one seat');
insert into public.event_participants(event_id, profile_id) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002')
  on conflict do nothing;
select is((select participant_count from public.events where title = 'One seat fixture'), 1, 'duplicate no-op does not consume another seat');
select throws_ok($$insert into public.event_participants(event_id, profile_id) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003')$$,
  '23514', 'Event is full, unavailable, or the participant is its host.', 'full event rejects another participant');
select is((select count(*)::integer from public.event_participants where event_id = '10000000-0000-4000-8000-000000000001'),
  1, 'failed joins do not leave membership behind');
update public.events set capacity = 2 where title = 'One seat fixture';
insert into public.event_participants(event_id, profile_id) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003');
select throws_ok($$update public.events set capacity = 1 where title = 'One seat fixture'$$,
  '23514', null, 'positive capacity still cannot be reduced below attendance');
delete from public.event_participants where event_id = '10000000-0000-4000-8000-000000000001';
select is((select participant_count from public.events where title = 'One seat fixture'), 0, 'leaving restores the seat');
update public.events set capacity = 1 where title = 'One seat fixture';
insert into public.event_participants(event_id, profile_id) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003');
select throws_ok($$update public.events set capacity = 0 where title = 'One seat fixture'$$,
  '23514', null, 'capacity edits cannot invalidate attendance');
update public.events set status = 'cancelled' where title = 'One seat fixture';
select throws_ok($$delete from public.event_participants where event_id = '10000000-0000-4000-8000-000000000001'$$,
  '23514', 'Attendance can only change before a scheduled event starts.', 'cancelled events preserve attendance');
select lives_ok($$delete from public.events where title = 'One seat fixture'$$, 'removing an event cascades attendance and address even when cancelled');
select is((select count(*)::integer from private.event_locations), 0, 'event removal removes its private location');

select * from finish();
rollback;
