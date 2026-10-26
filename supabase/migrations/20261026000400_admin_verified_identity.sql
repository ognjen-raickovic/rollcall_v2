begin;
-- Supabase owns auth separately: executors receive no raw Auth access. This narrow,
-- argument-free resolver returns only the current confirmed UUID, never Auth metadata.
create or replace function private.confirmed_admin_actor() returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is null or not exists(select 1 from auth.users u join public.profiles p on p.id=u.id
   where u.id=actor and u.email_confirmed_at is not null) then
  raise exception using errcode='42501',message='Verified account required.';
 end if;
 return actor;
end; $$;
revoke all on function private.confirmed_admin_actor() from public,anon,authenticated,service_role;
grant execute on function private.confirmed_admin_actor() to rollcall_admin_executor;
create or replace function private.admin_account_confirmed(p_target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=p_target and email_confirmed_at is not null);
$$;
revoke all on function private.admin_account_confirmed(uuid) from public,anon,authenticated,service_role;
grant execute on function private.admin_account_confirmed(uuid) to rollcall_admin_executor;
grant rollcall_admin_executor to current_user;
create or replace function private.admin_actor() returns uuid
language sql security invoker set search_path='' as $$ select private.confirmed_admin_actor(); $$;
revoke select(id,email_confirmed_at) on auth.users from rollcall_admin_executor;
-- Retain legacy local cleanup where delegation is available. Hosted postgres may
-- not revoke managed schema grants; fail closed if unexpected access remains.
do $$
begin
 if has_schema_privilege(current_user,'auth','USAGE WITH GRANT OPTION') then
  revoke usage on schema auth from rollcall_admin_executor;
 end if;
 if has_schema_privilege('rollcall_admin_executor','auth','USAGE') then
  raise exception 'Admin executor must not have managed Auth schema access.';
 end if;
end; $$;

create or replace function private.admin_users(p_limit integer,p_after uuid,p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_admin(true);
 if p_limit is null or p_limit not between 1 and 50 then raise exception using errcode='22023',message='Invalid page size.'; end if;
 with page as (
  select p.id,p.display_name,p.created_at,private.effective_role(p.id) as role
  from public.profiles p where private.admin_account_confirmed(p.id)
  and (p_after is null or p.id>p_after) and (p_user_id is null or p.id=p_user_id)
  order by p.id limit p_limit+1
 ), numbered as (select *,row_number() over(order by id) as n from page)
 select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',id,'displayName',display_name,
  'createdAt',created_at,'role',role) order by id) filter(where n<=p_limit),'[]'::jsonb),
  'nextCursor',case when count(*)>p_limit then (array_agg(id order by id))[p_limit] else null end)
 into result from numbered;
 return result;
end; $$;

create or replace function private.change_admin_role(p_target uuid,p_role text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; previous text;
begin
 perform pg_catalog.pg_advisory_xact_lock(82631,51);
 actor:=private.require_admin(true);
 if p_target is null or p_target=actor or p_role is null or p_role not in ('user','admin') then
  raise exception using errcode='22023',message='Unsupported role change.';
 end if;
 if not exists(select 1 from public.profiles where id=p_target) or not private.admin_account_confirmed(p_target) then
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
revoke rollcall_admin_executor from current_user;

create or replace function private.bootstrap_superadmin(p_target uuid) returns void
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
 select coalesce((select role from private.account_roles where profile_id=p_target),'user') into previous;
 insert into private.account_roles(profile_id,role,assigned_by) values(p_target,'superadmin',null)
 on conflict(profile_id) do update set role='superadmin',assigned_by=null;
 insert into private.role_audit(actor_id,target_id,previous_role,new_role,action,source)
 values(null,p_target,previous,'superadmin','bootstrap','local_operator');
end; $$;
notify pgrst,'reload schema';
commit;
