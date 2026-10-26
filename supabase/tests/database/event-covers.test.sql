-- SQL authorization/lifecycle proofs only. Physical file upload/read/delete is
-- verified separately through supported Storage HTTP integration tests.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
do $$
declare routine regprocedure;
begin
  for routine in select p.oid::regprocedure from pg_proc p
    join pg_depend d on d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
    join pg_extension e on e.oid = d.refobjid and e.extname = 'pgtap'
  loop execute format('grant execute on function %s to anon, authenticated', routine); end loop;
end;
$$;
select no_plan();

select ok((select not public and file_size_limit = 3145728 from storage.buckets where id = 'event-covers'),
  'cover bucket is private with a 3 MiB ceiling');
select is((select allowed_mime_types from storage.buckets where id = 'event-covers'),
  array['image/jpeg','image/png','image/webp'], 'bucket MIME allowlist excludes SVG and arbitrary files');
select ok((select relrowsecurity from pg_class where oid = 'private.event_cover_config'::regclass),
  'operation key hashes retain RLS');
select ok((select relrowsecurity from pg_class where oid = 'private.event_cover_objects'::regclass),
  'cover manifest retains RLS');
select ok(not has_table_privilege('anon','private.event_cover_config','select,insert,update,delete'),
  'anonymous callers cannot read or change operation hashes');
select ok(not has_table_privilege('authenticated','private.event_cover_config','select,insert,update,delete'),
  'authenticated callers cannot read or change operation hashes');
select ok(not has_table_privilege('authenticated','private.event_cover_objects','select,insert,update,delete'),
  'authenticated callers cannot directly forge cover reservations');
select ok(not has_function_privilege('anon','public.reserve_event_cover(uuid)','execute'),
  'anonymous reservation is denied before function execution');
select ok(not has_function_privilege('anon','public.commit_event_cover(uuid,text)','execute'),
  'anonymous association writes are denied');
select ok(not has_function_privilege('authenticated','private.event_cover_operation_allowed()','execute'),
  'operation secret verifier is internal');
select ok(not has_function_privilege('authenticated','private.event_cover_require_operation()','execute'),
  'operation authentication helper is internal');
select ok(not has_function_privilege('authenticated','private.event_cover_event_deleted()','execute'),
  'cleanup trigger cannot be called directly');
select ok((select not prosecdef from pg_proc where oid = 'public.commit_event_cover(uuid,text)'::regprocedure),
  'exposed cover wrapper is security invoker');
select ok((select prosecdef and proowner = 'rollcall_events_executor'::regrole
    and proconfig @> array['search_path=""'] from pg_proc where oid = 'private.event_cover_commit(uuid,text)'::regprocedure),
  'cover mutation uses the hardened existing non-bypass executor');
select ok(not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'event_cover_%' and cmd = 'UPDATE'), 'covers have no overwrite/upsert policy');
select ok(exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'event_cover_download' and qual like '%allow_only_operation%'),
  'cover reads explicitly restrict supported Storage operations, excluding list');
select ok(not pg_has_role('authenticated','rollcall_events_executor','member'), 'users cannot assume cover executor');
select ok(not has_schema_privilege('rollcall_events_executor','private','create'), 'executor cannot create new private objects');

insert into private.event_cover_config(singleton,operation_key_hash)
values (true,encode(extensions.digest('sql-cover-operation-key-only-not-a-real-key','sha256'),'hex'))
on conflict(singleton) do update set operation_key_hash = excluded.operation_key_hash;
insert into auth.users(id,email) values
  ('61000000-0000-4000-8000-000000000001','cover-sql-host@example.invalid'),
  ('61000000-0000-4000-8000-000000000002','cover-sql-participant@example.invalid'),
  ('61000000-0000-4000-8000-000000000003','cover-sql-outsider@example.invalid');
