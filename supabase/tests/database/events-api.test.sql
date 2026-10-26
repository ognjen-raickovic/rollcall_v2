-- Event API permissions, checked RPCs and transaction boundaries. Every fixture rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
do $$
declare routine regprocedure;
begin
  for routine in select p.oid::regprocedure from pg_proc p
    join pg_depend d on d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e'
    join pg_extension e on e.oid=d.refobjid and e.extname='pgtap'
  loop execute format('grant execute on function %s to anon, authenticated', routine); end loop;
end;
$$;
select no_plan();

select ok((select not rolcanlogin and not rolsuper and not rolbypassrls and not rolcreaterole
  from pg_roles where rolname='rollcall_events_executor'), 'event executor cannot log in, bypass RLS or create roles');
select ok(not pg_has_role('anon','rollcall_events_executor','member'), 'anon cannot assume executor');
select ok(not pg_has_role('authenticated','rollcall_events_executor','member'), 'authenticated cannot assume executor');
select ok(not pg_has_role('postgres','rollcall_events_executor','set')
  and not pg_has_role('postgres','rollcall_events_executor','usage'), 'temporary migration execution/inheritance permissions were revoked');
select ok(not has_schema_privilege('rollcall_events_executor','private','create'), 'executor cannot create private objects');
select ok(not has_table_privilege('anon','public.events','select,insert,update,delete'), 'anon has no raw event privileges');
select ok(not has_table_privilege('authenticated','public.events','select,insert,update,delete'), 'authenticated has no raw event privileges');
select ok(not has_table_privilege('authenticated','private.event_locations','select,insert,update,delete'), 'ordinary users have no direct location privileges');
select ok(not has_table_privilege('authenticated','public.event_participants','select,insert,update,delete'), 'raw attendance table remains closed to clients');
select ok(not has_table_privilege('rollcall_events_executor','public.event_participants','update'), 'executor cannot rewrite membership identities');
select ok(not has_column_privilege('rollcall_events_executor','public.events','host_id','update'), 'executor cannot reassign a host');
select ok(not has_column_privilege('rollcall_events_executor','public.events','participant_count','update'), 'executor cannot forge attendance counts');
select ok(not (select prosecdef from pg_proc where oid='public.get_event(uuid)'::regprocedure), 'exposed detail wrapper is invoker');
select ok((select prosecdef and proowner='rollcall_events_executor'::regrole
  and proconfig @> array['search_path=""'] from pg_proc where oid='private.event_api_get(uuid)'::regprocedure), 'private entry point is hardened and owned by non-bypass executor');
select ok(not has_function_privilege('anon','private.event_api_details(uuid)','execute'), 'anonymous callers cannot invoke internal detail helper');
select ok(not has_function_privilege('authenticated','private.event_api_summary(uuid)','execute'), 'ordinary users cannot invoke internal summary helper');
select ok(not has_function_privilege('anon','public.create_event(jsonb)','execute'), 'anonymous creation is denied');
select ok(not has_function_privilege('anon','private.event_api_actor()','execute')
  and not has_function_privilege('authenticated','private.event_api_actor()','execute'), 'API roles cannot call the Auth subject resolver');
select ok(has_function_privilege('rollcall_events_executor','private.event_api_actor()','execute')
  and (select prosecdef and proconfig @> array['search_path=""']
    and proowner <> 'rollcall_events_executor'::regrole
    from pg_proc where oid='private.event_api_actor()'::regprocedure), 'subject resolver has a distinct trusted owner and hardened executor-only access');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname in ('event_api_time','event_api_input')
    and p.provolatile='s'), 2, 'timestamp and JSON input conversion use stable volatility');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname in
    ('event_api_discover','event_api_get','event_api_create','event_api_update','event_api_delete')
    and p.prosecdef and p.proowner='rollcall_events_executor'::regrole
    and p.proconfig @> array['search_path=""']), 5, 'all checked event entry points use the non-bypass owner and empty search paths');

insert into auth.users(id,email) values
  ('50000000-0000-4000-8000-000000000001','event-sql-one@example.invalid'),
  ('50000000-0000-4000-8000-000000000002','event-sql-two@example.invalid');
-- Protected actions below simulate confirmed Auth sessions.
update auth.users set email_confirmed_at=now() where id in ('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002');
create temporary table event_api_fixtures(kind text primary key, id uuid, body jsonb);
grant select,insert,update on event_api_fixtures to anon,authenticated;
insert into event_api_fixtures(kind,body) select 'base',jsonb_build_object(
  'title','SQL event API fixture','description','A friendly table for genuine database assertions.',
  'gameId',(select id from public.games where name='Dungeons & Dragons'),
  'cityId',(select city.id from public.cities city join public.countries country on country.id=city.country_id
    where country.iso_code='ME' and city.name='Podgorica' order by city.id limit 1),
  'address','Synthetic private workshop address','startsAt',now()+interval '7 days',
  'endsAt',now()+interval '7 days 2 hours','capacity',3,'experienceLevel','all-levels',
  'tags',jsonb_build_array('Beginner friendly'));

