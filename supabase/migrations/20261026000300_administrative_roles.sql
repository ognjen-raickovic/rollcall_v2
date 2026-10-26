begin;

create role rollcall_admin_executor nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant rollcall_admin_executor to current_user;
grant usage on schema public, private, auth to rollcall_admin_executor;
grant select on public.profiles, private.account_roles to rollcall_admin_executor;
grant select(id,email_confirmed_at) on auth.users to rollcall_admin_executor;
grant insert(profile_id,role,assigned_by), update(role,assigned_by) on private.account_roles to rollcall_admin_executor;
grant execute on function private.event_api_actor() to rollcall_admin_executor;
create policy admin_profile_read on public.profiles for select to rollcall_admin_executor using(true);
create policy admin_role_read on private.account_roles for select to rollcall_admin_executor using(true);
create policy admin_role_insert on private.account_roles for insert to rollcall_admin_executor with check(true);
create policy admin_role_update on private.account_roles for update to rollcall_admin_executor using(true) with check(true);

-- Identity snapshots intentionally survive account deletion. No private account fields.
create table private.role_audit (
 id bigint generated always as identity primary key,
 actor_id uuid,
 target_id uuid not null,
 previous_role text not null check(previous_role in ('user','admin','superadmin')),
 new_role text not null check(new_role in ('user','admin','superadmin')),
 action text not null check(action in ('bootstrap','promote','demote')),
 source text not null check(source in ('local_operator','authenticated_superadmin')),
 created_at timestamptz not null default clock_timestamp(),
 check(previous_role<>new_role),
 check((action='bootstrap' and actor_id is null and source='local_operator' and new_role='superadmin')
   or (action in ('promote','demote') and actor_id is not null and actor_id<>target_id
       and source='authenticated_superadmin' and new_role in ('user','admin')))
);
create index role_audit_target_idx on private.role_audit(target_id,id desc);
alter table private.role_audit enable row level security;
revoke all on private.role_audit from public,anon,authenticated,service_role;
grant select,insert on private.role_audit to rollcall_admin_executor;
grant usage on sequence private.role_audit_id_seq to rollcall_admin_executor;
create policy admin_audit_read on private.role_audit for select to rollcall_admin_executor using(true);
create policy admin_audit_insert on private.role_audit for insert to rollcall_admin_executor with check(true);
create function private.reject_audit_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='42501',message='Role audit is append-only.'; end; $$;
revoke all on function private.reject_audit_mutation() from public,anon,authenticated,service_role;
create trigger immutable_role_audit before update or delete on private.role_audit
 for each row execute function private.reject_audit_mutation();
create trigger immutable_role_audit_truncate before truncate on private.role_audit
 for each statement execute function private.reject_audit_mutation();

create function private.admin_actor() returns uuid language plpgsql security invoker set search_path='' as $$
declare actor uuid:=private.event_api_actor();
begin
 if actor is null or not exists(select 1 from auth.users u join public.profiles p on p.id=u.id
   where u.id=actor and u.email_confirmed_at is not null) then
   raise exception using errcode='42501',message='Verified account required.';
 end if;
 return actor;
end; $$;
create function private.effective_role(p_actor uuid) returns text language sql stable security invoker set search_path='' as $$
 select coalesce((select case when role in ('admin','superadmin') then role else 'user' end
   from private.account_roles where profile_id=p_actor),'user');
$$;
create function private.require_admin(p_manage boolean) returns uuid language plpgsql security invoker set search_path='' as $$
declare actor uuid:=private.admin_actor(); assigned text:=private.effective_role(actor);
begin
 if assigned<>'superadmin' and (p_manage or assigned<>'admin') then
   raise exception using errcode='42501',message='Administrative permission required.';
 end if;
 return actor;
end; $$;

create function private.my_permissions() returns jsonb language plpgsql security definer set search_path='' as $$
declare assigned text:=private.effective_role(private.admin_actor());
begin
 return jsonb_build_object('role',assigned,'capabilities',jsonb_build_object(
   'accessAdmin',assigned in ('admin','superadmin'),'manageAdminRoles',assigned='superadmin'));
end; $$;

create function private.admin_users(p_limit integer,p_after uuid,p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_admin(true);
 if p_limit is null or p_limit not between 1 and 50 then raise exception using errcode='22023',message='Invalid page size.'; end if;
 with page as (
  select p.id,p.display_name,p.created_at,private.effective_role(p.id) as role
  from public.profiles p join auth.users u on u.id=p.id and u.email_confirmed_at is not null
  where (p_after is null or p.id>p_after) and (p_user_id is null or p.id=p_user_id)
  order by p.id limit p_limit+1
 ), numbered as (select *,row_number() over(order by id) as n from page)
 select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',id,'displayName',display_name,
  'createdAt',created_at,'role',role) order by id) filter(where n<=p_limit),'[]'::jsonb),
  'nextCursor',case when count(*)>p_limit then (array_agg(id order by id))[p_limit] else null end)
 into result from numbered;
 return result;
end; $$;

