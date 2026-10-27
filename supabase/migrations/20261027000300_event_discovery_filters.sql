-- Public discovery remains public/scheduled only. No table grants or RLS changes.
begin;
create index events_public_title_discovery on public.events(lower(title) collate "C",id)
 where visibility='public' and status='scheduled';
create index events_public_tags_discovery on public.events using gin(tags)
 where visibility='public' and status='scheduled';
-- Managed postgres does not inherit function ownership from the executor role.
-- Replace as that existing owner, without changing runtime membership or ACLs.
grant rollcall_events_executor to current_user;
grant create on schema private to rollcall_events_executor;
set local role rollcall_events_executor;

create or replace function private.event_api_discover(p_filters jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 n integer:=12; field text; number_value numeric; search_text text:=''; country_code text;
 city_filter integer; game_filter integer; max_age integer;
 upcoming boolean:=true; available boolean:=false; exclusive_before boolean:=false;
 after_time timestamptz; before_time timestamptz; cursor_time timestamptz; cursor_id uuid; cursor_title text;
 ordering text:=coalesce(p_filters->>'sort','soonest'); timing text; seats text:=coalesce(p_filters->>'availability','all');
 category_filter text; experience_filter text; tag_filters text[]:=array[]::text[];
 from_minute integer; to_minute integer; zone text; order_sql text; page_order text; statement text;
begin
 if p_filters is null or jsonb_typeof(p_filters)<>'object' or exists(select 1 from jsonb_object_keys(p_filters) k
 where k not in ('search','country','cityId','gameId','startsAfter','startsBefore','startsBeforeExclusive',
 'upcomingOnly','availableOnly','status','limit','afterStartsAt','afterId','afterTitle','sort','period',
 'availability','category','tags','experience','maxMinimumAge','timeFrom','timeTo','timeZone')) then
  raise exception using errcode='22023',message='Invalid discovery filters.';
 end if;
 foreach field in array array['search','country','startsAfter','startsBefore','afterStartsAt','afterId','afterTitle',
 'sort','period','availability','category','experience','timeFrom','timeTo','timeZone','status'] loop
  if p_filters ? field and (jsonb_typeof(p_filters->field)<>'string' or char_length(p_filters->>field)>200) then
   raise exception using errcode='22023',message='Invalid discovery string.';
  end if;
 end loop;
 if p_filters ? 'search' then search_text:=btrim(p_filters->>'search'); end if;
 if char_length(search_text)>100 then raise exception using errcode='22023',message='Search is too long.'; end if;
 if p_filters ? 'country' then
  country_code:=upper(btrim(p_filters->>'country'));
  if country_code !~ '^[A-Z]{2}$' then raise exception using errcode='22023',message='Invalid country.'; end if;
 end if;
 if p_filters ? 'status' and p_filters->>'status'<>'scheduled' then
  raise exception using errcode='22023',message='Discovery includes scheduled events only.';
 end if;
 if ordering not in ('soonest','latest','title-asc','title-desc') or seats not in ('all','open','full') then
  raise exception using errcode='22023',message='Invalid discovery ordering or availability.';
 end if;
 foreach field in array array['cityId','gameId','limit','maxMinimumAge'] loop
  if p_filters ? field then
   if jsonb_typeof(p_filters->field)<>'number' then raise exception using errcode='22023',message='Invalid discovery integer.'; end if;
   number_value:=(p_filters->>field)::numeric;
   if number_value<>trunc(number_value) or number_value<(case when field='maxMinimumAge' then 0 else 1 end)
    or number_value>2147483647 or (field='limit' and number_value>50) or (field='maxMinimumAge' and number_value>99) then
    raise exception using errcode='22023',message='Invalid discovery bound.';
   end if;
   if field='limit' then n:=number_value::integer;
   elsif field='cityId' then city_filter:=number_value::integer;
   elsif field='gameId' then game_filter:=number_value::integer;
   else max_age:=number_value::integer; end if;
  end if;
 end loop;
 foreach field in array array['upcomingOnly','availableOnly','startsBeforeExclusive'] loop
  if p_filters ? field then
   if jsonb_typeof(p_filters->field)<>'boolean' then raise exception using errcode='22023',message='Invalid discovery boolean.'; end if;
   if field='upcomingOnly' then upcoming:=(p_filters->>field)::boolean;
   elsif field='availableOnly' then available:=(p_filters->>field)::boolean;
   else exclusive_before:=(p_filters->>field)::boolean; end if;
  end if;
 end loop;
 timing:=coalesce(p_filters->>'period',case when upcoming then 'upcoming' else 'all' end);
 if timing not in ('upcoming','past','all') or (available and seats='full') then
  raise exception using errcode='22023',message='Conflicting discovery filters.';
 end if;
 if available then seats:='open'; end if;
 category_filter:=p_filters->>'category'; experience_filter:=p_filters->>'experience';
 if category_filter is not null and category_filter not in ('role-playing','trading-card','board-game','social-deduction')
 or experience_filter is not null and experience_filter not in ('all-levels','beginner','experienced') then
  raise exception using errcode='22023',message='Invalid game category or experience.';
 end if;
 if p_filters ? 'tags' then
  if jsonb_typeof(p_filters->'tags')<>'array' then raise exception using errcode='22023',message='Invalid tags.'; end if;
  if jsonb_array_length(p_filters->'tags')>6 then raise exception using errcode='22023',message='Invalid tags.'; end if;
  select array_agg(value) into tag_filters from jsonb_array_elements_text(p_filters->'tags');
  tag_filters:=coalesce(tag_filters,array[]::text[]);
  if cardinality(tag_filters)>6 or exists(select 1 from unnest(tag_filters) t where t is null or t not in
   ('Beginner friendly','Veterans only','Casual','Competitive','One-shot','Campaign','Bring your own deck','Equipment provided'))
   or cardinality(tag_filters)<>(select count(distinct t) from unnest(tag_filters) t) then
   raise exception using errcode='22023',message='Invalid tags.';
  end if;
 end if;
 if p_filters ? 'startsAfter' then after_time:=private.event_api_time(p_filters->>'startsAfter'); end if;
 if p_filters ? 'startsBefore' then before_time:=private.event_api_time(p_filters->>'startsBefore'); end if;
 if after_time>before_time then raise exception using errcode='22023',message='Date range is reversed.'; end if;
 if (p_filters ? 'afterStartsAt')<>(p_filters ? 'afterId') then raise exception using errcode='22023',message='Cursor fields must be paired.'; end if;
 if p_filters ? 'afterStartsAt' then
  cursor_time:=private.event_api_time(p_filters->>'afterStartsAt');
  if p_filters->>'afterId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception using errcode='22023',message='Invalid event cursor.'; end if;
  cursor_id:=(p_filters->>'afterId')::uuid; cursor_title:=p_filters->>'afterTitle';
  if ordering in ('title-asc','title-desc') and cursor_title is null then raise exception using errcode='22023',message='Title cursor required.'; end if;
 end if;
 if p_filters ? 'timeFrom' or p_filters ? 'timeTo' then
  zone:=p_filters->>'timeZone';
  if zone is null or char_length(zone)>100 or not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then
   raise exception using errcode='22023',message='Use a recognized timezone.';
  end if;
  foreach field in array array['timeFrom','timeTo'] loop
   if p_filters ? field then
    if p_filters->>field !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception using errcode='22023',message='Invalid start time filter.'; end if;
    number_value:=substring(p_filters->>field,1,2)::integer*60+substring(p_filters->>field,4,2)::integer;
    if field='timeFrom' then from_minute:=number_value::integer; else to_minute:=number_value::integer; end if;
   end if;
  end loop;
  if from_minute>to_minute then raise exception using errcode='22023',message='Time range must not run overnight.'; end if;
 end if;
 -- Only these fixed fragments enter SQL; all caller data uses bound parameters.
 order_sql:=case ordering when 'latest' then 'e.starts_at desc,e.id desc' when 'title-asc' then 'lower(e.title) collate "C",e.id' when 'title-desc' then 'lower(e.title) collate "C" desc,e.id desc' else 'e.starts_at,e.id' end;
 page_order:=case ordering when 'latest' then 'starts_at desc,id desc' when 'title-asc' then 'title_key collate "C",id' when 'title-desc' then 'title_key collate "C" desc,id desc' else 'starts_at,id' end;
 search_text:=replace(replace(replace(search_text,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_');
 statement:='with candidates as materialized (
  select e.id,e.starts_at,lower(e.title) as title_key from public.events e
  join public.cities city on city.id=e.city_id join public.countries country on country.id=city.country_id
  join public.games g on g.id=e.game_id
  where e.visibility=''public'' and e.status=''scheduled'' and country.enabled and country.iso_code in (''ME'',''RS'',''BA'',''HR'')
  and ($1 is null or country.iso_code=$1) and ($2 is null or e.city_id=$2) and ($3 is null or e.game_id=$3)
  and e.title ilike (''%''||$4||''%'') escape E''\\''
  and ($5=''all'' or $5=''upcoming'' and e.starts_at>now() or $5=''past'' and e.ends_at<=now())
  and ($6=''all'' or $6=''open'' and e.starts_at>now() and e.participant_count<e.capacity or $6=''full'' and e.participant_count=e.capacity)
  and ($7 is null or e.starts_at>=$7) and ($8 is null or case when $9 then e.starts_at<$8 else e.starts_at<=$8 end)
  and ($10 is null or g.category=$10) and e.tags @> $11
  and ($12 is null or e.experience_level=$12 or $12<>''all-levels'' and e.experience_level=''all-levels'')
  and ($13 is null or e.minimum_age<=$13)
  and ($14 is null or extract(hour from e.starts_at at time zone $16)*60+extract(minute from e.starts_at at time zone $16)>=$14)
  and ($15 is null or extract(hour from e.starts_at at time zone $16)*60+extract(minute from e.starts_at at time zone $16)<=$15)
  and ($17 is null or case $20
   when ''latest'' then (e.starts_at,e.id)<($17,$18)
   when ''title-asc'' then (lower(e.title) collate "C",e.id)>($19 collate "C",$18)
   when ''title-desc'' then (lower(e.title) collate "C",e.id)<($19 collate "C",$18)
   else (e.starts_at,e.id)>($17,$18) end)
  order by '||order_sql||' limit $21+1), page as (select * from candidates order by '||page_order||' limit $21),
  numbered as (select *,row_number() over(order by '||page_order||') rn from page)
  select jsonb_build_object(''items'',coalesce((select jsonb_agg(private.event_api_summary(id) order by rn) from numbered),''[]''::jsonb),
   ''hasMore'',(select count(*)>$21 from candidates)) || coalesce((select jsonb_build_object(''position'',
    jsonb_build_object(''id'',id,''startsAt'',starts_at,''sort'',$20)||case when $20 in (''title-asc'',''title-desc'') then jsonb_build_object(''titleKey'',title_key) else ''{}''::jsonb end)
    from numbered order by rn desc limit 1),''{}''::jsonb)';
 execute statement into p_filters using country_code,city_filter,game_filter,search_text,timing,seats,after_time,before_time,
 exclusive_before,category_filter,tag_filters,experience_filter,max_age,from_minute,to_minute,zone,cursor_time,cursor_id,cursor_title,ordering,n;
 return p_filters;
end; $$;
-- CREATE OR REPLACE preserves the existing NOLOGIN/NOBYPASSRLS executor and ACL.
reset role;
revoke create on schema private from rollcall_events_executor;
revoke rollcall_events_executor from current_user;
notify pgrst,'reload schema';
commit;