-- Protected actions below simulate confirmed Auth sessions.
update auth.users set email_confirmed_at=now() where id in ('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000003');
create temporary table cover_fixtures(kind text primary key, id uuid, body jsonb, reservation jsonb);
grant select,insert,update on cover_fixtures to anon,authenticated;
insert into cover_fixtures(kind,body) select 'base',jsonb_build_object(
  'title','SQL persistent cover fixture','description','A valid local table for focused image authorization checks.',
  'gameId',(select id from public.games order by id limit 1),
  'cityId',(select city.id from public.cities city join public.countries country on country.id = city.country_id
    where country.iso_code = 'ME' and city.name = 'Podgorica' order by city.id limit 1),
  'address','Synthetic cover test private address','startsAt',now() + interval '7 days',
  'endsAt',now() + interval '7 days 2 hours','capacity',4,'experienceLevel','all-levels');

select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('request.headers','{}',true);
set local role authenticated;
insert into cover_fixtures(kind,id) select 'public',(public.create_event(body)->>'id')::uuid from cover_fixtures where kind = 'base';
insert into cover_fixtures(kind,id) select 'private',(public.create_event(body || '{"visibility":"private"}'::jsonb)->>'id')::uuid from cover_fixtures where kind = 'base';
insert into cover_fixtures(kind,id) select 'unlisted',(public.create_event(body || '{"visibility":"unlisted"}'::jsonb)->>'id')::uuid from cover_fixtures where kind = 'base';
select throws_ok($$select public.reserve_event_cover((select id from cover_fixtures where kind = 'public'))$$,
  '42501',null,'real host cannot reserve a path directly without the backend operation key');
select set_config('request.headers','{"x-rollcall-cover-key":"wrong-key"}',true);
select throws_ok($$select public.reserve_event_cover((select id from cover_fixtures where kind = 'public'))$$,
  '42501',null,'a forged operation key does not authorize a reservation');
select set_config('request.headers','{"x-rollcall-cover-key":"sql-cover-operation-key-only-not-a-real-key"}',true);
update cover_fixtures set reservation = public.reserve_event_cover(id) where kind in ('public','private','unlisted');
select ok((select reservation->>'path' = id::text || '/' || (reservation->>'version') || '.webp'
    from cover_fixtures where kind = 'public'), 'paths are tied to the event and a generated unpredictable version');
select ok(private.event_cover_storage_allowed((select reservation->>'path' from cover_fixtures where kind = 'public'),'insert'),
  'host plus backend key can upload only an exact pending reservation');
select ok(not private.event_cover_storage_allowed('bad/path.webp','insert'), 'unregistered malformed path is denied');
select ok(not private.event_cover_storage_allowed((select reservation->>'path' from cover_fixtures where kind = 'public'),'delete'),
  'pending upload cannot be deleted without an explicit abort');
select throws_ok($$select public.commit_event_cover((select id from cover_fixtures where kind = 'public'),
  (select reservation->>'path' from cover_fixtures where kind = 'private'))$$,
  '22023',null,'a reservation cannot be attached to a different event');
select throws_ok($$select public.commit_event_cover(id,reservation->>'path') from cover_fixtures where kind = 'public'$$,
  '22023',null,'commit requires actual Storage metadata; a reservation alone is not an upload');
select throws_ok($$select public.update_event(id,jsonb_build_object('coverStoragePath',reservation->>'path'))
  from cover_fixtures where kind = 'public'$$, '22023',null,'normal event writes cannot attach any client-supplied Storage path');
reset role;

-- Build application-only active fixture metadata. No storage.objects rows/files
-- are inserted or deleted by these SQL tests; real Storage tests prove bytes.
update private.event_cover_objects set state = 'active' where path in
  (select reservation->>'path' from cover_fixtures where kind in ('public','private','unlisted'));
update public.events e set cover_storage_path = f.reservation->>'path' from cover_fixtures f where e.id = f.id;
insert into public.event_participants(event_id,profile_id)
  select id,'61000000-0000-4000-8000-000000000002' from cover_fixtures where kind = 'private';