create function private.change_admin_role(p_target uuid,p_role text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; previous text;
begin
 -- Bootstrap and all role mutations share this lock. Check the caller AFTER acquiring it.
 perform pg_catalog.pg_advisory_xact_lock(82631,51);
 actor:=private.require_admin(true);
 if p_target is null or p_target=actor or p_role is null or p_role not in ('user','admin') then
  raise exception using errcode='22023',message='Unsupported role change.';
 end if;
 if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
  where p.id=p_target and u.email_confirmed_at is not null) then
  raise exception using errcode='P0002',message='Account not found.';
 end if;
 previous:=private.effective_role(p_target);
 if previous='superadmin' then raise exception using errcode='22023',message='Superadmin roles require a reviewed maintenance procedure.'; end if;
 if previous<>p_role then
  insert into private.account_roles(profile_id,role,assigned_by) values(p_target,p_role,actor)
   on conflict(profile_id) do update set role=excluded.role,assigned_by=excluded.assigned_by;
  insert into private.role_audit(actor_id,target_id,previous_role,new_role,action,source)
   values(actor,p_target,previous,p_role,case when p_role='admin' then 'promote' else 'demote' end,'authenticated_superadmin');
 end if;
 return jsonb_build_object('id',p_target,'role',p_role,'changed',previous<>p_role);
end; $$;

create function private.admin_audit(p_limit integer,p_before bigint,p_target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_admin(true);
 if p_limit is null or p_limit not between 1 and 50 or (p_before is not null and p_before<=0) then
  raise exception using errcode='22023',message='Invalid audit page.';
 end if;
 with page as (select * from private.role_audit where (p_before is null or id<p_before)
  and (p_target is null or target_id=p_target) order by id desc limit p_limit+1),
 numbered as (select *,row_number() over(order by id desc) as n from page)
 select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',id::text,'actorId',actor_id,
  'targetId',target_id,'previousRole',previous_role,'newRole',new_role,'action',action,'source',source,
  'createdAt',created_at) order by id desc) filter(where n<=p_limit),'[]'::jsonb),
  'nextCursor',case when count(*)>p_limit then ((array_agg(id order by id desc))[p_limit])::text else null end)
 into result from numbered;
 return result;
end; $$;

-- Trusted maintenance only. No HTTP endpoint and no client EXECUTE grant.
create function private.bootstrap_superadmin(p_target uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare previous text;
begin
 perform pg_catalog.pg_advisory_xact_lock(82631,51);
 if exists(select 1 from private.account_roles where role='superadmin') or exists(select 1 from private.role_audit where action='bootstrap') then
  raise exception using errcode='23505',message='Superadmin initialization already completed.';
 end if;
 if p_target is null or not exists(select 1 from auth.users u join public.profiles p on p.id=u.id
  where u.id=p_target and u.email_confirmed_at is not null) then
  raise exception using errcode='22023',message='An existing confirmed account is required.';
 end if;
 previous:=private.effective_role(p_target);
 insert into private.account_roles(profile_id,role,assigned_by) values(p_target,'superadmin',null)
 on conflict(profile_id) do update set role='superadmin',assigned_by=null;
 insert into private.role_audit(actor_id,target_id,previous_role,new_role,action,source)
 values(null,p_target,previous,'superadmin','bootstrap','local_operator');
end; $$;
revoke all on function private.bootstrap_superadmin(uuid) from public,anon,authenticated,service_role;

grant create on schema private to rollcall_admin_executor;
alter function private.admin_actor() owner to rollcall_admin_executor;
alter function private.effective_role(uuid) owner to rollcall_admin_executor;
alter function private.require_admin(boolean) owner to rollcall_admin_executor;
alter function private.my_permissions() owner to rollcall_admin_executor;
alter function private.admin_users(integer,uuid,uuid) owner to rollcall_admin_executor;
alter function private.change_admin_role(uuid,text) owner to rollcall_admin_executor;
alter function private.admin_audit(integer,bigint,uuid) owner to rollcall_admin_executor;
revoke create on schema private from rollcall_admin_executor;
revoke all on function private.admin_actor(),private.effective_role(uuid),private.require_admin(boolean),
 private.my_permissions(),private.admin_users(integer,uuid,uuid),private.change_admin_role(uuid,text),
 private.admin_audit(integer,bigint,uuid) from public,anon,authenticated,service_role;
grant execute on function private.my_permissions(),private.admin_users(integer,uuid,uuid),
 private.change_admin_role(uuid,text),private.admin_audit(integer,bigint,uuid) to authenticated;

create function public.my_permissions() returns jsonb language sql security invoker set search_path=''
 as $$ select private.my_permissions(); $$;
create function public.admin_users(p_limit integer default 20,p_after uuid default null,p_user_id uuid default null)
 returns jsonb language sql security invoker set search_path='' as $$ select private.admin_users(p_limit,p_after,p_user_id); $$;
create function public.change_admin_role(p_target uuid,p_role text) returns jsonb language sql security invoker set search_path=''
 as $$ select private.change_admin_role(p_target,p_role); $$;
create function public.admin_role_audit(p_limit integer default 20,p_before bigint default null,p_target uuid default null)
 returns jsonb language sql security invoker set search_path='' as $$ select private.admin_audit(p_limit,p_before,p_target); $$;
revoke all on function public.my_permissions(),public.admin_users(integer,uuid,uuid),public.change_admin_role(uuid,text),
 public.admin_role_audit(integer,bigint,uuid) from public,anon,authenticated,service_role;
grant execute on function public.my_permissions(),public.admin_users(integer,uuid,uuid),public.change_admin_role(uuid,text),
 public.admin_role_audit(integer,bigint,uuid) to authenticated;
revoke rollcall_admin_executor from current_user;
notify pgrst,'reload schema';
commit;
