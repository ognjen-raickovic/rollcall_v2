begin;
create role rollcall_status_executor nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant rollcall_status_executor,rollcall_admin_executor,rollcall_events_executor to current_user;
grant usage on schema public,private to rollcall_status_executor;
grant select(id,display_name) on public.profiles to rollcall_status_executor;
grant select(profile_id,role) on private.account_roles to rollcall_status_executor;
create policy status_profiles_read on public.profiles for select to rollcall_status_executor using(true);
create policy status_roles_read on private.account_roles for select to rollcall_status_executor using(true);
grant execute on function private.effective_role(uuid) to rollcall_status_executor;

create table private.account_suspensions (
 profile_id uuid primary key references public.profiles(id) on delete cascade,
 status text not null check(status in ('active','suspended')),
 suspended_at timestamptz not null,
 suspended_by uuid not null,
 suspension_reason text not null check(char_length(suspension_reason) between 5 and 500),
 reinstated_at timestamptz,
 reinstated_by uuid,
 reinstatement_reason text check(char_length(reinstatement_reason) between 5 and 500),
 check((status='suspended' and reinstated_at is null and reinstated_by is null and reinstatement_reason is null)
  or (status='active' and reinstated_at is not null and reinstated_by is not null and reinstatement_reason is not null))
);
create table private.suspension_audit (
 id bigint generated always as identity primary key,
 actor_id uuid not null,
 target_id uuid not null,
 action text not null check(action in ('suspend','reinstate')),
 previous_status text not null check(previous_status in ('active','suspended')),
 new_status text not null check(new_status in ('active','suspended')),
 reason text not null check(char_length(reason) between 5 and 500),
 created_at timestamptz not null default clock_timestamp(),
 check(actor_id<>target_id),
 check((action='suspend' and previous_status='active' and new_status='suspended')
  or (action='reinstate' and previous_status='suspended' and new_status='active'))
);
create index suspension_audit_target_idx on private.suspension_audit(target_id,id desc);
alter table private.account_suspensions enable row level security;
alter table private.suspension_audit enable row level security;
revoke all on private.account_suspensions,private.suspension_audit from public,anon,authenticated,service_role;
grant select,insert,update on private.account_suspensions to rollcall_status_executor;
grant select,insert on private.suspension_audit to rollcall_status_executor;
grant usage on sequence private.suspension_audit_id_seq to rollcall_status_executor;
create policy status_state_executor on private.account_suspensions to rollcall_status_executor using(true) with check(true);
create policy status_audit_read on private.suspension_audit for select to rollcall_status_executor using(true);
create policy status_audit_insert on private.suspension_audit for insert to rollcall_status_executor with check(true);
create trigger immutable_suspension_audit before update or delete on private.suspension_audit
 for each row execute function private.reject_audit_mutation();
create trigger immutable_suspension_audit_truncate before truncate on private.suspension_audit
 for each statement execute function private.reject_audit_mutation();

-- Narrow identity resolver, separate from the application-active resolver. Auth owns
-- its schema; no raw Auth grant is given to the status executor. Anonymous = null.
create function private.account_status_actor() returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is null then return null; end if;
 if not exists(select 1 from auth.users u join public.profiles p on p.id=u.id
  where u.id=actor and u.email_confirmed_at is not null) then
  raise exception using errcode='42501',message='Verified account required.';
 end if;
 return actor;
end; $$;
revoke all on function private.account_status_actor() from public,anon,authenticated,service_role;
grant execute on function private.account_status_actor() to rollcall_status_executor;

create function private.require_active_account() returns uuid language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=private.account_status_actor();
begin
 if actor is null then return null; end if;
 -- Always role-lock first, then account-lock, then existing event/report/Storage locks.
 perform pg_catalog.pg_advisory_xact_lock_shared(82631,51);
 perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(actor::text,8263152));
 if exists(select 1 from private.account_suspensions where profile_id=actor and status='suspended') then
  raise exception using errcode='PT403',message='ACCOUNT_SUSPENDED';
 end if;
 return actor;
end; $$;
grant create on schema private to rollcall_status_executor;
alter function private.require_active_account() owner to rollcall_status_executor;
revoke create on schema private from rollcall_status_executor;
revoke all on function private.require_active_account() from public,anon,authenticated,service_role;
grant execute on function private.require_active_account() to anon,authenticated,rollcall_events_executor,
 rollcall_admin_executor,rollcall_invitation_executor,rollcall_moderation_executor,current_user;

-- All existing event/invitation/Storage actor resolution now checks live status.
create or replace function private.event_api_actor() returns uuid language sql volatile security definer set search_path='' as $$
 select private.require_active_account();
$$;
create or replace function private.confirmed_admin_actor() returns uuid language sql volatile security definer set search_path='' as $$
 select private.require_active_account();
$$;
alter function private.event_api_details(uuid) volatile;
alter function private.event_api_get(uuid) volatile;
alter function private.event_api_summary(uuid) volatile;
alter function private.event_api_discover(jsonb) volatile;
alter function private.event_cover_get(uuid) volatile;
alter function private.event_cover_require_operation() volatile;

