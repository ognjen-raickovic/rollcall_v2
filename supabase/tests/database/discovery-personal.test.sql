begin;
\ir ../helpers/legacy-registration.inc
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
do $$declare f regprocedure;begin for f in select p.oid::regprocedure from pg_proc p join pg_depend d on d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e' join pg_extension e on e.oid=d.refobjid and e.extname='pgtap' loop execute format('grant execute on function %s to anon,authenticated',f);end loop;end;$$;
select no_plan();
insert into auth.users(id,email,email_confirmed_at) values
 ('d0000000-0000-4000-8000-000000000001','discovery-host@example.test',now()),
 ('d0000000-0000-4000-8000-000000000002','discovery-other@example.test',now()),
 ('d0000000-0000-4000-8000-000000000003','discovery-member@example.test',now()),
 ('d0000000-0000-4000-8000-000000000004','discovery-outsider@example.test',now());
-- Trusted historical fixtures emulate events that have naturally aged. Only this
-- future-write fixture check is suspended, inside the rolled-back test transaction;
-- restore it immediately. RLS/authorization/attendance triggers remain enabled.
alter table public.events disable trigger validate_event_write;
insert into public.events(id,host_id,game_id,city_id,title,description,starts_at,ends_at,capacity,experience_level,minimum_age,tags,visibility,status)
select ('d1000000-0000-4000-8000-'||lpad(x.n::text,12,'0'))::uuid,
 (case when x.n=6 then 'd0000000-0000-4000-8000-000000000002' else 'd0000000-0000-4000-8000-000000000001' end)::uuid,
 case when x.n=2 then 2 else 1 end,(select city.id from public.cities city join public.countries c on c.id=city.country_id where c.iso_code='ME' and city.name='Podgorica' order by city.id limit 1),
 case when x.n=3 then 'Discovery Z table' when x.n=2 then 'discovery a table' else 'Discovery A table' end,
 'A synthetic event for discovery and privacy assertions.',x.start_time,x.start_time+interval '2 hours',case when x.n=3 then 1 else 4 end,
 case when x.n=2 then 'beginner' when x.n=3 then 'experienced' else 'all-levels' end,
 case when x.n=3 then 18 when x.n=2 then 12 else 0 end,
 case when x.n=2 then array['Casual','Beginner friendly'] else array['Casual'] end,
 case when x.n=5 then 'private' when x.n=6 then 'unlisted' else 'public' end,
 case when x.n=7 then 'cancelled' else 'scheduled' end
from (values (1,'2026-03-29T00:30:00Z'::timestamptz),(2,'2026-03-29T01:30:00Z'::timestamptz),
 (3,now()+interval '7 days'),(4,'2026-03-29T22:00:00Z'::timestamptz),
 (5,now()+interval '8 days'),(6,now()+interval '9 days'),(7,now()+interval '10 days')) x(n,start_time);
insert into private.event_locations(event_id,address) select id,'Synthetic protected address' from public.events where id::text like 'd1000000%';
set constraints all immediate;
alter table public.events enable trigger validate_event_write;
select ok((select tgenabled='O' from pg_trigger where tgrelid='public.events'::regclass and tgname='validate_event_write'),'Future-write validation restored before security assertions');
insert into public.event_participants(event_id,profile_id) values
 ('d1000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000003'),
 ('d1000000-0000-4000-8000-000000000005','d0000000-0000-4000-8000-000000000003');
