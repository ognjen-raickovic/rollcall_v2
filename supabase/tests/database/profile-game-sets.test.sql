-- Focused real-profile access tests. All fixtures and test-only pgTAP grants roll back.
begin;
\ir ../helpers/legacy-registration.inc
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
insert into auth.users(id,email,email_confirmed_at) values
 ('41000000-0000-4000-8000-000000000001','game-set-one@example.test',now()),
 ('41000000-0000-4000-8000-000000000002','game-set-two@example.test',now());
select ok(not (select prosecdef from pg_proc where oid='public.replace_my_game_experience(jsonb,jsonb)'::regprocedure),'Batch runs with caller RLS, not definer privileges');
select is((select proconfig::text from pg_proc where oid='public.replace_my_game_experience(jsonb,jsonb)'::regprocedure),'{"search_path=\"\""}','Batch has empty search path');
select ok(not has_function_privilege('anon','public.replace_my_game_experience(jsonb,jsonb)','execute'),'Anonymous has no batch grant');
select ok(not has_function_privilege('authenticated','private.lock_my_game_experience()','execute'),'Trigger function has no public callable grant');
select ok((select relrowsecurity from pg_class where oid='public.user_game_experience'::regclass),'Existing experience RLS remains enabled');
set local role anon;
select throws_ok($$select public.replace_my_game_experience('[]','[]')$$,'42501',null,'Anonymous batch rejected');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.replace_my_game_experience('[{"gameId":1,"experience":"beginner"},{"gameId":2,"experience":"veteran"}]','[]')$$,'Add a full game draft');
select is((select count(*)::integer from public.user_game_experience where profile_id=auth.uid()),2,'Both entries saved');
select throws_ok($$select public.replace_my_game_experience('[{"gameId":1,"experience":"veteran"}]','[]')$$,'PT409',null,'Stale expected set rejected');
select throws_ok($$select public.replace_my_game_experience('[{"gameId":1,"experience":"veteran"},{"gameId":1,"experience":"beginner"}]','[]')$$,'22023',null,'Duplicates rejected');
select throws_ok($$select public.replace_my_game_experience('[{"gameId":2147483647,"experience":"veteran"}]','[]')$$,'22023',null,'Noncatalog ID rejected');
select throws_ok($$select public.replace_my_game_experience('[{"gameId":1,"experience":"experienced"}]','[]')$$,'22023',null,'Event experience vocabulary rejected');
select throws_ok($$select public.replace_my_game_experience('[{"gameId":1,"experience":"beginner","profileId":"41000000-0000-4000-8000-000000000002"}]','[]')$$,'22023',null,'Client actor fields rejected');
select throws_ok($$select public.replace_my_game_experience('null','[]')$$,'22023',null,'Null set rejected');
select throws_ok($$select public.replace_my_game_experience((select jsonb_agg(jsonb_build_object('gameId',n,'experience','beginner')) from generate_series(1,51) n),'[]')$$,'22023',null,'Lists bounded before processing');
select is((select count(*)::integer from public.user_game_experience where profile_id=auth.uid()),2,'Invalid requests leave saved set unchanged');
select lives_ok($$select public.replace_my_game_experience('[{"gameId":2,"experience":"intermediate"}]','[{"gameId":2,"experience":"veteran"},{"gameId":1,"experience":"beginner"}]')$$,'Replace changes and removes together; expected order is irrelevant');
select is((public.public_profile(auth.uid())->'gameExperience'->0->>'experience'),'intermediate','Public profile reflects replacement');
select ok(not (public.public_profile(auth.uid()) ?| array['birthYear','dateOfBirth','email','role']),'Public projection remains private-data free');
select set_config('request.jwt.claims','{"sub":"41000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select lives_ok($$select public.replace_my_game_experience('[{"gameId":3,"experience":"veteran"}]','[]')$$,'Second owner can edit independently');
select throws_ok($$insert into public.user_game_experience(profile_id,game_id,experience_level) values('41000000-0000-4000-8000-000000000001',4,'beginner')$$,'42501',null,'Raw Data API cross-owner insert denied');
update public.user_game_experience set experience_level='beginner' where profile_id='41000000-0000-4000-8000-000000000001';
select is((public.public_profile('41000000-0000-4000-8000-000000000001')->'gameExperience'->0->>'experience'),'intermediate','Raw cross-owner update changes nothing');
reset role;
insert into private.account_suspensions(profile_id,status,suspended_at,suspended_by,suspension_reason) values
 ('41000000-0000-4000-8000-000000000002','suspended',now(),'41000000-0000-4000-8000-000000000001','Synthetic test restriction');
set local role authenticated;
select throws_ok($$select public.replace_my_game_experience('[]','[{"gameId":3,"experience":"veteran"}]')$$,'PT403','ACCOUNT_SUSPENDED','Old suspended token cannot use batch');
select throws_ok($$delete from public.user_game_experience where profile_id=auth.uid()$$,'PT403','ACCOUNT_SUSPENDED','Statement trigger also preserves raw suspension enforcement');
reset role;
select * from finish();
rollback;
