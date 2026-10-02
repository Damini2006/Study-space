-- ============================================================
-- 0004: FSRS study system, notes, planner, focus, habits
-- ============================================================

-- ---------------------------------------------------------------------------
-- cards + card_state: FSRS scheduling state (one state row per card)
--   state: 0 = Learning, 1 = Review, 2 = Relearning (FSRS enum)
--   stability / difficulty / due / reps / lapses / step managed by the
--   backend FSRS scheduler; review_logs keeps full history.
-- ---------------------------------------------------------------------------
create table public.cards (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space_id         uuid not null references public.spaces(id) on delete cascade,
  source_chunk_id  uuid references public.chunks(id) on delete set null,
  studio_output_id uuid references public.studio_outputs(id) on delete set null,
  front            text not null check (char_length(front) between 1 and 4000),
  back             text not null check (char_length(back) between 1 and 8000),
  tags             text[] not null default '{}',
  origin           text not null default 'manual' check (origin in ('manual','ai')),
  created_at       timestamptz not null default now()
);

create index cards_space_idx on public.cards (space_id);
create index cards_user_idx  on public.cards (user_id);

create table public.card_state (
  card_id     uuid primary key references public.cards(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  due         timestamptz not null default now(),
  stability   double precision not null default 0,
  difficulty  double precision not null default 0,
  state       smallint not null default 0 check (state between 0 and 2),
  step        smallint not null default 0,
  reps        integer not null default 0,
  lapses      integer not null default 0,
  suspended   boolean not null default false,
  last_review timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index card_state_due_idx on public.card_state (user_id, due);
create index card_state_space_idx on public.card_state (user_id, card_id);

create trigger card_state_set_updated_at
  before update on public.card_state
  for each row execute function public.set_updated_at();

create table public.review_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id      uuid not null references public.cards(id) on delete cascade,
  rating       smallint not null check (rating between 1 and 4), -- Again/Hard/Good/Easy
  reviewed_at  timestamptz not null default now(),
  state_before jsonb not null default '{}'::jsonb,
  state_after  jsonb not null default '{}'::jsonb,
  due_before   timestamptz,
  due_after    timestamptz,
  duration_ms  integer
);

create index review_logs_card_idx on public.review_logs (card_id, reviewed_at desc);
create index review_logs_user_idx on public.review_logs (user_id, reviewed_at desc);

-- ---------------------------------------------------------------------------
-- notes (TipTap JSON content + plain text for search)
-- ---------------------------------------------------------------------------
create table public.notes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space_id     uuid references public.spaces(id) on delete set null,
  title        text not null default 'Untitled' check (char_length(title) <= 200),
  content      jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  content_text text not null default '',
  tags         text[] not null default '{}',
  pinned       boolean not null default false,
  color        text not null default '#FFF9B3',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index notes_user_idx    on public.notes (user_id, pinned desc, updated_at desc);
create index notes_content_trgm on public.notes using gin (content_text gin_trgm_ops);

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- planner: runs (LangGraph, human-in-the-loop) + committed tasks
--   planner_runs.status:
--     running -> awaiting_approval -> approved | rejected | failed
--   proposal jsonb holds the ghost tasks. plan_tasks rows are ONLY written
--   after explicit approval (nothing is committed before that).
-- ---------------------------------------------------------------------------
create table public.plans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 200),
  status     text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index plans_user_idx on public.plans (user_id, created_at desc);

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

-- planner_runs defined before plan_tasks (plan_tasks references it)
create table public.planner_runs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status     text not null default 'running'
             check (status in ('running','awaiting_approval','approved','rejected','failed')),
  input      jsonb not null default '{}'::jsonb,
  proposal   jsonb,
  plan_id    uuid references public.plans(id) on delete set null,
  error      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index planner_runs_user_idx on public.planner_runs (user_id, created_at desc);

create trigger planner_runs_set_updated_at
  before update on public.planner_runs
  for each row execute function public.set_updated_at();

create table public.plan_tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_id      uuid not null references public.plans(id) on delete cascade,
  planner_run_id uuid references public.planner_runs(id) on delete set null,
  title        text not null check (char_length(title) between 1 and 300),
  topic        text,
  due          date,
  duration_min integer not null default 45 check (duration_min between 5 and 600),
  space_id     uuid references public.spaces(id) on delete set null,
  status       text not null default 'pending'
               check (status in ('pending','done','skipped')),
  source       text not null default 'manual' check (source in ('manual','ai')),
  order_idx    integer not null default 0,
  approved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index plan_tasks_plan_idx on public.plan_tasks (plan_id, due, order_idx);
create index plan_tasks_user_idx on public.plan_tasks (user_id, due);

create trigger plan_tasks_set_updated_at
  before update on public.plan_tasks
  for each row execute function public.set_updated_at();

-- LangGraph checkpoints (human-in-the-loop interrupt/resume)
create table public.planner_checkpoints (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  thread_id           text not null,
  checkpoint_ns       text not null default '',
  checkpoint_id       text not null,
  parent_checkpoint_id text,
  checkpoint          jsonb not null,
  metadata            jsonb not null default '{}'::jsonb,
  versions            jsonb not null default '{}'::jsonb,
  channel_values       jsonb,
  created_at          timestamptz not null default now(),
  unique (user_id, thread_id, checkpoint_ns, checkpoint_id)
);

create index planner_checkpoints_thread_idx
  on public.planner_checkpoints (user_id, thread_id, checkpoint_id desc);

-- pending writes replayed on interrupt resume
create table public.planner_checkpoint_writes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  thread_id      text not null,
  checkpoint_ns  text not null default '',
  checkpoint_id  text not null,
  task_id        text not null,
  channel        text not null,
  value          jsonb not null,
  created_at     timestamptz not null default now(),
  unique (user_id, thread_id, checkpoint_ns, checkpoint_id, task_id, channel)
);

create index planner_checkpoint_writes_thread_idx
  on public.planner_checkpoint_writes (user_id, thread_id, checkpoint_id);

-- ---------------------------------------------------------------------------
-- focus sessions (Pomodoro) + habits
-- ---------------------------------------------------------------------------
create table public.focus_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space_id     uuid references public.spaces(id) on delete set null,
  kind         text not null default 'focus' check (kind in ('focus','break')),
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  duration_min integer not null default 0,
  completed    boolean not null default false,
  created_at   timestamptz not null default now()
);

create index focus_sessions_user_idx on public.focus_sessions (user_id, started_at desc);

create table public.habits (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 80),
  color         text not null default '#4F5BD5',
  icon          text not null default 'check',
  target_days   smallint not null default 7 check (target_days between 1 and 7),
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index habits_user_idx on public.habits (user_id, created_at);

create trigger habits_set_updated_at
  before update on public.habits
  for each row execute function public.set_updated_at();

create table public.habit_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id   uuid not null references public.habits(id) on delete cascade,
  log_date   date not null default current_date,
  value      smallint not null default 1,
  created_at timestamptz not null default now(),
  unique (habit_id, log_date)
);

create index habit_logs_user_idx on public.habit_logs (user_id, log_date);