select set_config('request.jwt.claims','{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
insert into event_api_fixtures(kind,id) select 'public',(public.create_event(body)->>'id')::uuid from event_api_fixtures where kind='base';
insert into event_api_fixtures(kind,id) select 'private',(public.create_event(body||'{"visibility":"private"}'::jsonb)->>'id')::uuid from event_api_fixtures where kind='base';
insert into event_api_fixtures(kind,id) select 'unlisted',(public.create_event(body||'{"visibility":"unlisted"}'::jsonb)->>'id')::uuid from event_api_fixtures where kind='base';
select is(public.get_event((select id from event_api_fixtures where kind='public'))->>'host',
  jsonb_build_object('id','50000000-0000-4000-8000-000000000001','displayName','RollCall player')::text,
  'host is derived from verified database subject');
select is(public.get_event((select id from event_api_fixtures where kind='private'))->>'address',
  'Synthetic private workshop address','private host receives protected address');
select is(public.get_event((select id from event_api_fixtures where kind='public'))->'venue','null'::jsonb,'venue is optional');
select throws_ok($$select public.create_event(body||'{"hostId":"50000000-0000-4000-8000-000000000002"}'::jsonb) from event_api_fixtures where kind='base'$$,
  '22023',null,'direct RPC cannot choose host');
select throws_ok($$select public.create_event(body||'{"coverStoragePath":"data:image/png;base64,invalid"}'::jsonb) from event_api_fixtures where kind='base'$$,
  '22023',null,'direct RPC rejects mock image data');
select throws_ok($$select public.create_event(body||'{"tags":["Veterans only"]}'::jsonb) from event_api_fixtures where kind='base'$$,
  '23514',null,'database rejects incompatible tags');
select throws_ok($$select public.create_event(body||'{"tags":["Casual","Casual"]}'::jsonb) from event_api_fixtures where kind='base'$$,
  '23514',null,'database rejects duplicate tags');
select throws_ok($$select public.create_event(body||'{"gameId":2147483647}'::jsonb) from event_api_fixtures where kind='base'$$,
  '23503',null,'unknown catalog reference rejected');
select throws_ok($$select public.update_event((select id from event_api_fixtures where kind='public'),'{"experienceLevel":"experienced"}')$$,
  '23514',null,'PATCH validates merged experience and tags');
select throws_ok($$select public.update_event((select id from event_api_fixtures where kind='public'),'{"title":"Must not persist","address":"x"}')$$,
  '22023',null,'combined invalid private update fails');
select is(public.get_event((select id from event_api_fixtures where kind='public'))->>'title','SQL event API fixture','failed update preserves public data');
select lives_ok($$select public.update_event((select id from event_api_fixtures where kind='public'),'{"address":"Updated synthetic workshop address"}')$$,
  'host can update protected address inside atomic RPC');
reset role;
update private.event_locations set share_publicly=true where event_id in (select id from event_api_fixtures);

-- Changing SQL role alone does not clear the previous JWT claims in this transaction.
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
select ok(not(public.get_event((select id from event_api_fixtures where kind='public')) ? 'address'), 'anonymous detail omits address despite sharing flag');
select ok(not(public.get_event((select id from event_api_fixtures where kind='unlisted')) ? 'address'), 'unlisted link does not authorize address');
select throws_ok($$select public.get_event((select id from event_api_fixtures where kind='private'))$$,'P0002','Event not found.','private event is hidden');
select throws_ok($$select public.get_event('59999999-0000-4000-8000-000000000001')$$,'P0002','Event not found.','missing event is indistinguishable from private');
select is(jsonb_array_length(public.discover_events('{"search":"SQL event API fixture"}')->'items'),1,'only public scheduled fixture is discovered');
select ok(not (public.discover_events('{"search":"SQL event API fixture"}')->'items'->0 ? 'address'), 'discovery summary contains no address');
select throws_ok($$select public.discover_events('{"limit":51}')$$,'22023',null,'RPC enforces bounded limits');
select throws_ok($$select public.discover_events('{"limit":"2"}')$$,'22023',null,'RPC rejects string limit');
select throws_ok($$select public.discover_events('{"visibility":"private"}')$$,'22023',null,'RPC cannot widen discovery visibility');
select throws_ok($$select public.discover_events('{"status":"cancelled"}')$$,'22023',null,'RPC cannot widen discovery status');
select throws_ok($$select public.discover_events('{"afterId":"50000000-0000-4000-8000-000000000001"}')$$,'22023',null,'cursor position must be paired');
select throws_ok($$select * from private.event_locations$$,'42501',null,'schema naming permission does not expose addresses');
reset role;

select set_config('request.jwt.claims','{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.get_event((select id from event_api_fixtures where kind='private'))$$,'P0002','Event not found.','other account cannot read private event');
select ok(not(public.get_event((select id from event_api_fixtures where kind='public')) ? 'address'), 'other account cannot read public event address');
select throws_ok($$select public.update_event((select id from event_api_fixtures where kind='public'),'{"title":"Takeover"}')$$,'P0002','Event not found.','other account cannot update');
select throws_ok($$select public.delete_event((select id from event_api_fixtures where kind='public'))$$,'P0002','Event not found.','other account cannot delete');
select throws_ok($$update public.events set title='Takeover'$$,'42501',null,'no direct table mutation bypass');
reset role;

insert into public.event_participants(event_id,profile_id) select id,'50000000-0000-4000-8000-000000000002' from event_api_fixtures where kind='public';
select set_config('request.jwt.claims','{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is((public.get_event((select id from event_api_fixtures where kind='public'))->>'participantCount')::int,1,'existing attendance is visible as count only');
select lives_ok($$select public.update_event((select id from event_api_fixtures where kind='public'),'{"status":"cancelled"}')$$,'host can cancel without changing attendance');
select lives_ok($$select public.delete_event((select id from event_api_fixtures where kind='public'))$$,'hard delete cascades cancelled-event attendance and location');
reset role;
select is((select count(*)::int from private.event_locations where event_id=(select id from event_api_fixtures where kind='public')),0,'deleted address is removed');
select is((select count(*)::int from public.event_participants where event_id=(select id from event_api_fixtures where kind='public')),0,'deleted attendance is removed');
select is((select count(*)::int from public.profiles where id in ('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002')),2,'deletion preserves referenced profiles');
select * from finish();
rollback;