select is(jsonb_array_length(public.discover_events('{"search":"Discovery","period":"all"}')->'items'),4,'Discovery excludes private, unlisted and cancelled events');
select is(jsonb_array_length(public.discover_events('{"search":"Discovery","period":"all","category":"trading-card"}')->'items'),1,'Category applies before pagination');
select is(jsonb_array_length(public.discover_events('{"search":"Discovery","period":"all","tags":["Casual","Beginner friendly"]}')->'items'),1,'Tags match all selected');
select is(jsonb_array_length(public.discover_events('{"search":"Discovery","period":"all","experience":"beginner"}')->'items'),3,'Beginner includes all-levels events');
select is(jsonb_array_length(public.discover_events('{"search":"Discovery","period":"all","maxMinimumAge":12}')->'items'),3,'Age requirement uses event metadata only');
select is(jsonb_array_length(public.discover_events('{"search":"Discovery","period":"all","availability":"full"}')->'items'),1,'Full is capacity, not cancellation');
select is(jsonb_array_length(public.discover_events('{"search":"Discovery","period":"all","availability":"open"}')->'items'),0,'Open seats exclude started and full events');
select is(jsonb_array_length(public.discover_events('{"search":"Discovery","period":"past"}')->'items'),3,'Finished means end time has passed');
select is(jsonb_array_length(public.discover_events('{"search":"Discovery","period":"all","startsAfter":"2026-03-28T23:00:00Z","startsBefore":"2026-03-29T22:00:00Z","startsBeforeExclusive":true}')->'items'),2,'Inclusive local date range ends at next midnight exclusively across DST');
select is(jsonb_array_length(public.discover_events('{"search":"Discovery","period":"all","timeFrom":"03:00","timeTo":"04:00","timeZone":"Europe/Belgrade"}')->'items'),1,'Daily clock filter applies DST in the named timezone');
select is(jsonb_array_length(public.discover_events('{"search":"Discovery","period":"all","category":"trading-card","tags":["Casual","Beginner friendly"],"experience":"beginner","maxMinimumAge":12,"startsAfter":"2026-03-28T23:00:00Z","startsBefore":"2026-03-29T22:00:00Z","startsBeforeExclusive":true,"timeFrom":"03:00","timeTo":"04:00","timeZone":"Europe/Belgrade","sort":"title-asc","limit":1}')->'items'),1,'Combined metadata, date, DST clock and sorting filters compose before pagination');
select throws_ok($$select public.discover_events('{"timeFrom":"22:00","timeTo":"16:00","timeZone":"Europe/Belgrade"}')$$,'22023',null,'Reject reversed clock range');
select throws_ok($$select public.discover_events('{"timeFrom":"16:00","timeZone":"Not/AZone"}')$$,'22023',null,'Reject unknown timezone');
select throws_ok($$select public.discover_events('{"status":"cancelled"}')$$,'22023',null,'No cancelled public discovery expansion');
select throws_ok($$select public.discover_events('{"visibility":"private"}')$$,'22023',null,'No private discovery option');
select throws_ok($$select public.discover_events('{"tags":["invented"]}')$$,'22023',null,'Reject unsupported tags');
select throws_ok($$select public.discover_events('{"tags":["Casual","Casual","Casual","Casual","Casual","Casual","Casual"]}')$$,'22023',null,'Bound tag arrays before materializing their elements');
select throws_ok($$select public.discover_events('{"startsAfter":"2027-01-01T00:00:00Z","startsBefore":"2026-01-01T00:00:00Z"}')$$,'22023',null,'Reject reversed dates');
create temporary table sorted_pages(sort text,page jsonb);
insert into sorted_pages select mode,public.discover_events(jsonb_build_object('search','Discovery','period','all','sort',mode,'limit',2)) from unnest(array['soonest','latest','title-asc','title-desc']) mode;
select ok((select bool_and((page->>'hasMore')::boolean) from sorted_pages),'Every sort has further pages');
select is((select page->'items'->0->>'id' from sorted_pages where sort='soonest'),'d1000000-0000-4000-8000-000000000001','Soonest stable first');
select is((select page->'items'->0->>'id' from sorted_pages where sort='latest'),'d1000000-0000-4000-8000-000000000003','Latest stable first');
select is((select page->'items'->0->>'id' from sorted_pages where sort='title-asc'),'d1000000-0000-4000-8000-000000000001','Title ascending uses UUID tie breaker');
select is((select page->'items'->0->>'id' from sorted_pages where sort='title-desc'),'d1000000-0000-4000-8000-000000000003','Title descending stable first');
create temporary table second_pages as select sort,public.discover_events(jsonb_build_object('search','Discovery','period','all','sort',sort,'limit',2,
 'afterStartsAt',page->'position'->>'startsAt','afterId',page->'position'->>'id') || case when sort like 'title-%' then jsonb_build_object('afterTitle',page->'position'->>'titleKey') else '{}'::jsonb end) page from sorted_pages;
select ok((select bool_and(jsonb_array_length(page->'items')=2 and not (page->>'hasMore')::boolean) from second_pages),'Every sort returns the remaining page without extra pages');
select is((select count(*)::int from (select s.sort,item->>'id' id from sorted_pages s cross join lateral jsonb_array_elements(s.page->'items') item
 union select s.sort,item->>'id' from second_pages s cross join lateral jsonb_array_elements(s.page->'items') item) all_ids),16,'Four distinct identities in each complete sorted result');
select ok(not(public.discover_events('{"period":"all"}')::text like '%protected address%'),'Discovery never returns addresses');
select ok(not has_function_privilege('anon','public.my_events(jsonb)','execute'),'Anonymous personal event RPC denied');
select ok(not has_table_privilege('authenticated','public.events','select'),'Raw event table remains closed');
select set_config('request.jwt.claims','{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is(jsonb_array_length(public.my_events('{"period":"all"}')->'items'),6,'Host sees own private, public and cancelled events');
select ok(not(public.my_events('{"period":"all"}')::text like '%protected address%'),'Personal summaries omit addresses too');
select throws_ok($$select public.my_events('{"userId":"d0000000-0000-4000-8000-000000000002"}')$$,'22023',null,'Submitted actor cannot select another account');
reset role;
select set_config('request.jwt.claims','{"sub":"d0000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select is(jsonb_array_length(public.my_events('{"relation":"joined","period":"all"}')->'items'),2,'Member sees only current joined events including private');
select is(jsonb_array_length(public.my_events('{"relation":"hosting","period":"all"}')->'items'),0,'Member does not become host');
reset role;
select set_config('request.jwt.claims','{"sub":"d0000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
set local role authenticated;
select is(jsonb_array_length(public.my_events('{"relation":"joined","period":"all"}')->'items'),0,'Outsider cannot enumerate private events');
reset role;
insert into private.account_suspensions(profile_id,status,suspended_at,suspended_by,suspension_reason) values('d0000000-0000-4000-8000-000000000003','suspended',now(),'d0000000-0000-4000-8000-000000000002','Synthetic security check');
select set_config('request.jwt.claims','{"sub":"d0000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.my_events('{"relation":"joined"}')$$,'PT403','ACCOUNT_SUSPENDED','Existing bearer cannot bypass suspension via Data API');
reset role;
select ok((select proowner='rollcall_events_executor'::regrole and prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='private.event_api_my_events(jsonb)'::regprocedure),'Personal RPC uses hardened non-bypass executor');
select * from finish();
rollback;
