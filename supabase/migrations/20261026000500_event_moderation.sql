begin;
create role rollcall_moderation_executor nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant rollcall_moderation_executor to current_user;
grant rollcall_admin_executor to current_user;
grant usage on schema public,private to rollcall_moderation_executor;
grant execute on function private.confirmed_admin_actor(),private.my_permissions() to rollcall_moderation_executor;
grant select(id,host_id,visibility,title,game_id,starts_at,status),update(status) on public.events to rollcall_moderation_executor;
grant select(event_id,profile_id) on public.event_participants to rollcall_moderation_executor;
grant select(id,name) on public.games to rollcall_moderation_executor;
grant execute on function private.valid_event_tags(text[],text) to rollcall_moderation_executor;
create policy moderation_games_read on public.games for select to rollcall_moderation_executor using(true);
create policy moderation_event_read on public.events for select to rollcall_moderation_executor using(true);
create policy moderation_event_cancel on public.events for update to rollcall_moderation_executor using(true) with check(status='cancelled');
create policy moderation_members_read on public.event_participants for select to rollcall_moderation_executor
 using(profile_id=private.confirmed_admin_actor());

create table private.event_reports (
 id uuid primary key default gen_random_uuid(),
 event_id uuid references public.events(id) on delete set null,
 target_event_id uuid not null,
 reporter_id uuid references public.profiles(id) on delete set null,
 reason text not null check(reason in ('inappropriate','spam','harassment','unsafe','other')),
 description text check(char_length(description) between 1 and 1000 and description=btrim(description)),
 event_context jsonb not null,
 status text not null default 'open' check(status in ('open','dismissed','actioned')),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 resolved_at timestamptz,
 resolved_by uuid,
 resolution_note text check(char_length(resolution_note) between 5 and 500),
 check(event_id is null or event_id=target_event_id),
 check((status='open' and resolved_at is null and resolved_by is null and resolution_note is null)
  or (status<>'open' and resolved_at is not null and resolved_by is not null and resolution_note is not null))
);
create unique index event_reports_unresolved_idx on private.event_reports(target_event_id,reporter_id)
 where status='open' and reporter_id is not null;
create index event_reports_queue_idx on private.event_reports(status,created_at desc,id desc);
create index event_reports_event_idx on private.event_reports(event_id);
create index event_reports_reporter_idx on private.event_reports(reporter_id);
create table private.event_report_attempts (
 account_id uuid primary key references public.profiles(id) on delete cascade,
 window_start timestamptz not null,
 attempts integer not null check(attempts>0)
);
create table private.moderation_audit (
 id bigint generated always as identity primary key,
 report_id uuid not null references private.event_reports(id) on delete restrict,
 target_event_id uuid not null,
 actor_id uuid not null,
 action text not null check(action in ('dismiss','cancel_event')),
 previous_status text not null check(previous_status='open'),
 new_status text not null check(new_status in ('dismissed','actioned')),
 explanation text not null check(char_length(explanation) between 5 and 500),
 event_changed boolean not null,
 created_at timestamptz not null default clock_timestamp(),
 check((action='dismiss' and new_status='dismissed' and not event_changed)
  or (action='cancel_event' and new_status='actioned'))
);
create index moderation_audit_report_idx on private.moderation_audit(report_id,id);
create index moderation_audit_event_idx on private.moderation_audit(target_event_id) where action='cancel_event';
alter table private.event_reports enable row level security;
alter table private.event_report_attempts enable row level security;
alter table private.moderation_audit enable row level security;
revoke all on private.event_reports,private.event_report_attempts,private.moderation_audit from public,anon,authenticated,service_role;
grant select,insert,update on private.event_reports,private.event_report_attempts to rollcall_moderation_executor;
grant select,insert on private.moderation_audit to rollcall_moderation_executor;
grant usage on sequence private.moderation_audit_id_seq to rollcall_moderation_executor;
create policy moderation_reports_executor on private.event_reports to rollcall_moderation_executor using(true) with check(true);
create policy moderation_attempts_executor on private.event_report_attempts to rollcall_moderation_executor using(true) with check(true);
create policy moderation_audit_read on private.moderation_audit for select to rollcall_moderation_executor using(true);
create policy moderation_audit_insert on private.moderation_audit for insert to rollcall_moderation_executor with check(true);
create trigger immutable_moderation_audit before update or delete on private.moderation_audit
 for each row execute function private.reject_audit_mutation();
create trigger immutable_moderation_audit_truncate before truncate on private.moderation_audit
 for each statement execute function private.reject_audit_mutation();

