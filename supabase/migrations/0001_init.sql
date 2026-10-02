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
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Student',
  theme        text not null default 'light'
               check (theme in ('light','dark','cozy','pastel')),
  settings     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

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
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(split_part(new.email, '@', 1), 'Student'))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