-- Harden reviewed public RPC entry points before their existing data/row locks.
-- Preserve original owners, signatures, ACLs and implementations. Role mutation is
-- excluded here: it must acquire its exclusive role lock BEFORE the active guard.
do $$
declare item record; definition text; body text;
begin
 for item in select p.oid,p.proname,p.prosrc,p.prorettype,l.lanname from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
  where n.nspname='public' and p.proname in (
   'get_my_profile','update_my_profile','set_my_game_experience','remove_my_game_experience',
   'get_event','create_event','update_event','delete_event','join_event','leave_event',
   'reserve_event_cover','commit_event_cover','remove_event_cover','abort_event_cover',
   'pending_event_cover_cleanup','complete_event_cover_cleanup','get_event_cover',
   'manage_event_invitation','redeem_event_invitation','my_permissions','admin_users','admin_role_audit',
   'submit_event_report','list_event_reports','get_event_report','resolve_event_report')
 loop
  definition:=pg_get_functiondef(item.oid);
  if item.lanname='plpgsql' then
   body:=regexp_replace(item.prosrc,'\mbegin\M',E'begin\n perform private.require_active_account();','i');
  elsif item.lanname='sql' then
   body:=regexp_replace(btrim(item.prosrc),'^\s*select\s+',case when item.prorettype='void'::regtype then 'perform ' else 'return ' end,'i');
   body:=E'begin\n perform private.require_active_account();\n'||body||case when item.prorettype='void'::regtype then E'\n return;' else '' end||E'\nend;';
   definition:=replace(definition,'LANGUAGE sql','LANGUAGE plpgsql');
  else raise exception 'Unexpected application RPC language';
  end if;
  definition:=replace(definition,item.prosrc,body);
  definition:=replace(definition,' STABLE',' VOLATILE');
  execute definition;
 end loop;
end; $$;

-- Direct Data API table writes also require active status; public-safe reads stay public.
alter policy profiles_owner_update on public.profiles using(id=private.require_active_account()) with check(id=private.require_active_account());
alter policy game_experience_owner_insert on public.user_game_experience with check(profile_id=private.require_active_account());
alter policy game_experience_owner_update on public.user_game_experience using(profile_id=private.require_active_account()) with check(profile_id=private.require_active_account());
alter policy game_experience_owner_delete on public.user_game_experience using(profile_id=private.require_active_account());
alter policy private_profile_owner_read on private.profile_private using(profile_id=private.require_active_account());
alter policy private_profile_owner_insert on private.profile_private with check(profile_id=private.require_active_account());
alter policy private_profile_owner_update on private.profile_private using(profile_id=private.require_active_account()) with check(profile_id=private.require_active_account());

create function private.my_account_status() returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=private.account_status_actor();
begin
 if actor is null then raise exception using errcode='42501',message='Authentication required.'; end if;
 return jsonb_build_object('status',coalesce((select status from private.account_suspensions where profile_id=actor),'active'));
end; $$;

create function private.status_moderator() returns uuid language plpgsql volatile security invoker set search_path='' as $$
declare actor uuid:=private.require_active_account();
begin
 if actor is null or private.effective_role(actor) not in ('admin','superadmin') then
  raise exception using errcode='42501',message='Administrative permission required.';
 end if;
 return actor;
end; $$;
create function private.status_target(p_target uuid) returns uuid language plpgsql volatile security invoker set search_path='' as $$
declare actor uuid:=private.status_moderator(); actor_role text:=private.effective_role(actor); target_role text:=private.effective_role(p_target);
begin
 if not exists(select 1 from public.profiles where id=p_target) then raise exception using errcode='P0002',message='Account not found.'; end if;
 if actor=p_target or target_role='superadmin' or (actor_role='admin' and target_role<>'user') then
  raise exception using errcode='42501',message='This account is protected from this moderator.';
 end if;
 return actor;
end; $$;

