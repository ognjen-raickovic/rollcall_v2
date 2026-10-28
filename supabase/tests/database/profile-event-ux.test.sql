-- Focused real-profile access tests. All fixtures and test-only pgTAP grants roll back.
begin;
\ir ../helpers/legacy-registration.inc
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
-- Test-only membership permits inspecting the closed role's RLS; rollback removes it.
grant rollcall_age_executor to current_user;
grant usage on schema extensions to rollcall_age_executor;
do $$
declare testing_function regprocedure;
begin
  for testing_function in select p.oid::regprocedure from pg_proc p
    join pg_depend d on d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e'
    join pg_extension e on e.oid=d.refobjid and e.extname='pgtap'
  loop execute format('grant execute on function %s to anon, authenticated, rollcall_age_executor', testing_function); end loop;
end;
$$;
select no_plan();
insert into auth.users(id,email,email_confirmed_at) values
 ('42000000-0000-4000-8000-000000000001','ux-host@example.test',now()),
 ('42000000-0000-4000-8000-000000000002','ux-player@example.test',now()),
 ('42000000-0000-4000-8000-000000000003','ux-legacy@example.test',now()),
 ('42000000-0000-4000-8000-000000000004','ux-leap@example.test',now());
update public.profiles set username='ognjen3211',display_name='Ognjen3211' where id='42000000-0000-4000-8000-000000000002';
insert into private.profile_private(profile_id,date_of_birth,birth_year,age_declared_at) values
 ('42000000-0000-4000-8000-000000000002','2017-01-01',2017,now()),
 ('42000000-0000-4000-8000-000000000004','2016-02-29',2016,now());
