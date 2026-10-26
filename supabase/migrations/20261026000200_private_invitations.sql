begin;
grant rollcall_events_executor to current_user;
create role rollcall_invitation_executor nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant rollcall_invitation_executor to current_user;
grant usage on schema public, private to rollcall_invitation_executor;
grant execute on function private.event_api_actor(), private.event_cover_operation_allowed() to rollcall_invitation_executor;
create table private.event_invitations (
  event_id uuid primary key references public.events(id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  sealed_code text not null check (sealed_code ~ '^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create table private.invitation_attempts (
  account_id uuid primary key references public.profiles(id) on delete cascade,
  window_start timestamptz not null,
  attempts integer not null check(attempts > 0)
);
alter table private.event_invitations enable row level security;
alter table private.invitation_attempts enable row level security;
revoke all on private.event_invitations, private.invitation_attempts from public,anon,authenticated,service_role;
grant select,insert,update on private.event_invitations,private.invitation_attempts to rollcall_invitation_executor;
create policy invitation_executor_all on private.event_invitations to rollcall_invitation_executor using(true) with check(true);
create policy invitation_attempt_executor_all on private.invitation_attempts to rollcall_invitation_executor using(true) with check(true);
grant select on public.events,public.event_participants to rollcall_invitation_executor;
grant update(id) on public.events to rollcall_invitation_executor;
grant insert(event_id,profile_id) on public.event_participants to rollcall_invitation_executor;
create policy invitation_event_read on public.events for select to rollcall_invitation_executor using(true);
create policy invitation_event_lock on public.events for update to rollcall_invitation_executor using(true) with check(false);
create policy invitation_members_read on public.event_participants for select to rollcall_invitation_executor using(profile_id=private.event_api_actor());
create policy invitation_members_insert on public.event_participants for insert to rollcall_invitation_executor with check(profile_id=private.event_api_actor());

create function private.invitation_actor() returns uuid language plpgsql security invoker set search_path='' as $$
declare actor uuid := private.event_api_actor();
begin
  if actor is null or not private.event_cover_operation_allowed() then
    raise exception using errcode='42501',message='Verified backend request required.';
  end if;
  return actor;
end; $$;

create function private.manage_invitation(p_event_id uuid,p_hash text,p_sealed text,p_expires timestamptz,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.invitation_actor(); item public.events%rowtype; invitation private.event_invitations%rowtype;
begin
 select * into item from public.events where id=p_event_id and host_id=actor for update;
 if not found then raise exception using errcode='P0002',message='Event not found.'; end if;
 if item.visibility<>'private' or item.status<>'scheduled' or item.starts_at<=clock_timestamp() then
   raise exception using errcode='22023',message='Private invitation unavailable.';
 end if;
 if p_action not in ('ensure','rotate','revoke') then raise exception using errcode='22023',message='Invalid operation.'; end if;
 if p_action='revoke' then
   update private.event_invitations set revoked_at=coalesce(revoked_at,clock_timestamp()) where event_id=p_event_id;
 else
   if p_expires<=clock_timestamp() or p_expires>item.starts_at or p_expires>clock_timestamp()+interval '7 days 1 minute' then
     raise exception using errcode='22023',message='Invalid expiration.';
   end if;
   insert into private.event_invitations(event_id,code_hash,sealed_code,expires_at)
     values(p_event_id,p_hash,p_sealed,p_expires)
     on conflict(event_id) do update set code_hash=excluded.code_hash,sealed_code=excluded.sealed_code,
       created_at=clock_timestamp(),expires_at=excluded.expires_at,revoked_at=null
     where p_action='rotate';
 end if;
 select * into invitation from private.event_invitations where event_id=p_event_id;
 if not found then return null; end if;
 return jsonb_build_object('eventId',invitation.event_id,'sealedCode',invitation.sealed_code,
   'expiresAt',invitation.expires_at,'revokedAt',invitation.revoked_at);
end; $$;

create function private.redeem_invitation(p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.invitation_actor(); target uuid; item public.events%rowtype;
 invitation private.event_invitations%rowtype; used integer;
begin
 -- Failures return data, not exceptions: the account limiter must commit even for bad codes.
 insert into private.invitation_attempts(account_id,window_start,attempts) values(actor,clock_timestamp(),1)
 on conflict(account_id) do update set
   attempts=case when private.invitation_attempts.window_start<=clock_timestamp()-interval '15 minutes' then 1 else private.invitation_attempts.attempts+1 end,
   window_start=case when private.invitation_attempts.window_start<=clock_timestamp()-interval '15 minutes' then clock_timestamp() else private.invitation_attempts.window_start end
 returning attempts into used;
 if used>20 then return jsonb_build_object('status','limited'); end if;
 select event_id into target from private.event_invitations where code_hash=p_hash;
 if target is null then return jsonb_build_object('status','invalid'); end if;
 -- Same parent lock as rotation, event updates, deletion and ordinary attendance.
 select * into item from public.events where id=target for update;
 select * into invitation from private.event_invitations where event_id=target and code_hash=p_hash;
 if item.id is null or invitation.event_id is null or invitation.revoked_at is not null
   or invitation.expires_at<=clock_timestamp() or item.visibility<>'private'
   or item.status<>'scheduled' or item.starts_at<=clock_timestamp() or item.host_id=actor then
   return jsonb_build_object('status','invalid');
 end if;
 if not exists(select 1 from public.event_participants where event_id=target and profile_id=actor) then
   if item.participant_count>=item.capacity then return jsonb_build_object('status','invalid'); end if;
   insert into public.event_participants(event_id,profile_id) values(target,actor);
 end if;
 -- Existing attendance triggers are the only counter writers.
 return jsonb_build_object('status','joined','eventId',target);
end; $$;

create function private.revoke_changed_invitation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.visibility<>'private' or new.status<>'scheduled' or new.starts_at<=clock_timestamp() then
   update private.event_invitations set revoked_at=coalesce(revoked_at,clock_timestamp()) where event_id=new.id;
 end if;
 return new;
end; $$;
create trigger revoke_changed_invitation after update of visibility,status,starts_at on public.events
 for each row execute function private.revoke_changed_invitation();

grant create on schema private to rollcall_invitation_executor;
alter function private.invitation_actor() owner to rollcall_invitation_executor;
alter function private.manage_invitation(uuid,text,text,timestamptz,text) owner to rollcall_invitation_executor;
alter function private.redeem_invitation(text) owner to rollcall_invitation_executor;
alter function private.revoke_changed_invitation() owner to rollcall_invitation_executor;
revoke create on schema private from rollcall_invitation_executor;
revoke all on function private.invitation_actor(),private.manage_invitation(uuid,text,text,timestamptz,text),
 private.redeem_invitation(text),private.revoke_changed_invitation() from public,anon,authenticated,service_role;
grant execute on function private.manage_invitation(uuid,text,text,timestamptz,text),private.redeem_invitation(text) to authenticated;
create function public.manage_event_invitation(p_event_id uuid,p_hash text,p_sealed text,p_expires timestamptz,p_action text)
returns jsonb language sql security invoker set search_path='' as $$ select private.manage_invitation(p_event_id,p_hash,p_sealed,p_expires,p_action); $$;
create function public.redeem_event_invitation(p_hash text) returns jsonb language sql security invoker set search_path='' as $$ select private.redeem_invitation(p_hash); $$;
revoke all on function public.manage_event_invitation(uuid,text,text,timestamptz,text),public.redeem_event_invitation(text) from public,anon,authenticated,service_role;
grant execute on function public.manage_event_invitation(uuid,text,text,timestamptz,text),public.redeem_event_invitation(text) to authenticated;
revoke rollcall_invitation_executor from current_user;
revoke rollcall_events_executor from current_user;
notify pgrst,'reload schema';
commit;
