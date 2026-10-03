-- ============================================================
-- 0008: Life modules — vision board + finance
-- Restores the two "old version" features from the prototype:
--   * vision board (drag stickies / images, autosaved)
--   * finance transactions (working category chart)
-- Images live in the private `vision` storage bucket (0007);
-- the table stores the object path, access uses signed URLs.
-- ============================================================

create table if not exists public.vision_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null default 'sticky' check (kind in ('sticky','image')),
  text        text not null default '' check (char_length(text) <= 2000),
  color       text not null default '#FFF9B3',
  x           double precision not null default 0 check (x between -20000 and 20000),
  y           double precision not null default 0 check (y between -20000 and 20000),
  width       double precision not null default 200 check (width between 60 and 4000),
  height      double precision not null default 160 check (height between 60 and 4000),
  rotation    double precision not null default 0 check (rotation between -360 and 360),
  z_index     integer not null default 0,
  image_path  text,          -- storage object path inside the `vision` bucket
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists vision_items_user_idx
  on public.vision_items (user_id, z_index, created_at);

drop trigger if exists vision_items_set_updated_at on public.vision_items;
create trigger vision_items_set_updated_at
  before update on public.vision_items
  for each row execute function public.set_updated_at();

create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  amount      double precision not null check (amount >= 0 and amount <= 100000000),
  kind        text not null default 'expense' check (kind in ('expense','income')),
  category    text not null default 'Other'
              check (char_length(category) between 1 and 40),
  spent_on    date not null default current_date,
  note        text not null default '' check (char_length(note) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists transactions_user_idx
  on public.transactions (user_id, spent_on desc);

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- RLS: same "own rows" pattern as 0006 (self-contained so the test
-- suite's `test_every_table_has_rls` passes on a fresh database too).
do $$
declare
  tbl text;
  tables constant text[] := array['vision_items', 'transactions'];
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
