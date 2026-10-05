-- AI Intelligence tables: prompt_templates, rag_settings
-- 0009_ai_intelligence.sql

-- prompt_templates: user-defined and system prompt templates
create table public.prompt_templates (
    id              uuid primary key default gen_random_uuid(),
    name            text not null check (char_length(name) between 1 and 100),
    description     text check (description is null or char_length(description) <= 500),
    type            text not null check (type in (
        'chat_system','chat_user','studio_summary','studio_guide',
        'studio_flashcards','studio_quiz','judge_claims','socratic',
        'relevance_gate','citation_validation','claim_verification','custom'
    )),
    template        text not null,
    variables       jsonb not null default '[]'::jsonb,
    version         int not null default 1,
    is_system       boolean not null default false,
    space_id        uuid references public.spaces(id) on delete cascade,
    created_by      uuid not null references auth.users(id) on delete cascade,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index prompt_templates_space_idx on public.prompt_templates (space_id);
create index prompt_templates_type_idx on public.prompt_templates (type);

-- RLS
alter table public.prompt_templates enable row level security;

create policy "owner manages templates" on public.prompt_templates
    for all using (
        space_id is null
        or space_id in (select id from public.spaces where user_id = auth.uid())
    );

create policy "shared access reads templates" on public.prompt_templates
    for select using (
        is_system = true
        or space_id is null
        or space_id in (select id from public.spaces where user_id = auth.uid())
        or space_id in (
            select space_id from public.space_shares
            where token = current_setting('request.jwt.claims', true)::jsonb->>'share_token'
              and revoked_at is null
              and (expires_at is null or expires_at > now())
        )
    );

create trigger prompt_templates_set_updated_at
    before update on public.prompt_templates
    for each row execute function public.set_updated_at();


-- rag_settings: per-space RAG configuration overrides
create table public.rag_settings (
    space_id                uuid primary key references public.spaces(id) on delete cascade,
    -- Retrieval
    top_k                   int not null default 12 check (top_k between 1 and 50),
    vector_weight           numeric(3,2) not null default 0.70 check (vector_weight between 0 and 1),
    fts_weight              numeric(3,2) not null default 0.30 check (fts_weight between 0 and 1),
    rrf_k                   int not null default 60,
    -- Reranking
    rerank_enabled          boolean not null default true,
    rerank_model            text not null default 'cross-encoder/ms-marco-MiniLM-L-6-v2',
    rerank_top_n            int not null default 8 check (rerank_top_n between 1 and 20),
    -- Layers
    relevance_gate          boolean not null default true,
    relevance_threshold     numeric(3,2) not null default 0.35 check (relevance_threshold between 0 and 1),
    citation_validation     boolean not null default true,
    claim_verification      boolean not null default true,
    -- Generation
    temperature             numeric(3,2) not null default 0.30 check (temperature between 0 and 2),
    max_tokens              int not null default 2048 check (max_tokens between 256 and 8192),
    socratic_mode           boolean not null default false,
    -- Model overrides (null = use global default)
    chat_model              text,
    judge_model             text,
    generate_model          text,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

create trigger rag_settings_set_updated_at
    before update on public.rag_settings
    for each row execute function public.set_updated_at();