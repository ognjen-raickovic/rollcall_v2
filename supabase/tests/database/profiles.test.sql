-- Focused real-profile access tests. All fixtures and test-only pgTAP grants roll back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
do $$
declare testing_function regprocedure;
begin
  for testing_function in select p.oid::regprocedure from pg_proc p
    join pg_depend d on d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e'
    join pg_extension e on e.oid=d.refobjid and e.extname='pgtap'
  loop execute format('grant execute on function %s to anon, authenticated', testing_function); end loop;
end;
$$;
select no_plan();
insert into auth.users(id, email) values
  ('40000000-0000-4000-8000-000000000001','profiles-one@example.invalid'),
  ('40000000-0000-4000-8000-000000000002','profiles-two@example.invalid');
-- Protected actions below simulate confirmed Auth sessions.
update auth.users set email_confirmed_at=now() where id in ('40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002');
insert into public.countries(iso_code,name,enabled) values ('ZZ','Disabled profile fixture',false);

select ok(not (select prosecdef from pg_proc where oid='public.update_my_profile(jsonb)'::regprocedure),
  'profile mutation retains caller RLS');
select ok(not (select prosecdef from pg_proc where oid='public.get_my_profile()'::regprocedure),
  'private reads retain caller RLS');
select ok(not has_column_privilege('authenticated','public.profiles','id','update'), 'profile UUID cannot be changed');
select ok(not has_column_privilege('authenticated','public.profiles','created_at','update'), 'creation date cannot be changed');
select ok(not has_column_privilege('authenticated','public.profiles','updated_at','update'), 'update timestamp is server managed');
select ok(not has_table_privilege('authenticated','private.account_roles','select,insert,update,delete'), 'account roles stay unavailable');
select ok(not has_table_privilege('authenticated','private.event_locations','select'), 'private event addresses stay unavailable');

set local role anon;
select ok(public.public_profile('40000000-0000-4000-8000-000000000001') is not null, 'safe profile is publicly readable');
select throws_ok('select public.get_my_profile()', '42501', null, 'anonymous callers cannot read private profile');
select throws_ok($$select public.update_my_profile('{"displayName":"Intruder"}')$$, '42501', null, 'anonymous callers cannot update profiles');
select throws_ok('select * from private.profile_private', '42501', null, 'anonymous age access is denied');
reset role;

select set_config('request.jwt.claims','{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is(public.get_my_profile()->>'id','40000000-0000-4000-8000-000000000001', 'own-profile identity comes from auth.uid');
select is(public.get_my_profile()->'birthYear','null'::jsonb, 'new account starts with unset private age');
select lives_ok($$select public.update_my_profile('{"displayName":"Profile player","biography":"Friendly tabletop player","birthYear":1995}')$$,
  'owner can atomically save profile and private birth year');
select is(public.get_my_profile()->>'displayName','Profile player', 'display name saved');
select is(public.get_my_profile()->>'birthYear','1995','private birth year saved');
select ok(public.get_my_profile()->>'ageDeclaredAt' is not null,'self-declaration timestamp is assigned');
select ok(not (public.public_profile('40000000-0000-4000-8000-000000000001') ?| array['birthYear','ageDeclaredAt','email','role']),
  'public DTO contains no age, email or role');
select throws_ok($$select public.update_my_profile('{"id":"40000000-0000-4000-8000-000000000002","displayName":"Intruder"}')$$,
  '22023', null, 'RPC rejects a client identity');
select throws_ok($$select public.update_my_profile('{"role":"superadmin"}')$$, '22023', null, 'RPC rejects role escalation');
select throws_ok($$update public.profiles set id='40000000-0000-4000-8000-000000000002'
  where id='40000000-0000-4000-8000-000000000001'$$, '42501', null, 'direct UUID mutation is denied');
select throws_ok($$update public.profiles set created_at=now() where id='40000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'direct creation timestamp mutation is denied');
update public.profiles set display_name='Cross-user change' where id='40000000-0000-4000-8000-000000000002';
select is(public.public_profile('40000000-0000-4000-8000-000000000002')->>'displayName','RollCall player',
  'cross-user table update changes zero rows');
select throws_ok($$update public.profiles set country_id=(select id from public.countries where iso_code='ME'),
  city_id=(select id from public.cities where country_id=(select id from public.countries where iso_code='RS') limit 1)
  where id='40000000-0000-4000-8000-000000000001'$$,'23503',null,'direct city/country mismatch is denied');
-- The disabled ID is fetched as test owner below because country RLS deliberately hides it.
reset role;
select set_config('test.disabled_country',(select id::text from public.countries where iso_code='ZZ'),true);
set local role authenticated;
select throws_ok(format('update public.profiles set country_id=%s where id=%L',current_setting('test.disabled_country'),'40000000-0000-4000-8000-000000000001'),
  '23514', null, 'direct disabled country selection is denied');
select throws_ok($$select public.update_my_profile('{"displayName":"Should roll back","birthYear":3000}')$$,
  '23514', null, 'invalid private age rejects entire operation');
select is(public.get_my_profile()->>'displayName','Profile player','failed private update preserves public data');
select is((select count(*)::integer from private.profile_private),1,'private RLS shows only the owner row');
select lives_ok($$select public.set_my_game_experience((select id from public.games where name='Dungeons & Dragons'),'veteran')$$,
  'owner can add game experience');
select lives_ok($$select public.set_my_game_experience((select id from public.games where name='Dungeons & Dragons'),'beginner')$$,
  'owner can change experience without duplicate');
select is((select count(*)::integer from public.user_game_experience where profile_id='40000000-0000-4000-8000-000000000001'),1,
  'game association remains unique');
select is(public.public_profile('40000000-0000-4000-8000-000000000001')->'gameExperience'->0->>'experience','beginner',
  'self-declared experience is visible publicly');
select throws_ok('select public.set_my_game_experience(2147483647,''beginner'')','P0002',null,'unknown game rejected');
select throws_ok($$select public.set_my_game_experience((select id from public.games limit 1),'verified')$$,'22023',null,'invalid experience rejected');
select throws_ok($$insert into public.user_game_experience(profile_id,game_id,experience_level)
  select '40000000-0000-4000-8000-000000000002',id,'veteran' from public.games limit 1$$,
  '42501',null,'cross-user game insertion denied');
select lives_ok($$select public.remove_my_game_experience((select id from public.games where name='Dungeons & Dragons'))$$,
  'owner can remove experience');
select lives_ok($$select public.remove_my_game_experience((select id from public.games where name='Dungeons & Dragons'))$$,
  'removal is idempotent');
select lives_ok($$select public.update_my_profile('{"birthYear":null}')$$,'owner can remove private age');
select is(public.get_my_profile()->'ageDeclaredAt','null'::jsonb,'removing age clears declaration timestamp');
reset role;
select set_config('request.jwt.claims','{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is(public.get_my_profile()->'birthYear','null'::jsonb,'second account cannot obtain first private age through RPC');
select is((select count(*)::integer from private.profile_private),0,'second account cannot read first private age table row');
update private.profile_private set birth_year=2000, age_declared_at=now()
  where profile_id='40000000-0000-4000-8000-000000000001';
reset role;
select is((select birth_year from private.profile_private where profile_id='40000000-0000-4000-8000-000000000001'),
  null::smallint,'cross-user private birth-year update changes zero rows');
select * from finish();
rollback;
