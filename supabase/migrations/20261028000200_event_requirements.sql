-- Preserve all historical rows and meanings. Enforce new choices on future writes only.
begin;
alter table public.events drop constraint events_experience_level_check;
alter table public.events add constraint events_experience_level_check
 check(experience_level in ('all-levels','beginner','experienced','intermediate-plus','veteran-plus'));

create function private.validate_event_requirements() returns trigger language plpgsql security invoker set search_path='' as $$
declare changed boolean; experience_changed boolean;
begin
 if tg_op='INSERT' then changed:=true; experience_changed:=true;
 else experience_changed:=new.experience_level is distinct from old.experience_level; changed:=new.tags is distinct from old.tags or experience_changed; end if;
 if not changed then return new; end if;
 if experience_changed
   and new.experience_level not in ('all-levels','intermediate-plus','veteran-plus') then
  raise exception using errcode='22023',message='Choose All levels, Intermediate+ or Veteran+.';
 end if;
 if new.tags && array['Beginner friendly','Veterans only'] then
  raise exception using errcode='22023',message='Remove legacy experience tags before changing tags or experience.';
 end if;
 if new.tags @> array['Casual','Competitive'] then raise exception using errcode='22023',message='Casual and Competitive cannot be selected together.'; end if;
 if new.tags @> array['One-shot','Campaign'] then raise exception using errcode='22023',message='Choose either One-shot or Campaign, not both.'; end if;
 return new;
end; $$;
revoke all on function private.validate_event_requirements() from public,anon,authenticated,service_role;
create trigger validate_event_requirements before insert or update of tags,experience_level
 on public.events for each row execute function private.validate_event_requirements();

-- DOB is read only inside this narrow helper. Runtime/event roles get no DOB grant.
create role rollcall_age_executor nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant rollcall_age_executor,rollcall_events_executor,rollcall_invitation_executor to current_user;
grant usage on schema public,private to rollcall_age_executor;
grant rollcall_status_executor to current_user;
set local role rollcall_status_executor;
grant execute on function private.require_active_account() to rollcall_age_executor;
reset role;
revoke rollcall_status_executor from current_user;
grant select(profile_id,date_of_birth) on private.profile_private to rollcall_age_executor;
create policy age_executor_self_read on private.profile_private for select to rollcall_age_executor
 using(profile_id=private.require_active_account());
create function private.assert_event_age(p_profile uuid,p_age integer,p_start timestamptz,p_country text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_active_account(); born date; zone text; event_day date;
begin
 if actor is null or actor is distinct from p_profile then raise exception using errcode='42501',message='Verified owner required.'; end if;
 if p_age=0 then return; end if;
 if p_age is null or p_age not between 1 and 99 or p_start is null then raise exception using errcode='RA005',message='Age information unavailable.'; end if;
 zone:=case p_country when 'ME' then 'Europe/Podgorica' when 'RS' then 'Europe/Belgrade'
   when 'BA' then 'Europe/Sarajevo' when 'HR' then 'Europe/Zagreb' end;
 if zone is null then raise exception using errcode='RA005',message='Age information unavailable.'; end if;
 select date_of_birth into born from private.profile_private where profile_id=actor;
 if born is null then raise exception using errcode='RA005',message='Complete private date of birth required.'; end if;
 event_day:=(p_start at time zone zone)::date;
 -- PostgreSQL calendar-year addition observes Feb 28 for Feb 29 birthdays in non-leap years.
 if event_day<(born+make_interval(years=>p_age))::date then
   raise exception using errcode='RA004',message='Event minimum age is not met.';
 end if;
end; $$;
grant create on schema private to rollcall_age_executor;
alter function private.assert_event_age(uuid,integer,timestamptz,text) owner to rollcall_age_executor;
revoke create on schema private from rollcall_age_executor;
revoke all on function private.assert_event_age(uuid,integer,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function private.assert_event_age(uuid,integer,timestamptz,text) to rollcall_events_executor,rollcall_invitation_executor;
grant select(id,country_id) on public.cities to rollcall_invitation_executor;
grant select(id,iso_code) on public.countries to rollcall_invitation_executor;
create policy invitation_age_city_read on public.cities for select to rollcall_invitation_executor using(true);
create policy invitation_age_country_read on public.countries for select to rollcall_invitation_executor using(true);

-- Reuse the current implementations, preserving signatures, owners, ACLs and security fixes.
grant create on schema private to rollcall_events_executor;
set local role rollcall_events_executor;
do $migration$
declare source text; needle text;
begin
 source:=pg_get_functiondef('private.event_api_input(jsonb,boolean)'::regprocedure);
 source:=replace(source,'''all-levels'',''beginner'',''experienced''','''all-levels'',''beginner'',''experienced'',''intermediate-plus'',''veteran-plus''');
 execute source;
 source:=pg_get_functiondef('private.event_api_summary(uuid)'::regprocedure);
 needle:='''id'', e.id, ''title'', e.title,';
 if strpos(source,needle)=0 then raise exception 'Unexpected event summary definition'; end if;
 source:=replace(source,needle,needle||' ''minimumAge'', e.minimum_age, ''experienceLevel'', e.experience_level,');
 execute source;
 source:=pg_get_functiondef('private.event_api_discover(jsonb)'::regprocedure);
 source:=replace(source,'''all-levels'',''beginner'',''experienced''','''all-levels'',''beginner'',''experienced'',''intermediate-plus'',''veteran-plus''');
 source:=replace(source,'$12<>''''all-levels'''' and e.experience_level=''''all-levels''''','$12 in (''''beginner'''',''''experienced'''') and e.experience_level=''''all-levels''''');
 execute source;
 source:=pg_get_functiondef('private.event_api_attendance(uuid,boolean)'::regprocedure);
 needle:='insert into public.event_participants(event_id, profile_id) values (item.id, actor);';
 if strpos(source,needle)=0 then raise exception 'Unexpected attendance definition'; end if;
 source:=replace(source,needle,'perform private.assert_event_age(actor,item.minimum_age,item.starts_at,(select c.iso_code from public.cities city join public.countries c on c.id=city.country_id where city.id=item.city_id)); '||needle);
 execute source;
end; $migration$;
reset role;
revoke create on schema private from rollcall_events_executor;
grant create on schema private to rollcall_invitation_executor;
set local role rollcall_invitation_executor;
do $migration$
declare source text; needle text;
begin
 source:=pg_get_functiondef('private.redeem_invitation(text)'::regprocedure);
 needle:='insert into public.event_participants(event_id,profile_id) values(target,actor);';
 if strpos(source,needle)=0 then raise exception 'Unexpected invitation admission definition'; end if;
 source:=replace(source,needle,'begin
   perform private.assert_event_age(actor,item.minimum_age,item.starts_at,(select c.iso_code from public.cities city join public.countries c on c.id=city.country_id where city.id=item.city_id));
   exception when sqlstate ''RA004'' then return jsonb_build_object(''status'',''age-ineligible'');
             when sqlstate ''RA005'' then return jsonb_build_object(''status'',''age-unavailable''); end;
   '||needle);
 execute source;
end; $migration$;
reset role;
revoke create on schema private from rollcall_invitation_executor;
revoke rollcall_age_executor,rollcall_events_executor,rollcall_invitation_executor from current_user;
notify pgrst,'reload schema';
commit;
