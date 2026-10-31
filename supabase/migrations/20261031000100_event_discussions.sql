begin;
create role rollcall_discussion_executor nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant rollcall_discussion_executor to current_user;
grant rollcall_admin_executor,rollcall_status_executor to current_user;
grant usage on schema public,private to rollcall_discussion_executor;
grant execute on function private.require_active_account(),private.my_permissions() to rollcall_discussion_executor;
grant select(id,host_id,visibility,status,ends_at) on public.events to rollcall_discussion_executor;
-- SELECT FOR UPDATE needs an UPDATE grant/policy. No event mutation can pass WITH CHECK.
grant update(id) on public.events to rollcall_discussion_executor;
create policy discussion_event_read on public.events for select to rollcall_discussion_executor using(true);
create policy discussion_event_lock on public.events for update to rollcall_discussion_executor using(true) with check(false);
grant select(event_id,profile_id) on public.event_participants to rollcall_discussion_executor;
create policy discussion_members_read on public.event_participants for select to rollcall_discussion_executor using(true);
grant select(id,display_name) on public.profiles to rollcall_discussion_executor;
create policy discussion_authors_read on public.profiles for select to rollcall_discussion_executor using(true);

create table private.event_comments (
 id uuid primary key default gen_random_uuid(),
 position bigint generated always as identity unique,
 event_id uuid not null references public.events(id) on delete cascade,
 author_id uuid references public.profiles(id) on delete set null,
 parent_id uuid references private.event_comments(id) on delete cascade,
 body text check(body=btrim(body) and char_length(body) between 1 and 2000),
 deleted boolean not null default false,
 hidden boolean not null default false,
 created_at timestamptz not null default clock_timestamp(),
 edited_at timestamptz,
 check(deleted or body is not null)
);
create index comments_event_thread_page on private.event_comments(event_id,parent_id,position);
create table private.event_reviews (
 id uuid primary key default gen_random_uuid(),
 position bigint generated always as identity unique,
 event_id uuid not null references public.events(id) on delete cascade,
 author_id uuid references public.profiles(id) on delete set null,
 rating integer check(rating between 1 and 5),
 body text check(body=btrim(body) and char_length(body) between 1 and 2000),
 deleted boolean not null default false,
 hidden boolean not null default false,
 created_at timestamptz not null default clock_timestamp(),
 edited_at timestamptz,
 unique(event_id,author_id),
 check(deleted or rating is not null)
);
create index reviews_event_page on private.event_reviews(event_id,position);
create table private.discussion_attempts (
 actor_id uuid primary key references public.profiles(id) on delete cascade,
 window_started_at timestamptz not null,
 attempts integer not null check(attempts between 1 and 31)
);
-- Snapshot identities intentionally survive event/account deletion. No comment bodies.
create table private.discussion_audit (
 id bigint generated always as identity primary key,
 event_id uuid not null,
 target_id uuid not null,
 kind text not null check(kind in ('comments','reviews')),
 actor_id uuid not null,
 authority text not null check(authority in ('host','admin','superadmin')),
 action text not null check(action='hide'),
 reason text not null check(reason=btrim(reason) and char_length(reason) between 5 and 500),
 created_at timestamptz not null default clock_timestamp()
);
create index discussion_audit_event on private.discussion_audit(event_id,id);
create trigger discussion_audit_immutable before update or delete on private.discussion_audit
 for each row execute function private.reject_audit_mutation();
create trigger discussion_audit_no_truncate before truncate on private.discussion_audit
 for each statement execute function private.reject_audit_mutation();

alter table private.event_comments enable row level security;
alter table private.event_reviews enable row level security;
alter table private.discussion_attempts enable row level security;
alter table private.discussion_audit enable row level security;
revoke all on private.event_comments,private.event_reviews,private.discussion_attempts,private.discussion_audit from public,anon,authenticated,service_role;
revoke all on sequence private.event_comments_position_seq,private.event_reviews_position_seq,private.discussion_audit_id_seq from public,anon,authenticated,service_role;
grant select,insert,update on private.event_comments,private.event_reviews,private.discussion_attempts to rollcall_discussion_executor;
grant insert on private.discussion_audit to rollcall_discussion_executor;
grant usage on sequence private.event_comments_position_seq,private.event_reviews_position_seq,private.discussion_audit_id_seq to rollcall_discussion_executor;
create policy discussion_comments_executor on private.event_comments to rollcall_discussion_executor using(true) with check(true);
create policy discussion_reviews_executor on private.event_reviews to rollcall_discussion_executor using(true) with check(true);
create policy discussion_attempts_executor on private.discussion_attempts to rollcall_discussion_executor using(true) with check(true);
create policy discussion_audit_append on private.discussion_audit for insert to rollcall_discussion_executor with check(true);

