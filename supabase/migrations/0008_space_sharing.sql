-- Space sharing & public publishing
-- 0008_space_sharing.sql

-- space_shares: invite links with role (viewer/editor)
create table public.space_shares (
    id              uuid primary key default gen_random_uuid(),
    space_id        uuid not null references public.spaces(id) on delete cascade,
    created_by      uuid not null references auth.users(id) on delete cascade,
    role            text not null check (role in ('viewer','editor')) default 'viewer',
    token           text not null unique,                -- opaque invite token
    expires_at      timestamptz,                         -- null = never expires
    created_at      timestamptz not null default now(),
    revoked_at      timestamptz
);

create index space_shares_space_idx on public.space_shares (space_id);
create index space_shares_token_idx on public.space_shares (token);

-- space_public: published read-only public pages
create table public.space_public (
    space_id        uuid primary key references public.spaces(id) on delete cascade,
    slug            text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
    published_by    uuid not null references auth.users(id) on delete cascade,
    published_at    timestamptz not null default now(),
    unpublished_at  timestamptz,
    meta            jsonb not null default '{}'::jsonb   -- SEO, theme override, etc.
);

create index space_public_slug_idx on public.space_public (slug);

-- RLS policies
alter table public.space_shares enable row level security;
alter table public.space_public enable row level security;

-- space_shares: owner can manage all; invited users can read their own share
create policy "owner manages shares" on public.space_shares
    for all using (
        space_id in (select id from public.spaces where user_id = auth.uid())
    );

create policy "invitee reads own share" on public.space_shares
    for select using (
        token = current_setting('request.jwt.claims', true)::jsonb->>'share_token'
        or auth.uid() = created_by
    );

-- space_public: owner manages; public can read published
create policy "owner manages public" on public.space_public
    for all using (
        space_id in (select id from public.spaces where user_id = auth.uid())
    );

create policy "public reads published" on public.space_public
    for select using (unpublished_at is null);

-- Function to validate a share token and return space_id + role
create or replace function public.validate_space_share(p_token text)
returns table (space_id uuid, role text, share_id uuid)
language sql security definer as $$
    select s.space_id, s.role, s.id
    from public.space_shares s
    where s.token = p_token
      and s.revoked_at is null
      and (s.expires_at is null or s.expires_at > now());
$$;

-- Function to check if user has access to space (owner or valid share)
create or replace function public.user_has_space_access(p_space_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql security definer as $$
    select exists (
        select 1 from public.spaces where id = p_space_id and user_id = p_user_id
        union
        select 1 from public.space_shares
        where space_id = p_space_id
          and token = current_setting('request.jwt.claims', true)::jsonb->>'share_token'
          and revoked_at is null
          and (expires_at is null or expires_at > now())
    );
$$;