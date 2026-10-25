-- Registration creates only a minimal UUID-linked profile; no onboarding or access grants.
-- All fixtures are rolled back, including auth.users records.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_trigger('auth', 'users', 'initialize_rollcall_profile',
  'Auth registrations initialize a RollCall profile');
select ok((select prosecdef from pg_proc
  where oid = 'private.initialize_auth_profile()'::regprocedure),
  'initialization has a narrow privileged trigger function');
select ok((select proconfig @> array['search_path=""'] from pg_proc
  where oid = 'private.initialize_auth_profile()'::regprocedure),
  'initialization uses an empty search path');
select ok(not has_function_privilege('anon', 'private.initialize_auth_profile()', 'execute'),
  'anonymous callers cannot invoke initialization');
select ok(not has_function_privilege('authenticated', 'private.initialize_auth_profile()', 'execute'),
  'authenticated callers cannot invoke initialization');
select ok(not has_function_privilege('service_role', 'private.initialize_auth_profile()', 'execute'),
  'initialization does not add a service-role entry point');

insert into auth.users (id, email, raw_user_meta_data) values
  ('30000000-0000-4000-8000-000000000001', 'private-auth-fixture@example.invalid',
   '{"display_name":"Untrusted name","role":"superadmin","country_id":999999}'::jsonb),
  ('30000000-0000-4000-8000-000000000002', null, null);

select is((select count(*)::integer from public.profiles
  where id in ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002')),
  2, 'each Auth UUID receives exactly one profile even without email or metadata');
select is((select display_name from public.profiles
  where id = '30000000-0000-4000-8000-000000000001'), 'RollCall player',
  'the display name is a fixed safe placeholder, not email or editable metadata');
select ok((select country_id is null and city_id is null and biography is null
  from public.profiles where id = '30000000-0000-4000-8000-000000000001'),
  'registration leaves onboarding selections unset');
select is((select count(*)::integer from private.account_roles
  where profile_id = '30000000-0000-4000-8000-000000000001'), 0,
  'client metadata cannot promote the new account');
select is((select count(*)::integer from private.profile_private
  where profile_id = '30000000-0000-4000-8000-000000000001'), 0,
  'registration does not initialize private age details');

update public.profiles set display_name = 'Preserved fixture'
  where id = '30000000-0000-4000-8000-000000000001';
-- Repeating the migration backfill must leave existing profile values intact.
insert into public.profiles (id, display_name)
select id, 'RollCall player' from auth.users
on conflict (id) do nothing;
select is((select display_name from public.profiles
  where id = '30000000-0000-4000-8000-000000000001'), 'Preserved fixture',
  'the backfill is idempotent and preserves previously entered data');

select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profile RLS remains enabled');
select ok(not has_table_privilege('anon', 'public.profiles', 'select'),
  'profiles are not exposed anonymously');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'select'),
  'registration does not prematurely expose profile reads');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'insert'),
  'clients cannot choose a profile identity');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'update'),
  'profile editing remains deferred');
select ok(not has_table_privilege('authenticated', 'private.account_roles', 'update'),
  'role-management restrictions remain intact');

delete from auth.users where id = '30000000-0000-4000-8000-000000000002';
select is((select count(*)::integer from public.profiles
  where id = '30000000-0000-4000-8000-000000000002'), 0,
  'deleting an unused Auth account cascades its minimal profile');

select * from finish();
rollback;