-- Caller-only helper. Every exposed RPC goes through this checked dispatcher; no raw rows.
create function private.event_discussion(p_event_id uuid,p_kind text,p_operation text,p_input jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 actor uuid:=private.require_active_account();
 event_row record; target record; parent_row record; member boolean; moderator boolean;
 actor_role text; authority text; open_comments boolean; open_reviews boolean;
 target_id uuid; selected_parent uuid; body_value text; rating_value integer; reason_value text;
 after_value bigint:=0; page_limit integer:=20; used integer; result_id uuid;
 rows_value jsonb; last_position bigint; has_more boolean; permissions jsonb; checked_at timestamptz;
begin
 if p_event_id is null or p_kind is null or p_kind not in ('comments','reviews') or p_operation is null
  or p_operation not in ('list','create','edit','delete','hide') or p_input is null or jsonb_typeof(p_input)<>'object'
  or octet_length(p_input::text)>16000 then
  raise exception using errcode='22023',message='Invalid discussion request.';
 end if;
 if exists(select 1 from jsonb_object_keys(p_input) k where k<>all(case p_operation
   when 'list' then array['cursor','limit','parentId'] when 'create' then array['body','rating','parentId']
   when 'edit' then array['id','body','rating'] when 'delete' then array['id'] else array['id','reason'] end)) then
  raise exception using errcode='22023',message='Unexpected discussion field.';
 end if;
 if p_operation='list' then
  if p_input ? 'cursor' then
   if jsonb_typeof(p_input->'cursor')<>'string' or p_input->>'cursor' !~ '^[0-9]{1,18}$' then raise exception using errcode='22023',message='Invalid cursor.'; end if;
   after_value:=(p_input->>'cursor')::bigint;
  end if;
  if p_input ? 'limit' then
   if jsonb_typeof(p_input->'limit')<>'number' or p_input->>'limit' !~ '^[0-9]{1,2}$' then raise exception using errcode='22023',message='Invalid page size.'; end if;
   page_limit:=(p_input->>'limit')::integer;
  end if;
  if page_limit not between 1 and 20 then raise exception using errcode='22023',message='Invalid page size.'; end if;
 end if;
 if p_input ? 'parentId' then
  if p_kind<>'comments' or jsonb_typeof(p_input->'parentId')<>'string' then raise exception using errcode='22023',message='Invalid parent.'; end if;
  selected_parent:=(p_input->>'parentId')::uuid;
 end if;
 if p_operation in ('edit','delete','hide') then
  if coalesce(jsonb_typeof(p_input->'id'),'null')<>'string' then raise exception using errcode='22023',message='Target required.'; end if;
  target_id:=(p_input->>'id')::uuid;
 end if;
 if p_operation in ('create','edit') then
  if p_kind='comments' and (coalesce(jsonb_typeof(p_input->'body'),'null')<>'string' or p_input ? 'rating') then
   raise exception using errcode='22023',message='Comment text required.';
  end if;
  if p_input ? 'body' and jsonb_typeof(p_input->'body') not in ('string','null') then raise exception using errcode='22023',message='Invalid text.'; end if;
  body_value:=nullif(btrim(p_input->>'body'),'');
  if (p_kind='comments' and body_value is null) or char_length(body_value)>2000
   or coalesce(body_value,'') ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' then
   raise exception using errcode='22023',message='Use bounded plain text.';
  end if;
  if p_kind='reviews' then
   if coalesce(jsonb_typeof(p_input->'rating'),'null')<>'number' or p_input->>'rating' !~ '^[1-5]$' then
    raise exception using errcode='22023',message='Use a rating from 1 to 5.';
   end if;
   rating_value:=(p_input->>'rating')::integer;
  end if;
 end if;
 if p_operation='hide' then
  if coalesce(jsonb_typeof(p_input->'reason'),'null')<>'string' then raise exception using errcode='22023',message='Reason required.'; end if;
  reason_value:=btrim(p_input->>'reason');
  if char_length(reason_value) not between 5 and 500 then raise exception using errcode='22023',message='Use a reason from 5 to 500 characters.'; end if;
 end if;
 if p_operation<>'list' then
  if actor is null then raise exception using errcode='42501',message='Authentication required.'; end if;
  -- Committed outcomes, including inaccessible/closed/duplicate targets, consume budget.
  insert into private.discussion_attempts(actor_id,window_started_at,attempts) values(actor,clock_timestamp(),1)
  on conflict(actor_id) do update set
   attempts=case when discussion_attempts.window_started_at<clock_timestamp()-interval '15 minutes' then 1 else least(discussion_attempts.attempts+1,31) end,
   window_started_at=case when discussion_attempts.window_started_at<clock_timestamp()-interval '15 minutes' then clock_timestamp() else discussion_attempts.window_started_at end
  returning attempts into used;
  if used>30 then return jsonb_build_object('errorCode','limited'); end if;
 end if;
 -- Same physical parent lock as editing, cancellation, attendance and event deletion.
 -- clock_timestamp is evaluated AFTER waiting, never transaction-start now().
 select id,host_id,visibility,status,ends_at into event_row from public.events where id=p_event_id for update;
 if not found then return jsonb_build_object('errorCode','not_found'); end if;
 member:=actor is not null and exists(select 1 from public.event_participants where event_id=p_event_id and profile_id=actor);
 if event_row.visibility='private' and actor is distinct from event_row.host_id and not member then
  return jsonb_build_object('errorCode','not_found');
 end if;
 actor_role:=case when actor is null then 'user' else private.my_permissions()->>'role' end;
 moderator:=actor_role in ('admin','superadmin');
 authority:=case when moderator then actor_role else 'host' end;
 checked_at:=clock_timestamp();
 open_comments:=event_row.status<>'cancelled' and checked_at<event_row.ends_at;
 open_reviews:=event_row.status<>'cancelled' and checked_at>=event_row.ends_at;
 permissions:=jsonb_build_object('commentsOpen',open_comments,'reviewsOpen',open_reviews,
  'canComment',actor is not null and open_comments,
  'canReview',actor is not null and member and actor<>event_row.host_id and open_reviews
   and not exists(select 1 from private.event_reviews r where r.event_id=p_event_id and r.author_id=actor and (not r.deleted or r.hidden)),
  'canModerateComments',actor is not null and (moderator or actor=event_row.host_id),
  'canModerateReviews',actor is not null and moderator,
  'serverTime',checked_at,'endsAt',event_row.ends_at,'cancelled',event_row.status='cancelled');
 if selected_parent is not null then
  select id,deleted,hidden from private.event_comments where id=selected_parent and event_id=p_event_id and event_comments.parent_id is null into parent_row;
  if not found then return jsonb_build_object('errorCode','not_found'); end if;
  if p_operation='create' and (parent_row.hidden or parent_row.deleted) then return jsonb_build_object('errorCode','closed'); end if;
 end if;
 if p_operation='list' then
  if p_kind='comments' then
   select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'parentId',c.parent_id,
    'author',case when c.author_id is null then null else jsonb_build_object('id',c.author_id,'displayName',p.display_name) end,
    'isHost',coalesce(c.author_id=event_row.host_id,false),'body',case when not c.deleted and not c.hidden then c.body end,
    'deleted',c.deleted,'hidden',c.hidden,'createdAt',c.created_at,'editedAt',c.edited_at,
    'canEdit',coalesce(actor=c.author_id and not c.deleted and not c.hidden and open_comments,false),
    'canDelete',coalesce(actor=c.author_id and not c.deleted,false),
    'replyCount',(select count(*) from private.event_comments r where r.parent_id=c.id)) order by c.position),'[]'::jsonb),max(c.position)
   into rows_value,last_position from (select * from private.event_comments c where c.event_id=p_event_id
    and c.parent_id is not distinct from selected_parent and c.position>after_value order by c.position limit page_limit) c
    left join public.profiles p on p.id=c.author_id;
   select exists(select 1 from private.event_comments c where c.event_id=p_event_id and c.parent_id is not distinct from selected_parent
    and c.position>coalesce(last_position,after_value)) into has_more;
  else
   select coalesce(jsonb_agg(jsonb_build_object('id',r.id,
    'author',case when r.author_id is null then null else jsonb_build_object('id',r.author_id,'displayName',p.display_name) end,
    'body',case when not r.deleted and not r.hidden then r.body end,'rating',case when not r.deleted and not r.hidden then r.rating end,
    'deleted',r.deleted,'hidden',r.hidden,'createdAt',r.created_at,'editedAt',r.edited_at,
    'canEdit',coalesce(actor=r.author_id and not r.deleted and not r.hidden and open_reviews,false),
    'canDelete',coalesce(actor=r.author_id and not r.deleted,false)) order by r.position),'[]'::jsonb),max(r.position)
   into rows_value,last_position from (select * from private.event_reviews r where r.event_id=p_event_id and r.position>after_value
    order by r.position limit page_limit) r left join public.profiles p on p.id=r.author_id;
   select exists(select 1 from private.event_reviews r where r.event_id=p_event_id and r.position>coalesce(last_position,after_value)) into has_more;
  end if;
  return jsonb_build_object('eventId',p_event_id,'viewerId',actor,'kind',p_kind,'items',rows_value,
   'permissions',permissions,'nextCursor',case when has_more then last_position::text end);
 end if;
 if p_operation='create' then
  if p_kind='comments' then
   if not open_comments then return jsonb_build_object('errorCode','closed'); end if;
   insert into private.event_comments(event_id,author_id,parent_id,body) values(p_event_id,actor,selected_parent,body_value) returning id into result_id;
  else
   if not open_reviews then return jsonb_build_object('errorCode','closed'); end if;
   if not member or actor=event_row.host_id then return jsonb_build_object('errorCode','forbidden'); end if;
   select id,deleted,hidden into target from private.event_reviews where event_id=p_event_id and author_id=actor;
   if found then
    if not target.deleted or target.hidden then return jsonb_build_object('errorCode','duplicate'); end if;
    update private.event_reviews set deleted=false,body=body_value,rating=rating_value,edited_at=clock_timestamp() where id=target.id;
    result_id:=target.id;
   else
    insert into private.event_reviews(event_id,author_id,rating,body) values(p_event_id,actor,rating_value,body_value) returning id into result_id;
   end if;
  end if;
 else
  if p_kind='comments' then
   select id,author_id,deleted,hidden into target from private.event_comments where id=target_id and event_id=p_event_id;
  else
   select id,author_id,deleted,hidden into target from private.event_reviews where id=target_id and event_id=p_event_id;
  end if;
  if not found then return jsonb_build_object('errorCode','not_found'); end if;
  result_id:=target.id;
  if p_operation='hide' then
   if not moderator and not (p_kind='comments' and actor=event_row.host_id) then return jsonb_build_object('errorCode','forbidden'); end if;
   if target.hidden or target.deleted then return jsonb_build_object('errorCode','closed'); end if;
   insert into private.discussion_audit(event_id,target_id,kind,actor_id,authority,action,reason)
    values(p_event_id,target.id,p_kind,actor,authority,'hide',reason_value);
   if p_kind='comments' then update private.event_comments set hidden=true where id=target.id;
   else update private.event_reviews set hidden=true where id=target.id; end if;
  else
   if actor is distinct from target.author_id then return jsonb_build_object('errorCode','forbidden'); end if;
   if p_operation='edit' then
    if target.hidden or target.deleted or (p_kind='comments' and not open_comments) or (p_kind='reviews' and not open_reviews) then return jsonb_build_object('errorCode','closed'); end if;
    if p_kind='reviews' and (not member or actor=event_row.host_id) then return jsonb_build_object('errorCode','forbidden'); end if;
    if p_kind='comments' then update private.event_comments set body=body_value,edited_at=clock_timestamp() where id=target.id;
    else update private.event_reviews set body=body_value,rating=rating_value,edited_at=clock_timestamp() where id=target.id; end if;
   else
    if p_kind='comments' then update private.event_comments set body=null,deleted=true where id=target.id;
    else update private.event_reviews set body=null,rating=null,deleted=true where id=target.id; end if;
   end if;
  end if;
 end if;
 return jsonb_build_object('eventId',p_event_id,'viewerId',actor,'id',result_id);
end; $$;

grant create on schema private to rollcall_discussion_executor;
alter function private.event_discussion(uuid,text,text,jsonb) owner to rollcall_discussion_executor;
revoke create on schema private from rollcall_discussion_executor;
revoke all on function private.event_discussion(uuid,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.event_discussion(uuid,text,text,jsonb) to anon,authenticated;
create function public.event_discussion(p_event_id uuid,p_kind text,p_operation text,p_input jsonb default '{}'::jsonb)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select private.event_discussion(p_event_id,p_kind,p_operation,p_input);
$$;
revoke all on function public.event_discussion(uuid,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.event_discussion(uuid,text,text,jsonb) to anon,authenticated;
revoke rollcall_discussion_executor,rollcall_admin_executor,rollcall_status_executor from current_user;
commit;
