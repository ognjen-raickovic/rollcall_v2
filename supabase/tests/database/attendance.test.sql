-- Milestone 4B authorization, persistent membership, idempotency and safe DTOs.
-- Every fixture and temporary pgTAP grant rolls back; concurrency is tested separately.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
do $$
declare routine regprocedure;
begin
  for routine in select p.oid::regprocedure from pg_proc p
    join pg_depend d on d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e'
    join pg_extension e on e.oid=d.refobjid and e.extname='pgtap'
  loop execute format('grant execute on function %s to anon, authenticated, rollcall_events_executor', routine); end loop;
end;
$$;
select no_plan();

select ok((select not rolcanlogin and not rolinherit and not rolsuper and not rolbypassrls
  and not rolcreatedb and not rolcreaterole and not rolreplication
  from pg_roles where rolname='rollcall_attendance_counter'), 'counter role cannot log in, inherit, bypass RLS or administer');
select ok(not pg_has_role('anon','rollcall_attendance_counter','member')
  and not pg_has_role('authenticated','rollcall_attendance_counter','member')
  and not pg_has_role('rollcall_events_executor','rollcall_attendance_counter','member'), 'request roles cannot assume counter role');
select ok(not pg_has_role('postgres','rollcall_attendance_counter','set')
  and not pg_has_role('postgres','rollcall_attendance_counter','usage'), 'temporary counter-role execution membership removed');
select ok(not has_schema_privilege('rollcall_attendance_counter','private','create'), 'counter role cannot create functions');
select ok(has_column_privilege('rollcall_attendance_counter','public.events','participant_count','update')
  and not has_column_privilege('rollcall_attendance_counter','public.events','title','update')
  and not has_column_privilege('rollcall_attendance_counter','public.events','host_id','update'), 'counter role can update only counter columns');
select ok(has_column_privilege('rollcall_attendance_counter','private.event_locations','event_id','select')
  and not has_column_privilege('rollcall_attendance_counter','private.event_locations','address','select'), 'counter invariant can read location IDs but not addresses');
select ok(not has_table_privilege('rollcall_attendance_counter','public.event_participants','select,insert,update,delete'), 'counter role has no membership privileges');
select ok(not has_column_privilege('rollcall_events_executor','public.events','participant_count','update'), 'event executor still cannot forge counters');
select ok(not has_table_privilege('anon','public.event_participants','select,insert,update,delete')
  and not has_table_privilege('authenticated','public.event_participants','select,insert,update,delete'), 'client roles have no direct membership access');
select is((select count(*)::integer from pg_proc p where p.oid in
  ('private.track_event_participation()'::regprocedure,'private.require_event_location()'::regprocedure)
  and p.prosecdef and p.proowner='rollcall_attendance_counter'::regrole
  and p.proconfig @> array['search_path=""']),2,'existing counter and invariant triggers have hardened non-bypass ownership');
select ok(not has_function_privilege('authenticated','private.track_event_participation()','execute')
  and not has_function_privilege('anon','private.require_event_location()','execute'), 'API clients cannot execute internal trigger helpers');
select is((select count(*)::integer from pg_proc p where p.oid in
  ('private.event_api_join(uuid)'::regprocedure,'private.event_api_leave(uuid)'::regprocedure)
  and p.prosecdef and p.proowner='rollcall_events_executor'::regrole
  and p.proconfig @> array['search_path=""']),2,'attendance entry points use existing hardened non-bypass executor');
select ok(not has_function_privilege('authenticated','private.event_api_attendance(uuid,boolean)','execute'), 'shared implementation is not directly callable');
select ok(not has_function_privilege('anon','public.join_event(uuid)','execute')
  and not has_function_privilege('anon','public.leave_event(uuid)','execute'), 'anonymous attendance RPCs denied');
select ok(has_function_privilege('authenticated','public.join_event(uuid)','execute')
  and has_function_privilege('authenticated','public.leave_event(uuid)','execute'), 'verified role may execute checked attendance wrappers');
select ok(not (select prosecdef from pg_proc where oid='public.join_event(uuid)'::regprocedure)
  and not (select prosecdef from pg_proc where oid='public.leave_event(uuid)'::regprocedure), 'public attendance wrappers remain invoker');

insert into auth.users(id,email) values
  ('60000000-0000-4000-8000-000000000001','attendance-host@example.invalid'),
  ('60000000-0000-4000-8000-000000000002','attendance-player@example.invalid'),
  ('60000000-0000-4000-8000-000000000003','attendance-other@example.invalid');
