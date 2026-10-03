-- ============================================================
-- 0001: extensions, helpers, profiles
-- StudySpace — Supabase Postgres (pgvector)
-- Embedding dimension is a project-wide constant: 1536
-- (text-embedding-3-small). If you change the embedding model,
-- change it here AND in backend/app/config.py (EMBEDDING_DIM).
-- ============================================================

create extension if not exists vector;
create extension if not exists pg_trgm;

-- updated_at maintenance ------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (one row per auth user; theme stored per user)
-- NOTE: this schema may be shared with other apps that already own a
-- `profiles` table keyed by `id`, so every statement here is additive and
-- idempotent rather than assuming a clean slate.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Student',
  theme        text not null default 'light'
               check (theme in ('light','dark','cozy','pastel')),
  settings     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Converge a pre-existing profiles table onto the shape this app expects.
alter table public.profiles add column if not exists display_name text not null default 'Student';
alter table public.profiles add column if not exists theme text not null default 'light';
alter table public.profiles add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_theme_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_theme_check
      check (theme in ('light','dark','cozy','pastel'));
  end if;
end $$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- auto-create a profile when a Supabase auth user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(split_part(new.email, '@', 1), 'Student'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
