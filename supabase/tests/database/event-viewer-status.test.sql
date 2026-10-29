-- Synthetic fixtures and pgTAP access are rolled back. Never run against production data.
begin;
\ir ../helpers/legacy-registration.inc
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_depend d on d.objid=p.oid and d.classid='pg_proc'::regclass and d.deptype='e'
 join pg_extension e on e.oid=d.refobjid and e.extname='pgtap'
 loop execute format('grant execute on function %s to anon,authenticated',f); end loop;
end; $$;
select no_plan();
insert into auth.users(id,email,email_confirmed_at) values
 ('43000000-0000-4000-8000-000000000001','card-host@example.test',now()),
 ('43000000-0000-4000-8000-000000000002','card-member@example.test',now()),
 ('43000000-0000-4000-8000-000000000003','card-other@example.test',now());
insert into public.events(id,host_id,game_id,city_id,title,description,starts_at,ends_at,capacity,experience_level,visibility)
select ('e3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'43000000-0000-4000-8000-000000000001',1,
 (select id from public.cities order by id limit 1),'Card status table '||n,'Synthetic public, unlisted and private card status fixture.',
 '2032-01-01T17:00:00Z','2032-01-01T20:00:00Z',2,'all-levels',case n when 1 then 'public' when 2 then 'unlisted' else 'private' end
from generate_series(1,3) n;
insert into private.event_locations(event_id,address) select id,'Protected fixture address' from public.events where id::text like 'e3000000%';
insert into public.event_participants(event_id,profile_id) values
 ('e3000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000002'),
 ('e3000000-0000-4000-8000-000000000003','43000000-0000-4000-8000-000000000002');
select ok(not has_function_privilege('anon','public.event_viewer_status(uuid[])','execute'),'Anonymous batch denied');
select ok(not has_table_privilege('authenticated','public.events','select'),'No raw event grant added');
select ok(not has_table_privilege('authenticated','public.event_participants','select'),'No raw membership grant added');
select ok(not pg_has_role('authenticated','rollcall_events_executor','member'),'No client executor membership');
set local role anon;
select throws_ok($$select public.event_viewer_status(array['e3000000-0000-4000-8000-000000000001']::uuid[])$$,'42501',null,'Anonymous cannot invoke batch RPC');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"43000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(public.event_viewer_status(array['e3000000-0000-4000-8000-000000000001']::uuid[])->>'userId','43000000-0000-4000-8000-000000000003','Actor comes from verified subject');
select is(public.event_viewer_status(array['e3000000-0000-4000-8000-000000000001']::uuid[])->'items'->0->>'hasJoined','false','Another participant cannot appear as viewer');
select is(jsonb_array_length(public.event_viewer_status(array['e3000000-0000-4000-8000-000000000003']::uuid[])->'items'),0,'Private outsider receives no row');
select is(jsonb_array_length(public.event_viewer_status(array['e3000000-0000-4000-8000-000000000099']::uuid[])->'items'),0,'Missing and inaccessible are indistinguishable');
select is(jsonb_array_length(public.event_viewer_status(array['e3000000-0000-4000-8000-000000000002']::uuid[])->'items'),1,'Explicit unlisted UUID uses existing direct-read boundary');
select throws_ok($$select public.event_viewer_status('{}'::uuid[])$$,'22023',null,'Empty input denied');
select throws_ok($$select public.event_viewer_status(null)$$,'22023',null,'Null input denied');
select throws_ok($$select public.event_viewer_status(array[null]::uuid[])$$,'22023',null,'Null identifier denied');
select throws_ok($$select public.event_viewer_status(array['e3000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001']::uuid[])$$,'22023',null,'Duplicates denied');
select throws_ok($$select public.event_viewer_status(array(select gen_random_uuid() from generate_series(1,51)))$$,'22023',null,'Batch bound enforced in SQL');
select set_config('request.jwt.claims','{"sub":"43000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.event_viewer_status(array['e3000000-0000-4000-8000-000000000003']::uuid[])->'items'->0->>'hasJoined','true','Private member can read only self state');
select ok(not (public.event_viewer_status(array['e3000000-0000-4000-8000-000000000003']::uuid[])->'items'->0 ?| array['address','hostId','profileId','participants','dateOfBirth','birthYear','email','code']),'Batch excludes protected content');
select is((select count(*)::integer from jsonb_object_keys(public.event_viewer_status(array['e3000000-0000-4000-8000-000000000003']::uuid[])->'items'->0)),3,'Only eventId and two booleans projected');
select set_config('request.jwt.claims','{"sub":"43000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.event_viewer_status(array['e3000000-0000-4000-8000-000000000003']::uuid[])->'items'->0->>'isHost','true','Host can manage private table');
select is(public.event_viewer_status(array['e3000000-0000-4000-8000-000000000003']::uuid[])->'items'->0->>'hasJoined','false','Host never implicitly occupies guest seat');
reset role;
select is((select participant_count from public.events where id='e3000000-0000-4000-8000-000000000003'),1,'Read cannot change seats');
insert into private.account_suspensions(profile_id,status,suspended_at,suspended_by,suspension_reason) values
 ('43000000-0000-4000-8000-000000000003','suspended',now(),'43000000-0000-4000-8000-000000000001','Synthetic batch boundary');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"43000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.event_viewer_status(array['e3000000-0000-4000-8000-000000000001']::uuid[])$$,'PT403','ACCOUNT_SUSPENDED','Old suspended subject cannot use batch');
reset role;
select * from finish();
rollback;