create function private.moderation_actor() returns uuid language plpgsql security invoker set search_path='' as $$
declare actor uuid:=private.confirmed_admin_actor(); permissions jsonb:=private.my_permissions();
begin
 if not coalesce((permissions#>>'{capabilities,accessAdmin}')::boolean,false) then
  raise exception using errcode='42501',message='Moderation permission required.';
 end if;
 return actor;
end; $$;

create function private.submit_event_report(p_event_id uuid,p_reason text,p_description text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.confirmed_admin_actor(); item record; previous uuid; used integer; report uuid;
 cleaned text:=nullif(btrim(p_description),'');
begin
 if p_event_id is null or p_reason is null or p_reason not in ('inappropriate','spam','harassment','unsafe','other')
  or char_length(cleaned)>1000 or translate(cleaned,E'\n\r\t','') ~ '[[:cntrl:]]' then
  raise exception using errcode='22023',message='Invalid report input.';
 end if;
 -- Commit attempts even for inaccessible events. Data outcomes avoid rolling back throttles.
 insert into private.event_report_attempts(account_id,window_start,attempts) values(actor,clock_timestamp(),1)
 on conflict(account_id) do update set
  attempts=case when private.event_report_attempts.window_start<=clock_timestamp()-interval '15 minutes' then 1 else private.event_report_attempts.attempts+1 end,
  window_start=case when private.event_report_attempts.window_start<=clock_timestamp()-interval '15 minutes' then clock_timestamp() else private.event_report_attempts.window_start end
 returning attempts into used;
 if used>10 then return jsonb_build_object('status','limited'); end if;
 select id,host_id,visibility,title,game_id,starts_at,status into item from public.events where id=p_event_id for update;
 if not found then return jsonb_build_object('status','unavailable'); end if;
 if item.visibility='private' and item.host_id<>actor and not exists(
  select 1 from public.event_participants where event_id=item.id and profile_id=actor) then
  return jsonb_build_object('status','unavailable');
 end if;
 select id into previous from private.event_reports where target_event_id=item.id and reporter_id=actor and status='open';
 if previous is not null then return jsonb_build_object('status','accepted','id',previous,'created',false); end if;
 insert into private.event_reports(event_id,target_event_id,reporter_id,reason,description,event_context)
 values(item.id,item.id,actor,p_reason,cleaned,jsonb_build_object('title',item.title,
  'game',(select name from public.games where id=item.game_id),'startsAt',item.starts_at,'visibility',item.visibility))
 returning id into report;
 return jsonb_build_object('status','accepted','id',report,'created',true);
end; $$;

create function private.report_projection(item private.event_reports) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',item.id,'eventId',item.target_event_id,'eventAvailable',item.event_id is not null,
 'eventContext',item.event_context,'eventStatus',(select status from public.events where id=item.event_id),
 'reason',item.reason,'description',item.description,'status',item.status,'createdAt',item.created_at,'updatedAt',item.updated_at,
 'resolvedAt',item.resolved_at,'resolutionNote',item.resolution_note);
$$;

create function private.list_event_reports(p_status text,p_limit integer,p_before_time timestamptz,p_before_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.moderation_actor();
 if p_limit is null or p_limit not between 1 and 50 or p_status is null or p_status not in ('open','dismissed','actioned','all')
  or ((p_before_time is null)<>(p_before_id is null)) then raise exception using errcode='22023',message='Invalid report page.'; end if;
 with page as (select r.* from private.event_reports r where (p_status='all' or status=p_status)
  and (p_before_time is null or (created_at,id)<(p_before_time,p_before_id)) order by created_at desc,id desc limit p_limit+1),
 numbered as(select page.*,row_number() over(order by created_at desc,id desc) as n from page)
 select jsonb_build_object('items',coalesce(jsonb_agg(private.report_projection(original) order by r.created_at desc,r.id desc)
   filter(where n<=p_limit),'[]'::jsonb),'nextCursor',case when count(*)>p_limit then
   jsonb_build_object('createdAt',(array_agg(r.created_at order by r.created_at desc,r.id desc))[p_limit],
    'id',(array_agg(r.id order by r.created_at desc,r.id desc))[p_limit]) else null end)
 into result from numbered r join private.event_reports original on original.id=r.id;
 return result;
end; $$;

create function private.get_event_report(p_report_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare item private.event_reports%rowtype; result jsonb;
begin
 perform private.moderation_actor();
 select * into item from private.event_reports where id=p_report_id;
 if not found then raise exception using errcode='P0002',message='Report not found.'; end if;
 result:=private.report_projection(item);
 return result||jsonb_build_object('history',coalesce((select jsonb_agg(jsonb_build_object('id',id::text,
  'actorId',actor_id,'action',action,'previousStatus',previous_status,'newStatus',new_status,
  'explanation',explanation,'eventChanged',event_changed,'createdAt',created_at) order by id)
  from private.moderation_audit where report_id=item.id),'[]'::jsonb));
end; $$;

create function private.resolve_event_report(p_report_id uuid,p_action text,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; target uuid; event_state text; item private.event_reports%rowtype;
 next_status text; changed boolean:=false; note text:=btrim(p_note);
begin
 -- Shared with role changes: a demotion committed first prevents this operation.
 perform pg_catalog.pg_advisory_xact_lock_shared(82631,51);
 actor:=private.moderation_actor();
 if p_action is null or p_action not in ('dismiss','cancel_event') or note is null
  or char_length(note) not between 5 and 500 or note ~ '[[:cntrl:]]' then
  raise exception using errcode='22023',message='Invalid moderation decision.';
 end if;
 select target_event_id into target from private.event_reports where id=p_report_id;
 if not found then raise exception using errcode='P0002',message='Report not found.'; end if;
 -- Same parent-first lock order as attendance, reporting and event deletion (FK SET NULL).
 select status into event_state from public.events where id=target for update;
 select * into item from private.event_reports where id=p_report_id for update;
 next_status:=case when p_action='dismiss' then 'dismissed' else 'actioned' end;
 if item.status=next_status then return jsonb_build_object('id',item.id,'eventId',target,'status',item.status,'changed',false); end if;
 if item.status<>'open' then raise exception using errcode='P0001',message='Report is already resolved.'; end if;
 if p_action='cancel_event' and (item.event_id is null or event_state is null) then
  raise exception using errcode='P0001',message='The reported event has been deleted. Dismiss the report instead.';
 end if;
 if p_action='cancel_event' then
  changed:=event_state<>'cancelled';
 end if;
 insert into private.moderation_audit(report_id,target_event_id,actor_id,action,previous_status,new_status,explanation,event_changed)
 values(item.id,target,actor,p_action,item.status,next_status,note,changed);
 if changed then update public.events set status='cancelled' where id=target; end if;
 update private.event_reports set status=next_status,resolved_by=actor,resolved_at=clock_timestamp(),
  resolution_note=note,updated_at=clock_timestamp() where id=item.id;
 return jsonb_build_object('id',item.id,'eventId',target,'status',next_status,'changed',true);
end; $$;

create function private.prevent_moderated_reactivation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status<>'cancelled' and exists(select 1 from private.moderation_audit where target_event_id=new.id and action='cancel_event') then
  raise exception using errcode='RM001',message='Administratively cancelled events cannot be reactivated.';
 end if;
 return new;
end; $$;
create trigger prevent_moderated_reactivation before update of status on public.events
 for each row execute function private.prevent_moderated_reactivation();

grant create on schema private to rollcall_moderation_executor;
alter function private.moderation_actor() owner to rollcall_moderation_executor;
alter function private.submit_event_report(uuid,text,text) owner to rollcall_moderation_executor;
alter function private.report_projection(private.event_reports) owner to rollcall_moderation_executor;
alter function private.list_event_reports(text,integer,timestamptz,uuid) owner to rollcall_moderation_executor;
alter function private.get_event_report(uuid) owner to rollcall_moderation_executor;
alter function private.resolve_event_report(uuid,text,text) owner to rollcall_moderation_executor;
alter function private.prevent_moderated_reactivation() owner to rollcall_moderation_executor;
revoke create on schema private from rollcall_moderation_executor;
revoke all on function private.moderation_actor(),private.submit_event_report(uuid,text,text),
 private.report_projection(private.event_reports),private.list_event_reports(text,integer,timestamptz,uuid),
 private.get_event_report(uuid),private.resolve_event_report(uuid,text,text),private.prevent_moderated_reactivation()
 from public,anon,authenticated,service_role;
grant execute on function private.submit_event_report(uuid,text,text),private.list_event_reports(text,integer,timestamptz,uuid),
 private.get_event_report(uuid),private.resolve_event_report(uuid,text,text) to authenticated;
create function public.submit_event_report(p_event_id uuid,p_reason text,p_description text default null) returns jsonb
 language sql security invoker set search_path='' as $$ select private.submit_event_report(p_event_id,p_reason,p_description); $$;
create function public.list_event_reports(p_status text default 'open',p_limit integer default 20,p_before_time timestamptz default null,p_before_id uuid default null) returns jsonb
 language sql security invoker set search_path='' as $$ select private.list_event_reports(p_status,p_limit,p_before_time,p_before_id); $$;
create function public.get_event_report(p_report_id uuid) returns jsonb
 language sql security invoker set search_path='' as $$ select private.get_event_report(p_report_id); $$;
create function public.resolve_event_report(p_report_id uuid,p_action text,p_note text) returns jsonb
 language sql security invoker set search_path='' as $$ select private.resolve_event_report(p_report_id,p_action,p_note); $$;
revoke all on function public.submit_event_report(uuid,text,text),public.list_event_reports(text,integer,timestamptz,uuid),
 public.get_event_report(uuid),public.resolve_event_report(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.submit_event_report(uuid,text,text),public.list_event_reports(text,integer,timestamptz,uuid),
 public.get_event_report(uuid),public.resolve_event_report(uuid,text,text) to authenticated;
revoke rollcall_moderation_executor from current_user;
revoke rollcall_admin_executor from current_user;
notify pgrst,'reload schema';
commit;
