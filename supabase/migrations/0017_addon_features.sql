-- ============================================================
-- 0017: Add-on features
--   * notes: folders + version history
--   * finance: per-category monthly budgets
--   * vision: multiple named boards
-- Habit grids need no schema change — habit_logs already store
-- every check-off by date, so weekly/monthly views and streaks
-- are derived from existing rows.
-- ============================================================

-- ---------------------------------------------------------------------------
-- Note folders (a label + count container; notes keep their space_id too)
-- ---------------------------------------------------------------------------
create table if not exists public.note_folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create index if not exists note_folders_user_idx on public.note_folders (user_id, created_at);

alter table public.notes add column if not exists folder_id uuid references public.note_folders(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Note versions: a snapshot taken before each edit so a bad save can be
-- undone. content is the TipTap doc exactly as it was written.
-- ---------------------------------------------------------------------------
create table if not exists public.note_versions (
  id           uuid primary key default gen_random_uuid(),
  note_id      uuid not null references public.notes(id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title        text not null,
  content      jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  content_text text not null default '',
  tags         text[] not null default '{}',
  color        text not null default '#FFF9B3',
  created_at   timestamptz not null default now()
);

create index if not exists note_versions_note_idx on public.note_versions (note_id, created_at desc);
create index if not exists note_versions_user_idx on public.note_versions (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Finance budgets: one limit per category per month. The primary key is
-- (user, category, month) so a second save updates rather than duplicates.
-- ---------------------------------------------------------------------------
create table if not exists public.budgets (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category     text not null check (char_length(category) between 1 and 40),
  month        date not null,           -- first day of the budget month
  limit_amount double precision not null check (limit_amount > 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, category, month)
);

create index if not exists budgets_user_idx on public.budgets (user_id, month);

drop trigger if exists budgets_set_updated_at on public.budgets;
create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Vision boards: named containers. Items reference their board; deleting a
-- board cascades to its items (and their storage objects, via the router).
-- ---------------------------------------------------------------------------
create table if not exists public.vision_boards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vision_boards_user_idx on public.vision_boards (user_id, created_at);

drop trigger if exists vision_boards_set_updated_at on public.vision_boards;
create trigger vision_boards_set_updated_at
  before update on public.vision_boards
  for each row execute function public.set_updated_at();

alter table public.vision_items add column if not exists board_id uuid references public.vision_boards(id) on delete cascade;

-- Give every user who already has items a "My board" and move their
-- items onto it, so nothing is left ownerless by the new column. The
-- loop only picks up users who still have unassigned items, so running
-- this twice cannot hand anyone a second board.
do $$
declare
  u uuid;
  b uuid;
begin
  for u in
    select distinct user_id from public.vision_items where board_id is null
  loop
    insert into public.vision_boards (user_id, name) values (u, 'My board') returning id into b;
    update public.vision_items set board_id = b where user_id = u and board_id is null;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS for the four new tables (test_every_table_has_rls requires it).
-- ---------------------------------------------------------------------------
do $$
declare
  tbl text;
  tables constant text[] := array['note_folders', 'note_versions', 'budgets', 'vision_boards'];
begin
  foreach tbl in array tables loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists "own rows" on public.%I', tbl);
    execute format(
      'create policy "own rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())',
      tbl
    );
  end loop;
end $$;
