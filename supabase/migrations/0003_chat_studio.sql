-- ============================================================
-- 0003: chat threads, messages, citations, claims, studio outputs
-- ============================================================

create table public.chat_threads (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space_id   uuid not null references public.spaces(id) on delete cascade,
  title      text not null default 'New chat' check (char_length(title) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chat_threads_space_idx on public.chat_threads (space_id, updated_at desc);
create index chat_threads_user_idx  on public.chat_threads (user_id);

create trigger chat_threads_set_updated_at
  before update on public.chat_threads
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- messages: role user|assistant. status is the hallucination-layer verdict:
--   verified        -> every claim supported by cited chunks
--   low_confidence  -> some claims unsupported / weak retrieval
--   not_found       -> relevance gate failed or no usable evidence
-- ---------------------------------------------------------------------------
create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  thread_id  uuid not null references public.chat_threads(id) on delete cascade,
  space_id   uuid not null references public.spaces(id) on delete cascade,
  role       text not null check (role in ('user','assistant','system')),
  content    text not null default '',
  status     text check (status is null or status in ('pending','verified','low_confidence','not_found')),
  trace_id   text,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index messages_thread_idx on public.messages (thread_id, created_at);
create index messages_user_idx   on public.messages (user_id);

-- ---------------------------------------------------------------------------
-- citations: inline [n] chips in an assistant message -> exact chunk passage
-- ---------------------------------------------------------------------------
create table public.citations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  chunk_id   uuid not null references public.chunks(id) on delete cascade,
  label      integer not null,
  quote_span text,
  verified   boolean not null default false,
  score      double precision,
  created_at timestamptz not null default now()
);

create index citations_message_idx on public.citations (message_id, label);
create index citations_chunk_idx   on public.citations (chunk_id);
create index citations_user_idx    on public.citations (user_id);

-- ---------------------------------------------------------------------------
-- claims: atomic factual sentences of an answer, judged against cited chunks
-- ---------------------------------------------------------------------------
create table public.claims (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  message_id  uuid not null references public.messages(id) on delete cascade,
  text        text not null check (char_length(text) <= 2000),
  supported   boolean not null default false,
  chunk_id    uuid references public.chunks(id) on delete set null,
  judge_score double precision,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index claims_message_idx on public.claims (message_id, position);
create index claims_user_idx    on public.claims (user_id);

-- ---------------------------------------------------------------------------
-- studio_outputs: saved, editable generated material (source-cited)
--   type: summary | guide | flashcards | quiz
-- ---------------------------------------------------------------------------
create table public.studio_outputs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space_id   uuid not null references public.spaces(id) on delete cascade,
  type       text not null check (type in ('summary','guide','flashcards','quiz')),
  title      text not null check (char_length(title) between 1 and 200),
  content    jsonb not null,
  source_ids uuid[] not null default '{}',
  trace_id   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index studio_outputs_space_idx on public.studio_outputs (space_id, updated_at desc);
create index studio_outputs_user_idx  on public.studio_outputs (user_id);

create trigger studio_outputs_set_updated_at
  before update on public.studio_outputs
  for each row execute function public.set_updated_at();
