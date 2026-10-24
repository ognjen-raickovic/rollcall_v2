-- Milestone 1: relational foundations. Only geography is exposed to API roles.
-- Every later capability must add focused grants/policies in a new migration.
begin;

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;
revoke create on schema public from public, anon, authenticated;

-- Supabase defaults may grant much more than this application needs.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;
alter default privileges for role postgres revoke execute on functions from public;

create table public.countries (
  id integer generated always as identity primary key,
  iso_code text not null unique check (iso_code ~ '^[A-Z]{2}$'),
  name text not null check (name = btrim(name) and char_length(name) between 2 and 100),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.cities (
  id integer generated always as identity primary key,
  country_id integer not null references public.countries(id) on delete restrict,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 200),
  normalized_name text collate "C" not null,
  administrative_division text check (char_length(administrative_division) between 1 and 200),
  latitude numeric(9,6) check (latitude between -90 and 90),
  longitude numeric(9,6) check (longitude between -180 and 180),
  population bigint check (population >= 0),
  external_source text check (char_length(external_source) between 1 and 50),
  external_source_id text check (char_length(external_source_id) between 1 and 100),
  created_at timestamptz not null default now(),
  unique (id, country_id),
  check ((external_source is null) = (external_source_id is null)),
  check ((latitude is null) = (longitude is null))
);
create unique index cities_source_identity_idx
  on public.cities (external_source, external_source_id)
  where external_source_id is not null;
-- Names are not unique: two settlements in one country can share a name.
create index cities_country_name_prefix_idx
  on public.cities (country_id, normalized_name text_pattern_ops);
create index cities_country_suggestions_idx
  on public.cities (country_id, population desc nulls last, normalized_name, id);

create function private.normalize_city_name()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.normalized_name := pg_catalog.lower(extensions.unaccent(pg_catalog.btrim(new.name)));
  return new;
end;
$$;
create trigger normalize_city_name before insert or update of name, normalized_name
  on public.cities for each row execute function private.normalize_city_name();

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (display_name = btrim(display_name) and char_length(display_name) between 2 and 80),
  country_id integer references public.countries(id) on delete restrict,
  city_id integer,
  biography text check (char_length(biography) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (city_id is null or country_id is not null),
  foreign key (city_id, country_id) references public.cities(id, country_id) on delete restrict
);
create index profiles_country_idx on public.profiles(country_id);
create index profiles_city_country_idx on public.profiles(city_id, country_id);

-- Birth year is optional, private and self-declared, not identity/age verification.
create table private.profile_private (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  birth_year smallint check (birth_year >= 1900),
  age_declared_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((birth_year is null) = (age_declared_at is null))
);

-- No client grants; no role is read from editable Auth metadata.
-- Missing assignment means ordinary user. Promotion workflows are a later milestone.
create table private.account_roles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin', 'superadmin')),
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index account_roles_assigned_by_idx on private.account_roles(assigned_by);

