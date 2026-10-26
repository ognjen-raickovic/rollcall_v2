-- Milestone 4D: private Storage, host + backend operation authorization, and
-- recoverable image lifecycle. File operations always use the Storage HTTP API.
begin;
grant rollcall_events_executor to current_user;
grant usage on schema extensions to rollcall_events_executor;
grant execute on function extensions.digest(text,text) to rollcall_events_executor;

-- Bucket configuration is reproducible; no object metadata is fabricated here.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('event-covers', 'event-covers', false, 3145728,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 3145728,
  allowed_mime_types = excluded.allowed_mime_types;

create table private.event_cover_config (
  singleton boolean primary key default true check (singleton),
  operation_key_hash text not null check (operation_key_hash ~ '^[0-9a-f]{64}$')
);
create table private.event_cover_objects (
  path text primary key,
  event_id uuid not null,
  host_id uuid not null,
  version uuid not null unique,
  state text not null default 'pending' check (state in ('pending', 'active', 'cleanup', 'deleted')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (path = event_id::text || '/' || version::text || '.webp')
);
create index event_cover_cleanup_by_event on private.event_cover_objects(event_id, host_id, state, created_at);
create unique index event_cover_one_active on private.event_cover_objects(event_id) where state = 'active';
alter table private.event_cover_config enable row level security;
alter table private.event_cover_objects enable row level security;
revoke all on private.event_cover_config, private.event_cover_objects from public, anon, authenticated, service_role;
grant select on private.event_cover_config to rollcall_events_executor;
grant select, insert, update on private.event_cover_objects to rollcall_events_executor;
create policy cover_executor_config on private.event_cover_config for select
  to rollcall_events_executor using (true);
-- Only hardened functions owned by this existing NOLOGIN/NOBYPASSRLS role can
-- reach the manifest. Request roles cannot assume the role or access these tables.
create policy cover_executor_manifest_read on private.event_cover_objects for select
  to rollcall_events_executor using (true);
create policy cover_executor_manifest_insert on private.event_cover_objects for insert
  to rollcall_events_executor with check (host_id = (select private.event_api_actor()));
create policy cover_executor_manifest_update on private.event_cover_objects for update
  to rollcall_events_executor using (true) with check (true);

-- Existing records may only reference registered images. Old API contracts have
-- never accepted non-null paths, so an unexpected historical value fails safely.
alter table public.events add constraint events_cover_object_fk foreign key(cover_storage_path)
  references private.event_cover_objects(path);

create function private.event_cover_operation_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select operation_key_hash = encode(extensions.digest(
    coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-rollcall-cover-key', ''),
    'sha256'), 'hex') from private.event_cover_config where singleton), false);
$$;

create function private.event_cover_storage_allowed(p_path text, p_action text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare record private.event_cover_objects%rowtype; actor uuid := private.event_api_actor();
begin
  select * into record from private.event_cover_objects where path = p_path;
  if not found then return false; end if;
  if p_action in ('read', 'sign') then
    return (p_action = 'read' or private.event_cover_operation_allowed())
      and record.state = 'active' and exists (select 1 from public.events e
      where e.id = record.event_id and e.cover_storage_path = record.path
        and (e.visibility in ('public','unlisted') or e.host_id = actor or exists
          (select 1 from public.event_participants p where p.event_id = e.id and p.profile_id = actor)));
  end if;
  if actor is null or record.host_id <> actor or not private.event_cover_operation_allowed() then
    return false;
  end if;
  if p_action = 'insert' then
    return record.state = 'pending' and record.created_at > clock_timestamp() - interval '15 minutes'
      and exists (select 1 from public.events e where e.id = record.event_id and e.host_id = actor);
  elsif p_action = 'delete' then
    return record.state in ('cleanup', 'deleted') and not exists
      (select 1 from public.events e where e.cover_storage_path = record.path);
  end if;
  return false;
end;
$$;

-- Fail closed when Storage does not identify an operation. Listing, signed
-- uploads, updates, moves, copies and S3/TUS bypasses are deliberately excluded.
create policy event_cover_download on storage.objects for select to anon, authenticated
  using (bucket_id = 'event-covers' and private.event_cover_storage_allowed(name, 'read')
    and (storage.allow_only_operation('object.get_authenticated')
      or storage.allow_only_operation('object.get_authenticated_info')
      or storage.allow_only_operation('object.head_authenticated_info')));
-- Without this extra backend authorization, a legitimate reader could bypass
-- the API's short lifetime by asking Storage directly for a long-lived URL.
create policy event_cover_sign on storage.objects for select to anon, authenticated
  using (bucket_id = 'event-covers' and private.event_cover_storage_allowed(name, 'sign')
    and (storage.allow_only_operation('object.sign') or storage.allow_only_operation('object.sign_many')));
create policy event_cover_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'event-covers' and private.event_cover_storage_allowed(name, 'insert')
    and storage.allow_only_operation('object.upload'));