-- Protected actions below simulate confirmed Auth sessions.
update auth.users set email_confirmed_at=now() where id in ('60000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000003');
create temporary table attendance_fixtures(kind text primary key, id uuid, body jsonb, stamp timestamptz);
grant select,insert,update on attendance_fixtures to anon,authenticated,rollcall_events_executor;
insert into attendance_fixtures(kind,body) select 'base',jsonb_build_object(
  'title','Attendance SQL fixture','description','A safe synthetic table for attendance database tests.',
  'gameId',(select min(id) from public.games),
  'cityId',(select min(city.id) from public.cities city join public.countries c on c.id=city.country_id where c.iso_code='ME'),
  'address','Synthetic private attendance address','startsAt',now()+interval '7 days',
  'endsAt',now()+interval '7 days 2 hours','capacity',1,'experienceLevel','all-levels');
select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
insert into attendance_fixtures(kind,id) select 'public',(public.create_event(body)->>'id')::uuid from attendance_fixtures where kind='base';
insert into attendance_fixtures(kind,id) select 'private',(public.create_event(body||'{"visibility":"private"}'::jsonb)->>'id')::uuid from attendance_fixtures where kind='base';
insert into attendance_fixtures(kind,id) select 'unlisted',(public.create_event(body||'{"visibility":"unlisted"}'::jsonb)->>'id')::uuid from attendance_fixtures where kind='base';
insert into attendance_fixtures(kind,id) select 'cancelled',(public.create_event(body)->>'id')::uuid from attendance_fixtures where kind='base';
select is(public.get_event((select id from attendance_fixtures where kind='public'))->'viewer',
  '{"userId":"60000000-0000-4000-8000-000000000001","isHost":true,"hasJoined":false}'::jsonb,'host viewer has no participant seat');
select throws_ok($$select public.join_event((select id from attendance_fixtures where kind='public'))$$,'RA002',null,'host cannot join');
select throws_ok($$select public.leave_event((select id from attendance_fixtures where kind='public'))$$,'RA002',null,'host cannot leave as participant');
select lives_ok($$select public.update_event((select id from attendance_fixtures where kind='cancelled'),'{"status":"cancelled"}')$$,'host cancels fixture');
reset role;

select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
select is(public.get_event((select id from attendance_fixtures where kind='public'))->'viewer',
  '{"userId":null,"isHost":false,"hasJoined":false}'::jsonb,'anonymous viewer is explicitly unjoined');
select ok(not (public.get_event((select id from attendance_fixtures where kind='public')) ? 'address'), 'anonymous public detail omits address');
select throws_ok($$select public.join_event((select id from attendance_fixtures where kind='public'))$$,'42501',null,'anonymous join rejected');
select throws_ok($$select public.leave_event((select id from attendance_fixtures where kind='public'))$$,'42501',null,'anonymous leave rejected');
reset role;

select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.join_event('69999999-0000-4000-8000-000000000001')$$,'P0002','Event not found.','nonexistent event hidden');
select throws_ok($$select public.join_event((select id from attendance_fixtures where kind='private'))$$,'P0002','Event not found.','private outsider cannot join by UUID');
select throws_ok($$select public.leave_event((select id from attendance_fixtures where kind='private'))$$,'P0002','Event not found.','private outsider cannot probe leave');
select throws_ok($$select public.join_event((select id from attendance_fixtures where kind='cancelled'))$$,'RA001',null,'cancelled join rejected');
select throws_ok($$select public.leave_event((select id from attendance_fixtures where kind='cancelled'))$$,'RA001',null,'cancelled noop leave rejected');
select is(public.join_event((select id from attendance_fixtures where kind='public'))->'hasJoined','true'::jsonb,'available event join succeeds');
select is((public.get_event((select id from attendance_fixtures where kind='public'))->>'participantCount')::integer,1,'participant count increases');
select is(public.get_event((select id from attendance_fixtures where kind='public'))->'viewer',
  '{"userId":"60000000-0000-4000-8000-000000000002","isHost":false,"hasJoined":true}'::jsonb,'joined viewer is current verified participant');
select is(public.get_event((select id from attendance_fixtures where kind='public'))->>'address',
  'Synthetic private attendance address','participant receives protected address');
insert into attendance_fixtures(kind,stamp) select 'joined-stamp',(public.get_event(id)->>'updatedAt')::timestamptz from attendance_fixtures where kind='public';
select is((public.join_event((select id from attendance_fixtures where kind='public'))->>'participantCount')::integer,1,'repeat join is idempotent even full');
select is((public.get_event((select id from attendance_fixtures where kind='public'))->>'updatedAt')::timestamptz,
  (select stamp from attendance_fixtures where kind='joined-stamp'),'repeat join preserves updated timestamp');