select set_config('request.jwt.claims','{"role":"anon"}',true);
select set_config('request.headers','{}',true);
set local role anon;
select ok(private.event_cover_storage_allowed((select reservation->>'path' from cover_fixtures where kind = 'public'),'read'),
  'anonymous viewers may obtain current public covers');
select ok(private.event_cover_storage_allowed((select reservation->>'path' from cover_fixtures where kind = 'unlisted'),'read'),
  'unlisted covers follow direct-link detail access');
select ok(not private.event_cover_storage_allowed((select reservation->>'path' from cover_fixtures where kind = 'public'),'sign'),
  'anonymous readers cannot bypass the backend lifetime with direct Storage signing');
select ok(not private.event_cover_storage_allowed((select reservation->>'path' from cover_fixtures where kind = 'private'),'read'),
  'a guessed private path does not grant anonymous read access');
select throws_ok($$select public.get_event_cover((select id from cover_fixtures where kind = 'private'))$$,
  'P0002',null,'private cover metadata is concealed from anonymous callers');
select is(public.get_event((select id from cover_fixtures where kind = 'public'))->'cover'->>'kind','custom',
  'public summaries carry safe custom metadata');
select ok((public.get_event((select id from cover_fixtures where kind = 'public'))->'cover'->>'imageUrl') like '/images/%.svg',
  'event metadata carries only its default fallback illustration, never a signed URL');
select ok(not (public.get_event((select id from cover_fixtures where kind = 'public'))->'cover' ? 'path'),
  'event DTO cover metadata never leaks object paths');
reset role;

select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select set_config('request.headers','{"x-rollcall-cover-key":"sql-cover-operation-key-only-not-a-real-key"}',true);
set local role authenticated;
select ok(not private.event_cover_storage_allowed((select reservation->>'path' from cover_fixtures where kind = 'private'),'read'),
  'unrelated real user cannot read private cover even with the backend key');
select ok(not private.event_cover_storage_allowed((select reservation->>'path' from cover_fixtures where kind = 'public'),'insert'),
  'backend operation key alone cannot upload to another host event');
select throws_ok($$select public.reserve_event_cover((select id from cover_fixtures where kind = 'public'))$$,
  'P0002',null,'non-host cannot reserve uploads even when the backend key is present');
select throws_ok($$select public.remove_event_cover((select id from cover_fixtures where kind = 'public'))$$,
  'P0002',null,'non-host cannot remove the host image');
select is(public.pending_event_cover_cleanup((select id from cover_fixtures where kind = 'public')),'[]'::jsonb,
  'cross-user cleanup never reveals another host object paths');
select throws_ok($$select public.get_event_cover((select id from cover_fixtures where kind = 'private'))$$,
  'P0002',null,'private metadata remains concealed from authenticated outsiders');
reset role;

select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select set_config('request.headers','{}',true);
set local role authenticated;
select ok(private.event_cover_storage_allowed((select reservation->>'path' from cover_fixtures where kind = 'private'),'read'),
  'existing private participant may read the current private cover');
select ok(not private.event_cover_storage_allowed((select reservation->>'path' from cover_fixtures where kind = 'private'),'sign'),
  'private participant cannot mint long-lived direct Storage signed URLs');
select is(public.get_event_cover((select id from cover_fixtures where kind = 'private'))->>'visibility','private',
  'authorized participant can retrieve private cover metadata for signing');
select lives_ok($$select public.leave_event((select id from cover_fixtures where kind = 'private'))$$,
  'existing participant may leave the private event');
select ok(not private.event_cover_storage_allowed((select reservation->>'path' from cover_fixtures where kind = 'private'),'read'),
  'leaving immediately revokes newly authorized Storage access');
select throws_ok($$select public.get_event_cover((select id from cover_fixtures where kind = 'private'))$$,
  'P0002',null,'former private participant cannot obtain another signed image capability');
reset role;

