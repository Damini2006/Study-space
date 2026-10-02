-- ============================================================
-- 0005: evaluations (golden dataset runs) + MCP tokens
-- ============================================================

create table public.eval_runs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label            text not null default 'run',
  dataset_version  text not null default 'v1',
  config           jsonb not null default '{}'::jsonb,
  status           text not null default 'pending'
                   check (status in ('pending','running','completed','failed')),
  summary          jsonb not null default '{}'::jsonb,
  error            text,
  started_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index eval_runs_user_idx on public.eval_runs (user_id, created_at desc);

create trigger eval_runs_set_updated_at
  before update on public.eval_runs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- eval_results: one row per (run, question). metrics jsonb carries
-- faithfulness, answer_relevancy, context_precision, context_recall,
-- citation_precision, hallucination flag, correct_not_found flag, ...
-- ---------------------------------------------------------------------------
create table public.eval_results (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  run_id      uuid not null references public.eval_runs(id) on delete cascade,
  question_id text not null,
  question    text not null,
  kind        text not null default 'answerable' check (kind in ('answerable','unanswerable')),
  answer      text,
  reference   text,
  contexts    jsonb not null default '[]'::jsonb,
  citations   jsonb not null default '[]'::jsonb,
  status      text check (status is null or status in ('verified','low_confidence','not_found')),
  metrics     jsonb not null default '{}'::jsonb,
  trace_id    text,
  created_at  timestamptz not null default now()
);

create index eval_results_run_idx on public.eval_results (run_id, question_id);
create index eval_results_user_idx on public.eval_results (user_id);

-- ---------------------------------------------------------------------------
-- mcp_tokens: revocable personal access tokens for the MCP server.
-- Only the sha256 hash is stored. scopes e.g. {read} or {read,write}.
-- ---------------------------------------------------------------------------
create table public.mcp_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  token_hash   text not null unique,
  token_prefix text not null,
  scopes       text[] not null default '{read}',
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index mcp_tokens_user_idx on public.mcp_tokens (user_id, created_at desc);