create table public.games (
  id integer generated always as identity primary key,
  name text not null unique check (name = btrim(name) and char_length(name) between 2 and 100),
  category text not null check (category in ('role-playing', 'trading-card', 'board-game', 'social-deduction')),
  description text not null check (char_length(description) between 10 and 1000),
  min_players integer not null check (min_players >= 1),
  max_players integer not null check (max_players >= min_players),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_game_experience (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  game_id integer not null references public.games(id) on delete restrict,
  experience_level text not null check (experience_level in ('beginner', 'intermediate', 'veteran')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, game_id)
);
create index user_game_experience_game_idx on public.user_game_experience(game_id);

-- Immutable helper used only by a CHECK; exact values mirror Workshop 3 tags.
create function private.valid_event_tags(tags text[], experience text)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select coalesce(
    pg_catalog.cardinality(tags) <= 6
    and not exists (select 1 from pg_catalog.unnest(tags) tag where tag is null)
    and tags <@ array['Beginner friendly', 'Veterans only', 'Casual', 'Competitive',
      'One-shot', 'Campaign', 'Bring your own deck', 'Equipment provided']::text[]
    and pg_catalog.cardinality(tags) = (select count(distinct tag) from pg_catalog.unnest(tags) tag)
    and not ('Beginner friendly' = any(tags) and 'Veterans only' = any(tags))
    and (not ('Beginner friendly' = any(tags)) or experience in ('all-levels', 'beginner'))
    and (not ('Veterans only' = any(tags)) or experience = 'experienced')
  , false);
$$;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete restrict,
  game_id integer not null references public.games(id) on delete restrict,
  city_id integer not null references public.cities(id) on delete restrict,
  title text not null check (title = btrim(title) and char_length(title) between 3 and 100),
  description text not null check (description = btrim(description) and char_length(description) between 10 and 5000),
  venue text check (venue = btrim(venue) and char_length(venue) between 2 and 120),
  starts_at timestamptz not null check (isfinite(starts_at)),
  ends_at timestamptz not null check (isfinite(ends_at) and ends_at > starts_at),
  capacity integer not null check (capacity between 1 and 100),
  participant_count integer not null default 0 check (participant_count >= 0 and participant_count <= capacity),
  experience_level text not null check (experience_level in ('all-levels', 'beginner', 'experienced')),
  price numeric not null default 0 check (price between 0 and 10000 and price = round(price, 2)),
  currency text not null default 'EUR' check (currency = 'EUR'),
  cover_storage_path text check (char_length(cover_storage_path) between 1 and 500),
  tags text[] not null default '{}' check (private.valid_event_tags(tags, experience_level)),
  minimum_age integer not null default 0 check (minimum_age between 0 and 99),
  visibility text not null default 'public' check (visibility in ('public', 'private', 'unlisted')),
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index events_host_idx on public.events(host_id);
create index events_game_idx on public.events(game_id);
create index events_city_idx on public.events(city_id);
create index events_discovery_idx on public.events(starts_at, id)
  where visibility = 'public' and status = 'scheduled';

-- Exact addresses are never columns on public event records. A later authenticated
-- endpoint will decide when to release them; an opt-in flag alone cannot expose private events.
create table private.event_locations (
  event_id uuid primary key references public.events(id) on delete cascade,
  address text not null check (address = btrim(address) and char_length(address) between 3 and 200),
  share_publicly boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.event_participants (
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  joined_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);
create index event_participants_profile_idx on public.event_participants(profile_id);

create function private.touch_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;
create trigger profiles_updated before update on public.profiles for each row execute function private.touch_updated_at();
create trigger profile_private_updated before update on private.profile_private for each row execute function private.touch_updated_at();
create trigger account_roles_updated before update on private.account_roles for each row execute function private.touch_updated_at();
create trigger games_updated before update on public.games for each row execute function private.touch_updated_at();
create trigger user_game_experience_updated before update on public.user_game_experience for each row execute function private.touch_updated_at();
create trigger events_updated before update on public.events for each row execute function private.touch_updated_at();
create trigger event_locations_updated before update on private.event_locations for each row execute function private.touch_updated_at();

create function private.validate_birth_year()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.birth_year > extract(year from current_date) then
    raise exception using errcode = '23514', message = 'Birth year cannot be in the future.';
  end if;
  return new;
end;
$$;
create trigger validate_birth_year before insert or update on private.profile_private
  for each row execute function private.validate_birth_year();

create function private.validate_event_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.host_id <> old.host_id or new.created_at <> old.created_at then
      raise exception using errcode = '23514', message = 'Event identity and host are immutable.';
    end if;
    -- Internal attendance counter updates may touch an otherwise unchanged event.
    if (to_jsonb(new) - array['updated_at', 'participant_count']) =
       (to_jsonb(old) - array['updated_at', 'participant_count']) then
      return new;
    end if;
  elsif new.participant_count <> 0 then
    raise exception using errcode = '23514', message = 'A new event cannot have participants.';
  end if;
  if new.starts_at <= pg_catalog.now() then
    raise exception using errcode = '23514', message = 'Event start must be in the future.';
  end if;
  return new;
end;
$$;
create trigger validate_event_write before insert or update on public.events
  for each row execute function private.validate_event_write();

-- Run AFTER INSERT: ON CONFLICT DO NOTHING must not consume a seat. The atomic
-- parent UPDATE serializes concurrent joins and capacity edits on the same row.
-- No read-count-then-write race; unsuccessful membership inserts roll back together.
create function private.track_event_participation()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  changed_id uuid;
begin
  if tg_op = 'INSERT' then
    update public.events set participant_count = participant_count + 1
      where id = new.event_id and host_id <> new.profile_id
        and status = 'scheduled' and starts_at > pg_catalog.now()
        and participant_count < capacity
      returning id into changed_id;
    if changed_id is null then
      raise exception using errcode = '23514', message = 'Event is full, unavailable, or the participant is its host.';
    end if;
    return new;
  end if;
  -- An event's ON DELETE CASCADE removes attendance without requiring it to be open.
  if not exists (select 1 from public.events where id = old.event_id) then return old; end if;
  update public.events set participant_count = participant_count - 1
    where id = old.event_id and status = 'scheduled' and starts_at > pg_catalog.now()
    returning id into changed_id;
  if changed_id is null then
    raise exception using errcode = '23514', message = 'Attendance can only change before a scheduled event starts.';
  end if;
  return old;
end;
$$;
create trigger track_event_participation after insert or delete on public.event_participants
  for each row execute function private.track_event_participation();

create function private.immutable_participation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception using errcode = '23514', message = 'Participation records are immutable; use join/leave workflows.';
end;
$$;
create trigger immutable_participation before update on public.event_participants
  for each row execute function private.immutable_participation();

-- In-person events must have an address, but it is created privately in the same
-- transaction. Deferred checks permit either insert order and preserve cascade deletion.
create function private.require_event_location()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  event_id_to_check uuid;
begin
  if tg_table_schema = 'public' then event_id_to_check := new.id;
  else event_id_to_check := old.event_id; end if;
  if exists (select 1 from public.events where id = event_id_to_check)
    and not exists (select 1 from private.event_locations where event_id = event_id_to_check) then
    raise exception using errcode = '23514', message = 'An in-person event requires a private address record.';
  end if;
  return null;
end;
$$;
create constraint trigger events_require_location after insert or update on public.events
  deferrable initially deferred for each row execute function private.require_event_location();
create constraint trigger event_locations_required after delete or update on private.event_locations
  deferrable initially deferred for each row execute function private.require_event_location();

-- Lock all application objects down first, then open only the M1 geography surface.
revoke all on public.countries, public.cities, public.profiles, public.games,
  public.user_game_experience, public.events, public.event_participants
  from public, anon, authenticated, service_role;
revoke all on sequence public.countries_id_seq, public.cities_id_seq, public.games_id_seq
  from public, anon, authenticated, service_role;
revoke all on all tables in schema private from public, anon, authenticated, service_role;
revoke all on all functions in schema private from public, anon, authenticated, service_role;

alter table public.countries enable row level security;
alter table public.cities enable row level security;
alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.user_game_experience enable row level security;
alter table public.events enable row level security;
alter table public.event_participants enable row level security;
alter table private.profile_private enable row level security;
alter table private.account_roles enable row level security;
alter table private.event_locations enable row level security;

grant usage on schema public, extensions to anon, authenticated;
grant select on public.countries, public.cities to anon, authenticated;
create policy countries_enabled_read on public.countries for select to anon, authenticated
  using (enabled);
create policy cities_enabled_country_read on public.cities for select to anon, authenticated
  using (exists (select 1 from public.countries c where c.id = country_id and c.enabled));

comment on table public.cities is 'Settlements, not just major cities. Development seeds are intentionally incomplete. GeoNames imports planned for Milestone 2.';
comment on table private.profile_private is 'Optional self-declared birth year is private guidance, never verified age or a public profile field.';
comment on table private.account_roles is 'Trusted server-side assignments only. No client role modification; role-management workflow deferred.';
comment on column public.events.cover_storage_path is 'Future Supabase Storage object path. No bucket/upload workflow exists in Milestone 1; do not store data URLs or signed URLs here.';
comment on column public.events.participant_count is 'Maintained transactionally by membership triggers. Never accept a client-supplied value.';
commit;
