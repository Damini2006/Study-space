-- ============================================================
-- 0002: spaces, sources, chunks (ingestion + retrieval core)
-- ============================================================

create table public.spaces (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  subject     text check (subject is null or char_length(subject) <= 80),
  color       text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index spaces_user_idx on public.spaces (user_id, created_at desc);

create trigger spaces_set_updated_at
  before update on public.spaces
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- sources: a PDF / DOCX / TXT / MD / URL uploaded into a space
-- ---------------------------------------------------------------------------
create table public.sources (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  space_id    uuid not null references public.spaces(id) on delete cascade,
  type        text not null check (type in ('pdf','docx','text','markdown','url','youtube')),
  title       text not null check (char_length(title) between 1 and 200),
  storage_path text,
  status      text not null default 'queued'
              check (status in ('queued','processing','ready','failed')),
  error       text,
  size_bytes  bigint not null default 0 check (size_bytes >= 0),
  char_count  integer not null default 0,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index sources_space_idx  on public.sources (space_id, created_at desc);
create index sources_user_idx   on public.sources (user_id);
create index sources_status_idx on public.sources (user_id, status);

create trigger sources_set_updated_at
  before update on public.sources
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- chunks: retrieved passages. `tsv` powers Postgres full-text search;
-- `embedding` powers pgvector similarity search (vector_cosine_ops).
-- ---------------------------------------------------------------------------
create table public.chunks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_id  uuid not null references public.sources(id) on delete cascade,
  space_id   uuid not null references public.spaces(id) on delete cascade,
  content    text not null check (char_length(content) between 1 and 8000),
  position   integer not null,
  page       integer,
  token_count integer,
  embedding  vector(1536),
  tsv        tsvector generated always as (to_tsvector('english', content)) stored,
  created_at timestamptz not null default now()
);

create index chunks_embedding_idx on public.chunks
  using hnsw (embedding vector_cosine_ops);
create index chunks_tsv_idx on public.chunks using gin (tsv);
create index chunks_space_idx on public.chunks (space_id, source_id, position);
create index chunks_source_idx on public.chunks (source_id);
create index chunks_user_idx on public.chunks (user_id);
-- trigram index used for exact-span lookup during citation validation
create index chunks_content_trgm_idx on public.chunks using gin (content gin_trgm_ops);