create policy event_cover_delete on storage.objects for delete to authenticated
  using (bucket_id = 'event-covers' and private.event_cover_storage_allowed(name, 'delete')
    and (storage.allow_only_operation('object.delete') or storage.allow_only_operation('object.delete_many')));
-- Storage's checked writes may also read a reservation/retired object's metadata.
create policy event_cover_operation_read on storage.objects for select to authenticated
  using (bucket_id = 'event-covers' and
    ((storage.allow_only_operation('object.upload') and private.event_cover_storage_allowed(name, 'insert'))
      or ((storage.allow_only_operation('object.delete') or storage.allow_only_operation('object.delete_many'))
        and private.event_cover_storage_allowed(name, 'delete'))));

grant usage on schema storage to rollcall_events_executor;
grant select (bucket_id, name, metadata) on storage.objects to rollcall_events_executor;
create policy event_cover_executor_metadata on storage.objects for select to rollcall_events_executor
  using (bucket_id = 'event-covers' and private.event_cover_operation_allowed());

create function private.event_cover_require_operation()
returns uuid language plpgsql stable security invoker set search_path = '' as $$
declare actor uuid := private.event_api_actor();
begin
  if actor is null or not private.event_cover_operation_allowed() then
    raise exception using errcode = '42501', message = 'Authorized image operation required.';
  end if;
  return actor;
end;
$$;

