-- Test shim: create the minimal Supabase-like surface the migrations touch:
-- schema `auth`, `auth.users`, `auth.uid()`, and the three Supabase roles.
-- Used only by the RLS/migration test harness (CI uses a pgvector container).

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- auth.uid() reads the JWT claims injected by the API layer, exactly like
-- Supabase's hosted implementation.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ),
    ''
  )::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end $$;

-- the unprivileged API role inherits the permissions a Supabase `authenticated`
-- role would have on a normal project (mirrors hosted Supabase defaults)
grant usage on schema public to authenticated, anon, service_role;
grant usage on schema auth to authenticated, anon;
grant all on all tables in schema public to authenticated, service_role;
grant select on all tables in schema public to anon;
alter default privileges in schema public grant all on tables to authenticated, service_role;
alter default privileges in schema public grant select on tables to anon;
grant authenticated to postgres;
grant anon to postgres;

-- storage schema stub so migration 0007 can attach policies when present;
-- the tables mirror Supabase storage closely enough for policy testing
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now()
);
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(name, '/')
$$;
grant select on storage.objects, storage.buckets to authenticated;
grant insert on storage.objects to authenticated;
grant delete on storage.objects to authenticated;
alter table storage.objects enable row level security;
