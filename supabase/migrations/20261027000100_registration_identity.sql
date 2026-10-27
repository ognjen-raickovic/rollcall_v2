-- Additive registration contract. DOB never passes through Auth metadata/JWTs.
begin;
alter table public.profiles add column username text;
alter table public.profiles add constraint profiles_username_format
 check(username is null or username ~ '^[a-z][a-z0-9_]{2,23}$');
create unique index profiles_username_unique on public.profiles(lower(username)) where username is not null;
alter table private.profile_private add column date_of_birth date;

create table private.registration_intents (
 token uuid primary key default gen_random_uuid(),
 username text not null unique check(username ~ '^[a-z][a-z0-9_]{2,23}$'),
 email_hash text not null,
 date_of_birth date not null,
 expires_at timestamptz not null default(clock_timestamp()+interval '10 minutes'),
 claimed_account uuid unique
);
create table private.registration_attempts (
 fingerprint text primary key,
 window_started_at timestamptz not null,
 attempts integer not null
);
alter table private.registration_intents enable row level security;
alter table private.registration_attempts enable row level security;
revoke all on private.registration_intents,private.registration_attempts from public,anon,authenticated,service_role;

create function private.prepare_registration(p_username text,p_email text,p_date_of_birth text,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare chosen text:=lower(btrim(p_username)); born date; email_digest text; count_attempts integer; ticket uuid;
begin
 -- Reuse the existing backend-only operation capability, also used by invitations.
 -- It grants no account ownership or roles. Direct browser/Data API calls lack it.
 -- The managed migration owner cannot assume the existing executor's function
 -- privileges. Check the same private capability hash without widening its ACL.
 if not coalesce((select operation_key_hash=encode(extensions.digest(
  coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-rollcall-cover-key',''),
  'sha256'),'hex') from private.event_cover_config where singleton),false) then
  raise exception using errcode='42501',message='Trusted registration preparation required.';
 end if;
 if chosen is null or chosen !~ '^[a-z][a-z0-9_]{2,23}$' or p_email is null or char_length(p_email)>254
  or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$'
  or p_date_of_birth is null or p_date_of_birth !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
  raise exception using errcode='22023',message='Invalid registration fields.';
 end if;
 begin born:=p_date_of_birth::date; exception when others then raise exception using errcode='22023',message='Invalid date of birth.'; end;
 -- 1900 is the existing private birth-year storage bound, not event eligibility.
 if born<date '1900-01-01' or born>current_date then raise exception using errcode='22023',message='Invalid date of birth.'; end if;
 email_digest:=encode(extensions.digest(lower(btrim(p_email)),'sha256'),'hex');
 -- Commit limited/duplicate outcomes, preserving durable limits across API instances.
 perform pg_catalog.pg_advisory_xact_lock(82631,62);
 delete from private.registration_attempts where fingerprint in(select fingerprint from private.registration_attempts where window_started_at<clock_timestamp()-interval '1 day' limit 1000);
 delete from private.registration_intents where token in(select token from private.registration_intents where expires_at<=clock_timestamp() limit 1000);
 if (select count(*) from private.registration_attempts)>=10000 and not exists(select 1 from private.registration_attempts where fingerprint=p_fingerprint) then
  return jsonb_build_object('status','limited');
 end if;
 insert into private.registration_attempts(fingerprint,window_started_at,attempts) values(p_fingerprint,clock_timestamp(),1)
 on conflict(fingerprint) do update set
 attempts=case when registration_attempts.window_started_at<clock_timestamp()-interval '15 minutes' then 1 else least(registration_attempts.attempts+1,21) end,
 window_started_at=case when registration_attempts.window_started_at<clock_timestamp()-interval '15 minutes' then clock_timestamp() else registration_attempts.window_started_at end
 returning attempts into count_attempts;
 if count_attempts>20 or (select count(*) from private.registration_intents)>=1000 then return jsonb_build_object('status','limited'); end if;
 if exists(select 1 from public.profiles where username=chosen) then return jsonb_build_object('status','duplicate'); end if;
 -- An exact same-email retry may replace only an unclaimed pending reservation.
 delete from private.registration_intents where username=chosen and email_hash=email_digest and claimed_account is null;
 if exists(select 1 from private.registration_intents where username=chosen) then return jsonb_build_object('status','duplicate'); end if;
 insert into private.registration_intents(username,email_hash,date_of_birth) values(chosen,email_digest,born) returning token into ticket;
 return jsonb_build_object('status','ready','token',ticket);
end; $$;
revoke all on function private.prepare_registration(text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.prepare_registration(text,text,text,text) to anon;
create function public.prepare_registration(p_username text,p_email text,p_date_of_birth text,p_fingerprint text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.prepare_registration(p_username,p_email,p_date_of_birth,p_fingerprint);
$$;
revoke all on function public.prepare_registration(text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.prepare_registration(text,text,text,text) to anon;

create function private.claim_registration() returns trigger language plpgsql security definer set search_path='' as $$
declare ticket uuid; intent private.registration_intents%rowtype;
begin
 begin ticket:=(new.raw_user_meta_data->>'rollcall_registration_token')::uuid;
 exception when others then raise exception using errcode='22023',message='Use the RollCall registration form.'; end;
 -- Same lock order as preparation, before inspecting/claiming reservation state.
 perform pg_catalog.pg_advisory_xact_lock(82631,62);
 select * into intent from private.registration_intents where token=ticket for update;
 if not found or intent.expires_at<=clock_timestamp() or intent.claimed_account is not null
  or intent.email_hash<>encode(extensions.digest(lower(btrim(new.email)),'sha256'),'hex') then
  raise exception using errcode='22023',message='Use the RollCall registration form.';
 end if;
 update private.registration_intents set claimed_account=new.id where token=ticket;
 -- Strip the transport ticket, and refuse DOB/role/username transport via metadata.
 new.raw_user_meta_data:=coalesce(new.raw_user_meta_data,'{}'::jsonb)-'rollcall_registration_token'-'dateOfBirth'-'date_of_birth'-'birthYear'-'birth_year';
 return new;
end; $$;
revoke all on function private.claim_registration() from public,anon,authenticated,service_role;
create trigger claim_rollcall_registration before insert on auth.users for each row execute function private.claim_registration();

-- Auth may write its original metadata again after INSERT (for example while
-- preparing confirmation). Keep private dates and consumed tickets out of that
-- persisted metadata too, without changing unrelated Auth fields.
create function private.sanitize_registration_metadata() returns trigger language plpgsql set search_path='' as $$
begin
 new.raw_user_meta_data:=coalesce(new.raw_user_meta_data,'{}'::jsonb)-'rollcall_registration_token'-'dateOfBirth'-'date_of_birth'-'birthYear'-'birth_year';
 return new;
end; $$;
revoke all on function private.sanitize_registration_metadata() from public,anon,authenticated,service_role;
create trigger sanitize_rollcall_registration_metadata before update of raw_user_meta_data on auth.users
 for each row execute function private.sanitize_registration_metadata();

create or replace function private.initialize_auth_profile() returns trigger
language plpgsql security definer set search_path='' as $$
declare intent private.registration_intents%rowtype;
begin
 select * into intent from private.registration_intents where claimed_account=new.id for update;
 if not found then raise exception using errcode='22023',message='Registration preparation is required.'; end if;
 insert into public.profiles(id,display_name,username) values(new.id,intent.username,intent.username);
 insert into private.profile_private(profile_id,date_of_birth,birth_year,age_declared_at)
 values(new.id,intent.date_of_birth,extract(year from intent.date_of_birth)::integer,clock_timestamp());
 delete from private.registration_intents where token=intent.token;
 return new;
end; $$;

create function private.protect_registration_birth_date() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and old.date_of_birth is not null and new.date_of_birth is distinct from old.date_of_birth then
  raise exception using errcode='42501',message='Registration birth date cannot be changed through profile edits.';
 end if;
 if new.date_of_birth is not null and (new.date_of_birth<date '1900-01-01' or new.date_of_birth>current_date
  or new.birth_year is distinct from extract(year from new.date_of_birth)::integer) then
  raise exception using errcode='22023',message='Birth year must match the private registration date.';
 end if;
 return new;
end; $$;
revoke all on function private.protect_registration_birth_date() from public,anon,authenticated,service_role;
create trigger protect_registration_birth_date before insert or update on private.profile_private for each row execute function private.protect_registration_birth_date();

-- Preserve active-account enforcement and existing owner-only age reads; DOB itself
-- is intentionally absent even from the ordinary own-profile HTTP response.
create or replace function public.get_my_profile() returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare actor uuid:=private.require_active_account(); result jsonb;
begin
 if actor is null then raise exception using errcode='42501',message='Authentication required.'; end if;
 result:=public.public_profile(actor);
 return result || jsonb_build_object('birthYear',(select birth_year from private.profile_private where profile_id=actor),
  'ageDeclaredAt',(select age_declared_at from private.profile_private where profile_id=actor),
  'hasDateOfBirth',exists(select 1 from private.profile_private where profile_id=actor and date_of_birth is not null));
end; $$;
notify pgrst,'reload schema';
commit;