create function private.event_cover_reserve(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.event_cover_require_operation(); image_id uuid := gen_random_uuid(); object_path text;
begin
  perform 1 from public.events where id = p_event_id and host_id = actor for update;
  if not found then raise exception using errcode = 'P0002', message = 'Event not found.'; end if;
  if (select count(*) from private.event_cover_objects where event_id = p_event_id and state in ('pending','cleanup')) >= 20 then
    raise exception using errcode = 'RC001', message = 'Finish pending image cleanup before another upload.';
  end if;
  object_path := p_event_id::text || '/' || image_id::text || '.webp';
  insert into private.event_cover_objects(path, event_id, host_id, version)
    values (object_path, p_event_id, actor, image_id);
  return jsonb_build_object('eventId', p_event_id, 'path', object_path, 'version', image_id);
end;
$$;

create function private.event_cover_commit(p_event_id uuid, p_path text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.event_cover_require_operation(); item public.events%rowtype;
  image private.event_cover_objects%rowtype;
begin
  select * into item from public.events where id = p_event_id and host_id = actor for update;
  if not found then raise exception using errcode = 'P0002', message = 'Event not found.'; end if;
  select * into image from private.event_cover_objects
    where path = p_path and event_id = p_event_id and host_id = actor for update;
  if not found then raise exception using errcode = '22023', message = 'Invalid image reservation.'; end if;
  if image.state = 'active' and item.cover_storage_path = p_path then
    return jsonb_build_object('eventId', p_event_id, 'cover', private.event_api_summary(p_event_id)->'cover');
  end if;
  if image.state <> 'pending' or image.created_at <= clock_timestamp() - interval '15 minutes' then
    raise exception using errcode = '22023', message = 'Image reservation expired.';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'event-covers' and name = p_path
    and metadata->>'mimetype' = 'image/webp'
    and coalesce((metadata->>'size')::bigint, 0) between 1 and 3145728) then
    raise exception using errcode = '22023', message = 'Validated image upload is missing.';
  end if;
  update private.event_cover_objects set state = 'cleanup', updated_at = clock_timestamp()
    where event_id = p_event_id and state = 'active' and path <> p_path;
  update private.event_cover_objects set state = 'active', updated_at = clock_timestamp() where path = p_path;
  update public.events set cover_storage_path = p_path where id = p_event_id;
  set constraints public.events_require_location, private.event_locations_required immediate;
  set constraints public.events_require_location, private.event_locations_required deferred;
  return jsonb_build_object('eventId', p_event_id, 'cover', private.event_api_summary(p_event_id)->'cover');
end;
$$;

create function private.event_cover_remove(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.event_cover_require_operation();
begin
  perform 1 from public.events where id = p_event_id and host_id = actor for update;
  if not found then raise exception using errcode = 'P0002', message = 'Event not found.'; end if;
  update public.events set cover_storage_path = null where id = p_event_id;
  update private.event_cover_objects set state = 'cleanup', updated_at = clock_timestamp()
    where event_id = p_event_id and host_id = actor and state = 'active';
  set constraints public.events_require_location, private.event_locations_required immediate;
  set constraints public.events_require_location, private.event_locations_required deferred;
  return jsonb_build_object('eventId', p_event_id, 'cover', private.event_api_summary(p_event_id)->'cover');
end;
$$;

create function private.event_cover_abort(p_event_id uuid, p_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.event_cover_require_operation();
begin
  -- Same event lock as commit/TTL cleanup. A lost commit acknowledgement must
  -- never make an active object eligible for compensating deletion.
  perform 1 from public.events where id = p_event_id and host_id = actor for update;
  update private.event_cover_objects set state = 'cleanup', updated_at = clock_timestamp()
    where event_id = p_event_id and path = p_path and host_id = actor and state = 'pending';
end;
$$;

create function private.event_cover_pending_cleanup(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.event_cover_require_operation();
begin
  perform 1 from public.events where id = p_event_id and host_id = actor for update;
  update private.event_cover_objects set state = 'cleanup', updated_at = clock_timestamp()
    where event_id = p_event_id and host_id = actor and state = 'pending'
      and created_at <= clock_timestamp() - interval '15 minutes';
  return coalesce((select jsonb_agg(jsonb_build_object('eventId', event_id, 'path', path, 'version', version)
    order by case when state = 'cleanup' then 0 else 1 end, created_at, path) from (select * from private.event_cover_objects image
      where image.event_id = p_event_id and image.host_id = actor
        and (image.state = 'cleanup' or (image.state = 'deleted' and exists
          (select 1 from storage.objects o where o.bucket_id = 'event-covers' and o.name = image.path)))
        and not exists (select 1 from public.events e where e.cover_storage_path = image.path)
      order by case when image.state = 'cleanup' then 0 else 1 end, image.created_at, image.path limit 20) batch), '[]'::jsonb);
end;
$$;

create function private.event_cover_complete_cleanup(p_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.event_cover_require_operation(); image private.event_cover_objects%rowtype;
begin
  select * into image from private.event_cover_objects where path = p_path and host_id = actor for update;
  if not found then return; end if;
  if image.state not in ('cleanup', 'deleted') or exists
    (select 1 from public.events e where e.cover_storage_path = p_path) then
    raise exception using errcode = '22023', message = 'Active images cannot be cleaned up.';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'event-covers' and name = p_path) then
    raise exception using errcode = 'RC001', message = 'Storage removal is not complete.';
  end if;
  -- Keep a scoped tombstone so a late interrupted upload remains recoverable.
  update private.event_cover_objects set state = 'deleted', updated_at = clock_timestamp() where path = p_path;
end;
$$;

create function private.event_cover_get(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare item public.events%rowtype; image private.event_cover_objects%rowtype;
begin
  select * into item from public.events where id = p_event_id;
  if not found then raise exception using errcode = 'P0002', message = 'Event not found.'; end if;
  if item.cover_storage_path is null then return null; end if;
  select * into image from private.event_cover_objects where path = item.cover_storage_path and state = 'active';
  if not found then return null; end if;
  return jsonb_build_object('eventId', item.id, 'path', image.path, 'version', image.version,
    'visibility', item.visibility);
end;
$$;

create function private.event_cover_event_deleted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update private.event_cover_objects set state = 'cleanup', updated_at = clock_timestamp()
    where event_id = old.id and state in ('active','pending');
  return old;
end;
$$;
create trigger events_cover_cleanup before delete on public.events
  for each row execute function private.event_cover_event_deleted();

-- Event metadata remains safe and stable; signed URLs are issued separately.
create or replace function private.event_api_summary(p_event_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id, 'title', e.title,
    'game', jsonb_build_object('id', g.id, 'name', g.name, 'category', g.category),
    'city', jsonb_build_object('id', city.id, 'name', city.name, 'administrativeDivision', city.administrative_division),
    'country', jsonb_build_object('id', country.id, 'isoCode', country.iso_code, 'name', country.name),
    'venue', e.venue, 'startsAt', e.starts_at, 'endsAt', e.ends_at,
    'capacity', e.capacity, 'participantCount', e.participant_count,
    'availableSlots', e.capacity - e.participant_count,
    'tags', e.tags, 'visibility', e.visibility, 'status', e.status,
    'cover', jsonb_build_object('kind', case when image.path is null then 'default' else 'custom' end,
      'imageUrl', case g.category
        when 'board-game' then '/images/board-games.svg'
        when 'role-playing' then '/images/role-playing.svg'
        when 'trading-card' then '/images/trading-card.svg'
        when 'social-deduction' then '/images/social-deduction.svg' end)
      || case when image.path is null then '{}'::jsonb else jsonb_build_object('version', image.version) end
  ) from public.events e join public.games g on g.id = e.game_id
    join public.cities city on city.id = e.city_id
    join public.countries country on country.id = city.country_id
    left join private.event_cover_objects image on image.path = e.cover_storage_path and image.state = 'active'
  where e.id = p_event_id;
$$;

-- A normal content PATCH cannot clear an image through its legacy null marker.
-- It still validates/rejects every non-null caller-provided Storage path.
do $$
declare routine regprocedure := 'private.event_api_update(uuid,jsonb)'::regprocedure; body text;
begin
  body := pg_get_functiondef(routine);
  if position('if input ? ''coverStoragePath'' then next.cover_storage_path := null; end if;' in body) = 0 then
    raise exception 'Unexpected event update definition; review cover preservation before migrating.';
  end if;
  execute replace(body, 'if input ? ''coverStoragePath'' then next.cover_storage_path := null; end if;',
    '-- coverStoragePath:null is a legacy default marker; only checked cover operations change the association.');
end;
$$;

grant create on schema private to rollcall_events_executor;
do $$
declare routine regprocedure;
begin
  for routine in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname like 'event_cover_%'
  loop
    execute format('alter function %s owner to rollcall_events_executor', routine);
    execute format('revoke all on function %s from public, anon, authenticated, service_role', routine);
  end loop;
end;
$$;
revoke create on schema private from rollcall_events_executor;
grant execute on function private.event_cover_storage_allowed(text,text) to anon,authenticated;
grant execute on function private.event_cover_reserve(uuid), private.event_cover_commit(uuid,text),
  private.event_cover_remove(uuid), private.event_cover_abort(uuid,text),
  private.event_cover_pending_cleanup(uuid), private.event_cover_complete_cleanup(text) to authenticated;
grant execute on function private.event_cover_get(uuid) to anon,authenticated;

create function public.reserve_event_cover(p_event_id uuid) returns jsonb language sql security invoker set search_path = '' as $$
  select private.event_cover_reserve(p_event_id);
$$;
create function public.commit_event_cover(p_event_id uuid,p_path text) returns jsonb language sql security invoker set search_path = '' as $$
  select private.event_cover_commit(p_event_id,p_path);
$$;
create function public.remove_event_cover(p_event_id uuid) returns jsonb language sql security invoker set search_path = '' as $$
  select private.event_cover_remove(p_event_id);
$$;
create function public.abort_event_cover(p_event_id uuid,p_path text) returns void language sql security invoker set search_path = '' as $$
  select private.event_cover_abort(p_event_id,p_path);
$$;
create function public.pending_event_cover_cleanup(p_event_id uuid) returns jsonb language sql security invoker set search_path = '' as $$
  select private.event_cover_pending_cleanup(p_event_id);
$$;
create function public.complete_event_cover_cleanup(p_path text) returns void language sql security invoker set search_path = '' as $$
  select private.event_cover_complete_cleanup(p_path);
$$;
create function public.get_event_cover(p_event_id uuid) returns jsonb language sql security invoker set search_path = '' as $$
  select private.event_cover_get(p_event_id);
$$;
revoke all on function public.reserve_event_cover(uuid), public.commit_event_cover(uuid,text),
  public.remove_event_cover(uuid), public.abort_event_cover(uuid,text),
  public.pending_event_cover_cleanup(uuid), public.complete_event_cover_cleanup(text),
  public.get_event_cover(uuid) from public,anon,authenticated,service_role;
grant execute on function public.reserve_event_cover(uuid), public.commit_event_cover(uuid,text),
  public.remove_event_cover(uuid), public.abort_event_cover(uuid,text),
  public.pending_event_cover_cleanup(uuid), public.complete_event_cover_cleanup(text) to authenticated;
grant execute on function public.get_event_cover(uuid) to anon,authenticated;

comment on table private.event_cover_config is 'Only a SHA-256 operation-key hash. Secret stays in backend configuration; no API role can change/read this table.';
comment on table private.event_cover_objects is 'Server-authorized image reservations, active associations and bounded per-event cleanup/tombstones. No file bytes or signed URLs.';
comment on column public.events.cover_storage_path is 'Registered private event-covers object. Only checked cover operations may attach/remove it; never a data URL or signed URL.';
revoke rollcall_events_executor from current_user;
notify pgrst, 'reload schema';
commit;