create function private.suspension_account(p_target uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock_shared(82631,51);
 actor:=private.status_moderator();
 if not exists(select 1 from public.profiles where id=p_target) then raise exception using errcode='P0002',message='Account not found.'; end if;
 return (select jsonb_build_object('id',p.id,'displayName',p.display_name,'role',private.effective_role(p.id),
  'status',coalesce(s.status,'active'),'canManage',p.id<>actor and private.effective_role(p.id)<>'superadmin'
   and (private.effective_role(actor)='superadmin' or private.effective_role(p.id)='user'))
  from public.profiles p left join private.account_suspensions s on s.profile_id=p.id where p.id=p_target);
end; $$;

create function private.change_account_suspension(p_target uuid,p_suspend boolean,p_reason text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid; previous text; next_state text; reason text:=btrim(p_reason);
begin
 perform pg_catalog.pg_advisory_xact_lock_shared(82631,51);
 actor:=private.status_target(p_target);
 if p_suspend is null or reason is null or char_length(reason) not between 5 and 500 or reason ~ '[[:cntrl:]]' then
  raise exception using errcode='22023',message='Use an internal reason of 5 to 500 characters on one line.';
 end if;
 -- Role policy makes actors ineligible targets of one another, preventing cross-account upgrades.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_target::text,8263152));
 previous:=coalesce((select status from private.account_suspensions where profile_id=p_target),'active');
 next_state:=case when p_suspend then 'suspended' else 'active' end;
 if previous=next_state then return jsonb_build_object('id',p_target,'status',previous,'changed',false); end if;
 if p_suspend then
  insert into private.account_suspensions(profile_id,status,suspended_at,suspended_by,suspension_reason)
  values(p_target,'suspended',clock_timestamp(),actor,reason)
  on conflict(profile_id) do update set status='suspended',suspended_at=clock_timestamp(),suspended_by=actor,
   suspension_reason=reason,reinstated_at=null,reinstated_by=null,reinstatement_reason=null;
 else
  update private.account_suspensions set status='active',reinstated_at=clock_timestamp(),reinstated_by=actor,
   reinstatement_reason=reason where profile_id=p_target;
 end if;
 insert into private.suspension_audit(actor_id,target_id,action,previous_status,new_status,reason)
 values(actor,p_target,case when p_suspend then 'suspend' else 'reinstate' end,previous,next_state,reason);
 return jsonb_build_object('id',p_target,'status',next_state,'changed',true);
end; $$;

create function private.get_suspension_audit(p_target uuid,p_limit integer,p_before bigint) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid; result jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock_shared(82631,51);
 actor:=private.status_moderator();
 if p_target is not null then perform private.status_target(p_target);
 elsif private.effective_role(actor)<>'superadmin' then raise exception using errcode='42501',message='Select an eligible target account.'; end if;
 if p_limit is null or p_limit not between 1 and 50 or (p_before is not null and p_before<=0) then raise exception using errcode='22023',message='Invalid audit page.'; end if;
 with page as(select * from private.suspension_audit where (p_target is null or target_id=p_target)
  and (p_before is null or id<p_before) order by id desc limit p_limit+1),
 numbered as(select *,row_number() over(order by id desc) n from page)
 select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',id::text,'actorId',actor_id,'targetId',target_id,
  'action',action,'previousStatus',previous_status,'newStatus',new_status,'reason',reason,'createdAt',created_at) order by id desc)
  filter(where n<=p_limit),'[]'::jsonb),'nextCursor',case when count(*)>p_limit then ((array_agg(id order by id desc))[p_limit])::text else null end)
 into result from numbered;
 return result;
end; $$;

grant create on schema private to rollcall_status_executor;
alter function private.my_account_status() owner to rollcall_status_executor;
alter function private.status_moderator() owner to rollcall_status_executor;
alter function private.status_target(uuid) owner to rollcall_status_executor;
alter function private.suspension_account(uuid) owner to rollcall_status_executor;
alter function private.change_account_suspension(uuid,boolean,text) owner to rollcall_status_executor;
alter function private.get_suspension_audit(uuid,integer,bigint) owner to rollcall_status_executor;
revoke create on schema private from rollcall_status_executor;
revoke all on function private.my_account_status(),private.status_moderator(),private.status_target(uuid),
 private.suspension_account(uuid),private.change_account_suspension(uuid,boolean,text),private.get_suspension_audit(uuid,integer,bigint)
 from public,anon,authenticated,service_role;
grant execute on function private.my_account_status(),private.suspension_account(uuid),
 private.change_account_suspension(uuid,boolean,text),private.get_suspension_audit(uuid,integer,bigint) to authenticated;
create function public.my_account_status() returns jsonb language sql volatile security invoker set search_path='' as $$ select private.my_account_status(); $$;
create function public.suspension_account(p_target uuid) returns jsonb language sql volatile security invoker set search_path='' as $$ select private.suspension_account(p_target); $$;
create function public.change_account_suspension(p_target uuid,p_suspend boolean,p_reason text) returns jsonb language sql volatile security invoker set search_path='' as $$ select private.change_account_suspension(p_target,p_suspend,p_reason); $$;
create function public.get_suspension_audit(p_target uuid default null,p_limit integer default 20,p_before bigint default null) returns jsonb language sql volatile security invoker set search_path='' as $$ select private.get_suspension_audit(p_target,p_limit,p_before); $$;
revoke all on function public.my_account_status(),public.suspension_account(uuid),public.change_account_suspension(uuid,boolean,text),
 public.get_suspension_audit(uuid,integer,bigint) from public,anon,authenticated,service_role;
grant execute on function public.my_account_status(),public.suspension_account(uuid),public.change_account_suspension(uuid,boolean,text),
 public.get_suspension_audit(uuid,integer,bigint) to authenticated;
revoke rollcall_status_executor,rollcall_admin_executor,rollcall_events_executor from current_user;
notify pgrst,'reload schema';
commit;
