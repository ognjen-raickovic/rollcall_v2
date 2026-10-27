-- Preserve validated username spelling; lower(username) remains the identity key.
-- Forward-only upgrade from registration migration 17. No existing values change.
begin;
select pg_catalog.pg_advisory_xact_lock(82631,62);
alter table public.profiles drop constraint profiles_username_format;
alter table public.profiles add constraint profiles_username_format
 check(username is null or username ~ '^[A-Za-z][A-Za-z0-9_]{2,23}$');
-- Keep profiles_username_unique, the existing unique lower(username) index.
alter table private.registration_intents drop constraint registration_intents_username_check;
alter table private.registration_intents add constraint registration_intents_username_check
 check(username ~ '^[A-Za-z][A-Za-z0-9_]{2,23}$');
alter table private.registration_intents drop constraint registration_intents_username_key;
create unique index registration_intents_username_unique on private.registration_intents(lower(username));
create or replace function private.prepare_registration(p_username text,p_email text,p_date_of_birth text,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare chosen text:=btrim(p_username); born date; email_digest text; count_attempts integer; ticket uuid;
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
 if chosen is null or chosen !~ '^[A-Za-z][A-Za-z0-9_]{2,23}$' or p_email is null or char_length(p_email)>254
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
 if exists(select 1 from public.profiles where lower(username)=lower(chosen)) then return jsonb_build_object('status','duplicate'); end if;
 -- An exact same-email retry may replace only an unclaimed pending reservation.
 delete from private.registration_intents where lower(username)=lower(chosen) and email_hash=email_digest and claimed_account is null;
 if exists(select 1 from private.registration_intents where lower(username)=lower(chosen)) then return jsonb_build_object('status','duplicate'); end if;
 insert into private.registration_intents(username,email_hash,date_of_birth) values(chosen,email_digest,born) returning token into ticket;
 return jsonb_build_object('status','ready','token',ticket);
end; $$;
create or replace function public.public_profile(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'username', p.username, 'id', p.id, 'displayName', p.display_name, 'biography', p.biography,
    'createdAt', p.created_at, 'updatedAt', p.updated_at,
    'country', case when c.id is null then null else jsonb_build_object(
      'id', c.id, 'isoCode', c.iso_code, 'name', c.name) end,
    'city', case when city.id is null then null else jsonb_build_object(
      'id', city.id, 'countryId', city.country_id, 'name', city.name,
      'administrativeDivision', city.administrative_division,
      'admin1Code', city.admin1_code, 'admin2Code', city.admin2_code) end,
    'gameExperience', coalesce((select jsonb_agg(jsonb_build_object(
      'gameId', g.id, 'gameName', g.name, 'experience', x.experience_level) order by g.name, g.id)
      from public.user_game_experience x join public.games g on g.id = x.game_id
      where x.profile_id = p.id), '[]'::jsonb)
  ) from public.profiles p
  left join public.countries c on c.id = p.country_id
  left join public.cities city on city.id = p.city_id and city.country_id = p.country_id
  where p.id = p_user_id;
$$;
-- CREATE OR REPLACE retains existing owners/ACLs. No new grants or RLS policies.
-- The existing initializer already copies intent.username without transforming it.
notify pgrst,'reload schema';
commit;