-- Owner-requested spelling only: identity remains the same lower(username) key.
begin;
create role rollcall_username_executor nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant rollcall_username_executor to current_user;
grant usage on schema public,private to rollcall_username_executor;
grant select(id,username),update(username) on public.profiles to rollcall_username_executor;
grant rollcall_status_executor to current_user;
set local role rollcall_status_executor;
grant execute on function private.require_active_account() to rollcall_username_executor;
reset role;
revoke rollcall_status_executor from current_user;
create policy username_executor_read on public.profiles for select to rollcall_username_executor using(id=private.require_active_account());
create policy username_executor_write on public.profiles for update to rollcall_username_executor using(id=private.require_active_account()) with check(id=private.require_active_account());
create function private.correct_username_case(p_username text,p_expected text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_active_account(); saved text;
begin
 if actor is null then raise exception using errcode='42501',message='Authentication required.'; end if;
 if p_username is null or p_username !~ '^[A-Za-z][A-Za-z0-9_]{2,23}$' then
  raise exception using errcode='22023',message='Choose valid username capitalization.';
 end if;
 select username into saved from public.profiles where id=actor for update;
 if saved is null or lower(saved)<>lower(p_username) then
  raise exception using errcode='22023',message='Only capitalization of your existing username may change.';
 end if;
 if saved is distinct from p_expected then raise exception using errcode='PT409',message='Username spelling changed. Reload before retrying.'; end if;
 if saved<>p_username then update public.profiles set username=p_username where id=actor; end if;
end; $$;
grant create on schema private to rollcall_username_executor;
alter function private.correct_username_case(text,text) owner to rollcall_username_executor;
revoke create on schema private from rollcall_username_executor;
revoke all on function private.correct_username_case(text,text) from public,anon,authenticated,service_role;
grant execute on function private.correct_username_case(text,text) to authenticated;
create function public.correct_my_username_case(p_username text,p_expected text) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 perform private.correct_username_case(p_username,p_expected);
 return public.get_my_profile();
end; $$;
revoke all on function public.correct_my_username_case(text,text) from public,anon,authenticated,service_role;
grant execute on function public.correct_my_username_case(text,text) to authenticated;
revoke rollcall_username_executor from current_user;
commit;