select is(public.join_event((select id from attendance_fixtures where kind='unlisted'))->'hasJoined','true'::jsonb,'direct-link unlisted participation allowed');
select is(jsonb_array_length(public.discover_events('{"search":"Attendance SQL fixture"}')->'items'),1,'unlisted and private remain absent from discovery');
select throws_ok($$insert into public.event_participants(event_id,profile_id) select id,'60000000-0000-4000-8000-000000000003' from attendance_fixtures where kind='public'$$,
  '42501',null,'no direct client membership-write bypass');
reset role;

select is((select count(*)::integer from public.event_participants where event_id=(select id from attendance_fixtures where kind='public')),1,'membership is stored in PostgreSQL');
-- Even the executor cannot modify public event content as a non-host: its extra UPDATE
-- policy exists only to authorize row-lock acquisition, not a resulting update row.
-- The maintenance role's normal executor SET privilege is revoked by the migration.
-- Temporarily enable it only in this rolled-back fixture transaction to probe RLS.
grant rollcall_events_executor to current_user;
grant usage on schema extensions to rollcall_events_executor;
set local role rollcall_events_executor;
select throws_ok($$update public.events set title='Forbidden nonhost update' where id=(select id from attendance_fixtures where kind='public')$$,
  '42501',null,'lock policy does not permit nonhost event content updates');
select throws_ok($$insert into public.event_participants(event_id,profile_id) select id,'60000000-0000-4000-8000-000000000003' from attendance_fixtures where kind='unlisted'$$,
  '42501',null,'executor membership RLS rejects another actor');
reset role;
revoke rollcall_events_executor from current_user;

select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.join_event((select id from attendance_fixtures where kind='public'))$$,'RA003',null,'full event refuses another player');
select is(public.leave_event((select id from attendance_fixtures where kind='public'))->'hasJoined','false'::jsonb,'unjoined public leave is safe noop');
select ok(not (public.get_event((select id from attendance_fixtures where kind='public')) ? 'address'), 'unrelated public viewer still has no protected address');
reset role;
select is((select count(*)::integer from public.event_participants where event_id=(select id from attendance_fixtures where kind='public')),1,'another actor cannot remove player membership');

select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is((public.leave_event((select id from attendance_fixtures where kind='public'))->>'participantCount')::integer,0,'leave decrements count');
select ok(not (public.get_event((select id from attendance_fixtures where kind='public')) ? 'address'), 'leave removes protected address access');
insert into attendance_fixtures(kind,stamp) select 'left-stamp',(public.get_event(id)->>'updatedAt')::timestamptz from attendance_fixtures where kind='public';
select is((public.leave_event((select id from attendance_fixtures where kind='public'))->>'participantCount')::integer,0,'repeat leave never makes count negative');
select is((public.get_event((select id from attendance_fixtures where kind='public'))->>'updatedAt')::timestamptz,
  (select stamp from attendance_fixtures where kind='left-stamp'),'repeat leave preserves updated timestamp');
reset role;

-- Legitimate prior participation can exist when a host changes visibility. No new private
-- admission operation is exposed. Seed only that relationship through trusted maintenance.
insert into public.event_participants(event_id,profile_id) select id,'60000000-0000-4000-8000-000000000002' from attendance_fixtures where kind='private';
select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is(public.get_event((select id from attendance_fixtures where kind='private'))->>'address',
  'Synthetic private attendance address','existing private participant gets authorized details');
select is(public.join_event((select id from attendance_fixtures where kind='private'))->'hasJoined','true'::jsonb,'existing private repeat join is allowed');
select is(public.leave_event((select id from attendance_fixtures where kind='private'))->'hasJoined','false'::jsonb,'existing private participant can leave');
select throws_ok($$select public.get_event((select id from attendance_fixtures where kind='private'))$$,'P0002','Event not found.','private leave removes detail access');
select throws_ok($$select public.leave_event((select id from attendance_fixtures where kind='private'))$$,'P0002','Event not found.','repeat private leave conceals inaccessible event');
select throws_ok($$select public.join_event((select id from attendance_fixtures where kind='private'))$$,'P0002','Event not found.','former private participant cannot rejoin');
reset role;
select lives_ok($$set constraints public.events_require_location, private.event_locations_required immediate$$,
  'deferred private location invariants remain valid after participant leaves');
select is((select e.participant_count::integer from public.events e where id=(select id from attendance_fixtures where kind='private')),0,'private count persists correctly');
select is((select count(*)::integer from public.event_participants where event_id=(select id from attendance_fixtures where kind='private')),0,'private membership removed');
select is((select count(*)::integer from public.profiles where id in
  ('60000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000003')),3,'attendance preserves referenced profiles');

select * from finish();
rollback;
