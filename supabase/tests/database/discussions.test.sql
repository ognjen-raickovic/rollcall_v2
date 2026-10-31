-- Synthetic fixtures roll back. Run only against the disposable/local test database.
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
insert into auth.users(id,email,email_confirmed_at)
select ('45000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'discussion-'||n||'@example.test',now() from generate_series(1,6) n;
insert into private.account_roles(profile_id,role) values
 ('45000000-0000-4000-8000-000000000004','admin'),('45000000-0000-4000-8000-000000000005','superadmin');
insert into private.account_suspensions(profile_id,status,suspended_at,suspended_by,suspension_reason)
values('45000000-0000-4000-8000-000000000006','suspended',now(),'45000000-0000-4000-8000-000000000005','Synthetic suspended participant');
insert into public.events(id,host_id,game_id,city_id,title,description,starts_at,ends_at,capacity,experience_level,visibility,status)
select ('e5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case when n=6 then '45000000-0000-4000-8000-000000000003'::uuid else '45000000-0000-4000-8000-000000000001'::uuid end,1,
 (select id from public.cities order by id limit 1),'Discussion fixture '||n,'Synthetic discussion eligibility and security fixture.',
 now()+interval '2 hours',now()+interval '4 hours',
 10,'all-levels',case when n=4 then 'private' else 'public' end,case when n=5 then 'cancelled' else 'scheduled' end
from generate_series(1,6) n;
insert into private.event_locations(event_id,address) select id,'Synthetic private address' from public.events where id::text like 'e5000000%';
set constraints all immediate;
insert into public.event_participants(event_id,profile_id)
select ('e5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'45000000-0000-4000-8000-000000000002' from generate_series(1,4) n;
-- Simulate time passing AFTER legitimate RSVP fixture insertion. Restore the
-- unchanged future-date trigger before every client/application assertion.
alter table public.events disable trigger validate_event_write;
update public.events set starts_at=now()-interval '2 hours',ends_at=case when id='e5000000-0000-4000-8000-000000000003' then now()-interval '1 hour' else now()+interval '1 hour' end
 where id in ('e5000000-0000-4000-8000-000000000002','e5000000-0000-4000-8000-000000000003');
alter table public.events enable trigger validate_event_write;
create function pg_temp.discussion(n integer,k text,o text,i jsonb default '{}'::jsonb) returns jsonb language sql as $$
 select public.event_discussion(('e5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,k,o,i);
$$;
grant execute on function pg_temp.discussion(integer,text,text,jsonb) to anon,authenticated;
select ok(not has_table_privilege('anon','private.event_comments','select'),'No raw guest comment access');
select ok(not has_table_privilege('authenticated','private.event_reviews','insert'),'No raw review insert');
select ok(not has_table_privilege('authenticated','private.discussion_audit','select'),'No audit disclosure');
select ok(not pg_has_role('authenticated','rollcall_discussion_executor','member'),'No executor membership');
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('private.event_comments'::regclass,'private.event_reviews'::regclass,'private.discussion_attempts'::regclass,'private.discussion_audit'::regclass)),'All sensitive tables use RLS');
set local role anon;
select is(jsonb_array_length(pg_temp.discussion(1,'comments','list')->'items'),0,'Guest reads public comments');
select is(pg_temp.discussion(4,'comments','list')->>'errorCode','not_found','Private existence concealed');
select is(pg_temp.discussion(9,'comments','list')->>'errorCode','not_found','Missing matches private');
select throws_ok($$select pg_temp.discussion(1,'comments','create','{"body":"Guest"}')$$,'42501',null,'Guest cannot write via Data API');
select throws_ok($$select * from private.event_comments$$,'42501',null,'Direct raw reads blocked');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"45000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select ok(pg_temp.discussion(1,'comments','create','{"body":"Before event"}') ? 'id','Comment before start');
select ok(pg_temp.discussion(2,'comments','create','{"body":"During event"}') ? 'id','Comment during event');
select is(pg_temp.discussion(3,'comments','create','{"body":"Too late"}')->>'errorCode','closed','Comment after end rejected');
select is(pg_temp.discussion(5,'comments','create','{"body":"Cancelled"}')->>'errorCode','closed','Cancelled comments rejected');
select ok(pg_temp.discussion(4,'comments','create','{"body":"Private member"}') ? 'id','Private member can comment');
select ok(pg_temp.discussion(6,'comments','create','{"body":"Another host event"}') ? 'id','Ordinary public access does not require RSVP');
select is(pg_temp.discussion(1,'reviews','create','{"rating":5}')->>'errorCode','closed','No reviews before start');
select is(pg_temp.discussion(2,'reviews','create','{"rating":5}')->>'errorCode','closed','No reviews during event');
select ok(pg_temp.discussion(3,'reviews','create','{"rating":5,"body":"Great table"}') ? 'id','Recorded participant reviews after end');
select is(pg_temp.discussion(3,'reviews','create','{"rating":4}')->>'errorCode','duplicate','Duplicate prevented');
select throws_ok($$select pg_temp.discussion(3,'reviews','create','{"rating":6}')$$,'22023',null,'SQL validates rating');
select throws_ok($$select pg_temp.discussion(1,'comments','create','{"body":"Valid","authorId":"forged"}')$$,'22023',null,'SQL rejects supplied actor');
select throws_ok($$select pg_temp.discussion(1,'comments','list','{"limit":21}')$$,'22023',null,'Pagination bound enforced');
select ok(pg_temp.discussion(1,'comments','create',jsonb_build_object('body','A reply','parentId',pg_temp.discussion(1,'comments','list')->'items'->0->>'id')) ? 'id','One-level reply');
select is(pg_temp.discussion(1,'comments','list')->'items'->0->>'replyCount','1','Root retains reply count');
select is(jsonb_array_length(pg_temp.discussion(1,'comments','list',jsonb_build_object('parentId',pg_temp.discussion(1,'comments','list')->'items'->0->>'id'))->'items'),1,'Replies page');
select is(pg_temp.discussion(1,'comments','create',jsonb_build_object('body','Nested','parentId',pg_temp.discussion(1,'comments','list',jsonb_build_object('parentId',pg_temp.discussion(1,'comments','list')->'items'->0->>'id'))->'items'->0->>'id'))->>'errorCode','not_found','Second nesting level rejected');
select ok(pg_temp.discussion(1,'comments','edit',jsonb_build_object('body','Edited text','id',pg_temp.discussion(1,'comments','list')->'items'->0->>'id')) ? 'id','Author edits');
select is(pg_temp.discussion(1,'comments','list')->'items'->0->>'body','Edited text','Edit persisted');
select ok((pg_temp.discussion(1,'comments','list')->'items'->0->>'editedAt') is not null,'Edit timestamp');
select ok(pg_temp.discussion(3,'reviews','edit',jsonb_build_object('rating',3,'id',pg_temp.discussion(3,'reviews','list')->'items'->0->>'id')) ? 'id','Author edits review');
select ok(pg_temp.discussion(3,'reviews','delete',jsonb_build_object('id',pg_temp.discussion(3,'reviews','list')->'items'->0->>'id')) ? 'id','Author deletes an unmoderated review');
select is(pg_temp.discussion(3,'reviews','create','{"rating":3}')->>'id',pg_temp.discussion(3,'reviews','list')->'items'->0->>'id','Recreation restores the same unique review identity');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"45000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(pg_temp.discussion(3,'reviews','create','{"rating":5}')->>'errorCode','forbidden','Nonparticipant review rejected');
select is(pg_temp.discussion(4,'comments','list')->>'errorCode','not_found','Private outsider rejected');
select is(pg_temp.discussion(1,'comments','edit',jsonb_build_object('body','Stolen','id',pg_temp.discussion(1,'comments','list')->'items'->0->>'id'))->>'errorCode','forbidden','Cross-user edit denied');
select is(pg_temp.discussion(1,'comments','hide',jsonb_build_object('reason','Unauthorized hide','id',pg_temp.discussion(1,'comments','list')->'items'->0->>'id'))->>'errorCode','forbidden','Ordinary moderation denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"45000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(pg_temp.discussion(3,'reviews','create','{"rating":5}')->>'errorCode','forbidden','Host cannot review');
select is(pg_temp.discussion(3,'reviews','hide',jsonb_build_object('reason','Unfavorable review','id',pg_temp.discussion(3,'reviews','list')->'items'->0->>'id'))->>'errorCode','forbidden','Host cannot hide reviews');
select is(pg_temp.discussion(6,'comments','hide',jsonb_build_object('reason','Different host event','id',pg_temp.discussion(6,'comments','list')->'items'->0->>'id'))->>'errorCode','forbidden','Host cannot moderate another host event');
select ok(pg_temp.discussion(1,'comments','hide',jsonb_build_object('reason','Host hides spam','id',pg_temp.discussion(1,'comments','list')->'items'->0->>'id')) ? 'id','Host hides own-event comment');
select is(pg_temp.discussion(1,'comments','list')->'items'->0->>'body',null,'Hidden body never returned even to host');
select ok(pg_temp.discussion(1,'comments','create','{"body":"Host question"}') ? 'id','Host comments');
select is(pg_temp.discussion(1,'comments','list')->'items'->1->>'isHost','true','Host label computed from UUID');
select ok(pg_temp.discussion(1,'comments','list','{"limit":1}')->>'nextCursor' is not null,'Bounded root page has a cursor');
select is(jsonb_array_length(pg_temp.discussion(1,'comments','list',jsonb_build_object('limit',1,'cursor',pg_temp.discussion(1,'comments','list','{"limit":1}')->>'nextCursor'))->'items'),1,'Next page advances without losing thread roots');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"45000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is(pg_temp.discussion(4,'comments','list')->>'errorCode','not_found','Admin has no private-event override');
select ok(pg_temp.discussion(3,'reviews','hide',jsonb_build_object('reason','Admin hides harassment','id',pg_temp.discussion(3,'reviews','list')->'items'->0->>'id')) ? 'id','Admin hides review');
select is(pg_temp.discussion(3,'reviews','list')->'items'->0->>'rating',null,'Hidden rating not exposed');
reset role;
update private.account_roles set role='user' where profile_id='45000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"45000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is(pg_temp.discussion(1,'comments','list')->'permissions'->>'canModerateComments','false','Role demotion reflected immediately');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"45000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select ok(pg_temp.discussion(1,'comments','hide',jsonb_build_object('reason','Superadmin hides spam','id',pg_temp.discussion(1,'comments','list')->'items'->1->>'id')) ? 'id','Superadmin moderation');
reset role;
select is((select count(*)::integer from private.discussion_audit),3,'Host/admin/superadmin actions audited');
select throws_ok($$update private.discussion_audit set reason='Tampered'$$,'42501',null,'Audit immutable');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"45000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select throws_ok($$select pg_temp.discussion(1,'comments','list')$$,'PT403','ACCOUNT_SUSPENDED','Old suspended JWT cannot read protected RPC');
select throws_ok($$select pg_temp.discussion(1,'comments','create','{"body":"Bypass"}')$$,'PT403','ACCOUNT_SUSPENDED','Suspended write denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"45000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select ok(pg_temp.discussion(2,'comments','delete',jsonb_build_object('id',pg_temp.discussion(2,'comments','list')->'items'->0->>'id')) ? 'id','Author deletes own comment');
select is(pg_temp.discussion(2,'comments','list')->'items'->0->>'body',null,'Deleted body never exposed');
select ok(pg_temp.discussion(3,'reviews','delete',jsonb_build_object('id',pg_temp.discussion(3,'reviews','list')->'items'->0->>'id')) ? 'id','Review owner can delete even when moderated');
select is(pg_temp.discussion(3,'reviews','create','{"rating":5}')->>'errorCode','duplicate','Cannot resurrect moderated review');
reset role;
alter table public.events disable trigger validate_event_write;
update public.events set ends_at=clock_timestamp() where id='e5000000-0000-4000-8000-000000000002';
alter table public.events enable trigger validate_event_write;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"45000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(pg_temp.discussion(2,'comments','create','{"body":"At end"}')->>'errorCode','closed','Database end boundary closes comments');
reset role;
update private.discussion_attempts set attempts=30 where actor_id='45000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"45000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(pg_temp.discussion(1,'comments','create','{"body":"Limited"}')->>'errorCode','limited','Durable account limit');
select is(pg_temp.discussion(3,'reviews','create','{"rating":5}')->>'errorCode','limited','Cannot bypass limit using another operation');
reset role;
select throws_ok($$truncate private.discussion_audit$$,'42501',null,'Audit cannot be truncated');
delete from public.events where id='e5000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from private.event_comments where event_id='e5000000-0000-4000-8000-000000000001'),0,'Event deletion cascades discussion');
select is((select count(*)::integer from private.discussion_audit),3,'Audit survives deletion');
select * from finish();
rollback;