insert into public.events(id,host_id,game_id,city_id,title,description,starts_at,ends_at,capacity,minimum_age,experience_level,tags,visibility)
select ('e2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'42000000-0000-4000-8000-000000000001',1,
 (select city.id from public.cities city join public.countries c on c.id=city.country_id where c.iso_code='ME' order by city.id limit 1),
 'UX test table '||n,'A synthetic event for private age eligibility and event rule tests.',
 case n when 2 then '2031-12-30T23:30:00Z'::timestamptz when 4 then '2031-02-27T23:30:00Z'::timestamptz else '2031-12-31T23:30:00Z'::timestamptz end,
 '2032-01-02T00:00:00Z',4,case when n=3 then 0 else 15 end,'all-levels','{}',case when n=5 then 'private' else 'public' end
from generate_series(1,5) n;
insert into private.event_locations(event_id,address) select id,'Private synthetic location' from public.events where id::text like 'e2000000%';
select ok(not has_column_privilege('authenticated','public.profiles','username','update'),'No direct handle-edit grant');
select ok(not pg_has_role('authenticated','rollcall_username_executor','member'),'No username executor membership');
select ok(not pg_has_role('authenticated','rollcall_age_executor','member'),'No age executor membership');
select ok(not has_function_privilege('authenticated','private.assert_event_age(uuid,integer,timestamptz,text)','execute'),'Age helper is not directly callable');
select ok(not has_column_privilege('rollcall_events_executor','private.profile_private','date_of_birth','select'),'Events executor gains no DOB access');
select ok(not has_column_privilege('rollcall_invitation_executor','private.profile_private','date_of_birth','select'),'Invitation executor gains no DOB access');
select ok(not has_column_privilege('anon','private.profile_private','date_of_birth','select'),'Anonymous cannot read private DOB');
select ok(not has_table_privilege('rollcall_username_executor','private.account_roles','update'),'Case executor cannot alter roles');
select set_config('request.jwt.claims','{"sub":"42000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role rollcall_age_executor;
select is((select count(*)::integer from private.profile_private),1,'Age executor RLS sees only its current owner');
select is((select count(*)::integer from private.profile_private where profile_id='42000000-0000-4000-8000-000000000004'),0,'Age executor cannot read another account DOB');
reset role;
set local role anon;
select throws_ok($$select public.correct_my_username_case('Ognjen3211','ognjen3211')$$,'42501',null,'Anonymous cannot correct casing');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"42000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::integer from private.profile_private where profile_id='42000000-0000-4000-8000-000000000004'),0,'Existing authenticated owner RLS hides another account DOB');
select is(public.correct_my_username_case('Ognjen3211','ognjen3211')->>'username','Ognjen3211','Owner can correct exact casing');
select is(public.get_my_profile()->>'id','42000000-0000-4000-8000-000000000002','Permanent UUID unchanged');
select throws_ok($$select public.correct_my_username_case('SomeoneElse','Ognjen3211')$$,'22023',null,'Arbitrary renames rejected');
select throws_ok($$select public.correct_my_username_case('OGNJEN3211','ognjen3211')$$,'PT409',null,'Stale casing snapshot conflicts');
select throws_ok($$update public.profiles set username='hijack' where id=auth.uid()$$,'42501',null,'Raw username update remains denied');
select throws_ok($$select public.join_event('e2000000-0000-4000-8000-000000000002')$$,'RA004',null,'Day before local birthday cannot join');
select lives_ok($$select public.join_event('e2000000-0000-4000-8000-000000000001')$$,'Birthday at local midnight is eligible even before UTC midnight');
select is((public.get_event('e2000000-0000-4000-8000-000000000001')->>'participantCount')::integer,1,'Admission increments once');
reset role;
update public.events set minimum_age=18,starts_at='2032-03-01T12:00:00Z',ends_at='2032-03-01T14:00:00Z' where id='e2000000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok($$select public.join_event('e2000000-0000-4000-8000-000000000001')$$,'Existing seat is grandfathered after age/reschedule change');
select lives_ok($$select public.leave_event('e2000000-0000-4000-8000-000000000001')$$,'Existing participant can leave normally');
select throws_ok($$select public.join_event('e2000000-0000-4000-8000-000000000001')$$,'RA004',null,'Rejoining must satisfy current age rule');
select throws_ok($$select public.join_event('e2000000-0000-4000-8000-000000000005')$$,'P0002',null,'Private outsider sees no eligibility oracle');
select set_config('request.jwt.claims','{"sub":"42000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.join_event('e2000000-0000-4000-8000-000000000001')$$,'RA005',null,'Legacy birth year without DOB cannot satisfy restriction');
select lives_ok($$select public.join_event('e2000000-0000-4000-8000-000000000003')$$,'No minimum age requires no DOB');
select set_config('request.jwt.claims','{"sub":"42000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select lives_ok($$select public.join_event('e2000000-0000-4000-8000-000000000004')$$,'Feb 29 birthday reaches age on Feb 28 in a non-leap year');
reset role;
select ok(not (public.discover_events('{"period":"all"}')->'items'->0 ?| array['dateOfBirth','birthYear','ageDeclaredAt']),'Public event summaries contain no private age');
select is((public.get_event('e2000000-0000-4000-8000-000000000001')->>'minimumAge')::integer,18,'Actual event minimum age is projected');
select is(public.get_event('e2000000-0000-4000-8000-000000000001')->>'experienceLevel','all-levels','Actual event recommendation is projected');
select throws_ok($$update public.events set tags=array['Casual','Competitive'] where id='e2000000-0000-4000-8000-000000000003'$$,'22023',null,'Database rejects atmosphere pair');
select throws_ok($$update public.events set tags=array['One-shot','Campaign'] where id='e2000000-0000-4000-8000-000000000003'$$,'22023',null,'Database rejects format pair');
select lives_ok($$update public.events set tags=array['Bring your own deck','Equipment provided'],experience_level='veteran-plus' where id='e2000000-0000-4000-8000-000000000003'$$,'Equipment tags coexist with new recommendation');
select throws_ok($$update public.events set experience_level='experienced' where id='e2000000-0000-4000-8000-000000000003'$$,'22023',null,'Cannot newly assign a legacy recommendation');
select throws_ok($$update public.events set tags=array['Veterans only'] where id='e2000000-0000-4000-8000-000000000003'$$,'22023',null,'Legacy experience tags cannot be newly selected');
-- Deliberately emulate historical rows inside this rollback-only fixture transaction.
set constraints all immediate;
alter table public.events disable trigger validate_event_requirements;
update public.events set experience_level='experienced',tags=array['Veterans only','Casual','Competitive'] where id='e2000000-0000-4000-8000-000000000003';
alter table public.events enable trigger validate_event_requirements;
select lives_ok($$update public.events set title='A preserved historical table' where id='e2000000-0000-4000-8000-000000000003'$$,'Unrelated edit preserves historical meaning without rewriting tags');
select is(public.get_event('e2000000-0000-4000-8000-000000000003')->>'experienceLevel','experienced','Historical experience remains explicitly legacy');
select throws_ok($$update public.events set tags=array['Casual','Competitive','Campaign'] where id='e2000000-0000-4000-8000-000000000003'$$,'22023',null,'Changing legacy tags requires resolving conflicts');
select lives_ok($$update public.events set experience_level='intermediate-plus',tags=array['Casual','One-shot'] where id='e2000000-0000-4000-8000-000000000003'$$,'Explicit migration of one record is valid');
select is(jsonb_array_length(public.discover_events('{"period":"all","experience":"intermediate-plus"}')->'items'),1,'New requirement filter is exact');
-- Private admission must commit limiter attempts on age failures, without leaking event IDs.
insert into private.event_cover_config(singleton,operation_key_hash) values(true,encode(extensions.digest('age-fixture-capability','sha256'),'hex'))
 on conflict(singleton) do update set operation_key_hash=excluded.operation_key_hash;
update public.events set minimum_age=18 where id='e2000000-0000-4000-8000-000000000005';
insert into private.event_invitations(event_id,code_hash,sealed_code,expires_at)
 values('e2000000-0000-4000-8000-000000000005',repeat('b',64),repeat('A',16)||'.'||repeat('B',22)||'.'||repeat('C',22),clock_timestamp()+interval '1 day');
set local role authenticated;
select set_config('request.headers','{"x-rollcall-cover-key":"age-fixture-capability"}',true);
select set_config('request.jwt.claims','{"sub":"42000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.redeem_event_invitation(repeat('b',64))->>'status','age-ineligible','Valid private code still checks age');
select ok(not (public.redeem_event_invitation(repeat('b',64)) ? 'eventId'),'Age denial contains no private event identifier');
reset role;
select is((select attempts from private.invitation_attempts where account_id='42000000-0000-4000-8000-000000000002'),2,'Private age failures commit both attempts');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"42000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(public.redeem_event_invitation(repeat('b',64))->>'status','age-unavailable','Private code does not bypass missing DOB');
reset role;
update public.events set minimum_age=15 where id='e2000000-0000-4000-8000-000000000005';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"42000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.redeem_event_invitation(repeat('b',64))->>'status','joined','Eligible private admission uses normal membership/counter infrastructure');
select is((public.get_event('e2000000-0000-4000-8000-000000000005')->>'participantCount')::integer,1,'Private age failures never reserved a seat');
reset role;
insert into private.account_suspensions(profile_id,status,suspended_at,suspended_by,suspension_reason) values
 ('42000000-0000-4000-8000-000000000002','suspended',now(),'42000000-0000-4000-8000-000000000001','Synthetic UX test restriction');
set local role authenticated;
select throws_ok($$select public.correct_my_username_case('OGNJEN3211','Ognjen3211')$$,'PT403','ACCOUNT_SUSPENDED','New casing RPC preserves live suspension check');
select throws_ok($$select public.join_event('e2000000-0000-4000-8000-000000000003')$$,'PT403','ACCOUNT_SUSPENDED','Age-zero event cannot bypass suspension');
reset role;
select * from finish();
rollback;