select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('request.headers','{"x-rollcall-cover-key":"sql-cover-operation-key-only-not-a-real-key"}',true);
set local role authenticated;
select lives_ok($$select public.update_event((select id from cover_fixtures where kind = 'public'),'{"coverStoragePath":null,"title":"A harmless metadata edit"}')$$,
  'legacy null cover marker permits a normal event update');
select is(public.get_event((select id from cover_fixtures where kind = 'public'))->'cover'->>'kind','custom',
  'normal metadata updates preserve the active custom cover');
select lives_ok($$select public.abort_event_cover(id,reservation->>'path') from cover_fixtures where kind = 'public'$$,
  'abort after a lost commit acknowledgement is an idempotent no-op');
select ok(not private.event_cover_storage_allowed((select reservation->>'path' from cover_fixtures where kind = 'public'),'delete'),
  'an acknowledged or ambiguously acknowledged active image is never deletable');
select throws_ok($$select public.complete_event_cover_cleanup(reservation->>'path') from cover_fixtures where kind = 'public'$$,
  '22023',null,'cleanup completion cannot retire an active image');
select is(public.remove_event_cover((select id from cover_fixtures where kind = 'private'))->'cover'->>'kind','default',
  'removal atomically restores the category fallback');
select ok(private.event_cover_storage_allowed((select reservation->>'path' from cover_fixtures where kind = 'private'),'delete'),
  'removed image becomes eligible for narrowly scoped Storage deletion');
select ok(not private.event_cover_storage_allowed((select reservation->>'path' from cover_fixtures where kind = 'private'),'read'),
  'removed image cannot receive newly issued read access');
select lives_ok($$select public.complete_event_cover_cleanup(reservation->>'path') from cover_fixtures where kind = 'private'$$,
  'cleanup completion is safe when the physical object is absent');
select lives_ok($$select public.complete_event_cover_cleanup(reservation->>'path') from cover_fixtures where kind = 'private'$$,
  'cleanup completion can be retried idempotently');
insert into cover_fixtures(kind,id,reservation) select 'expired',id,public.reserve_event_cover(id)
  from cover_fixtures where kind = 'public';
reset role;
update private.event_cover_objects set created_at = clock_timestamp() - interval '16 minutes'
  where path = (select reservation->>'path' from cover_fixtures where kind = 'expired');
set local role authenticated;
select ok(not private.event_cover_storage_allowed((select reservation->>'path' from cover_fixtures where kind = 'expired'),'insert'),
  'expired pending reservations cannot authorize late uploads');
select throws_ok($$select public.commit_event_cover(id,reservation->>'path') from cover_fixtures where kind = 'expired'$$,
  '22023',null,'expired reservations cannot be attached');
select ok(public.pending_event_cover_cleanup((select id from cover_fixtures where kind = 'public')) @>
    jsonb_build_array((select reservation from cover_fixtures where kind = 'expired')),
  'bounded cleanup recovers expired uploads using their original registered path');
select set_config('request.headers','{}',true);
select lives_ok($$select public.delete_event((select id from cover_fixtures where kind = 'public'))$$,
  'ordinary authorized event deletion still succeeds without a cover key');
select set_config('request.headers','{"x-rollcall-cover-key":"sql-cover-operation-key-only-not-a-real-key"}',true);
select ok(private.event_cover_storage_allowed((select reservation->>'path' from cover_fixtures where kind = 'public'),'delete'),
  'event deletion leaves a recoverable host-owned cleanup reservation');
select ok(public.pending_event_cover_cleanup((select id from cover_fixtures where kind = 'public')) @>
    jsonb_build_array((select reservation from cover_fixtures where kind = 'public')),
  'cleanup remains scoped to original host after event row deletion');
select lives_ok($$select public.complete_event_cover_cleanup(reservation->>'path') from cover_fixtures where kind = 'public'$$,
  'deleted-event cleanup completes without resurrecting an event');
reset role;
select is((select state from private.event_cover_objects where path =
    (select reservation->>'path' from cover_fixtures where kind = 'public')),'deleted',
  'cleanup retains only a recoverable per-path tombstone');
select * from finish();
rollback;
