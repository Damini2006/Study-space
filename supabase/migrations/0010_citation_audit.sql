-- 0010_citation_audit.sql
--
-- Makes the citation audit meaningful, and closes an RLS gap on rag_settings.
--
-- Problem 1 — a citation audit that cannot detect deleted evidence.
--   public.citations.chunk_id was `not null ... on delete cascade`, so deleting
--   a chunk silently deleted the citation that pointed at it. The audit could
--   then never report `missing_chunk` or `broken`: the rows it was meant to find
--   were already gone. `claims.chunk_id` already used `on delete set null`;
--   citations should too. An answer you can no longer verify is exactly the
--   thing a study tool must surface, not erase.
--
-- Problem 2 — the audit had to walk messages -> chunks -> sources to find a
--   space, which breaks the moment the chunk is gone. Denormalise `space_id`
--   onto the citation, and snapshot the source title at answer time so a
--   deleted source is still nameable in the report.

alter table public.citations
    alter column chunk_id drop not null;

alter table public.citations
    drop constraint if exists citations_chunk_id_fkey;

alter table public.citations
    add constraint citations_chunk_id_fkey
    foreign key (chunk_id) references public.chunks(id) on delete set null;

alter table public.citations
    add column if not exists space_id     uuid references public.spaces(id)  on delete cascade,
    add column if not exists source_id    uuid references public.sources(id) on delete set null,
    add column if not exists source_title text,
    add column if not exists page         integer;

comment on column public.citations.chunk_id is
    'Null once the cited chunk is deleted — the audit reports this as missing_chunk.';
comment on column public.citations.source_title is
    'Snapshot taken when the answer was written, so a deleted source stays nameable.';

-- Backfill the denormalised columns for citations written before this migration.
--
-- Written as a subquery, not UPDATE ... FROM ... LEFT JOIN: PostgreSQL does
-- not let the UPDATE target's alias be referenced from a join's ON clause
-- ("invalid reference to FROM-clause entry for table \"c\""). The original
-- form failed there — and because a migration runs in one transaction it
-- took the whole file down with it: the FK change above, these columns,
-- the indexes below and the rag_settings RLS never applied on any database
-- that ran this file. The subquery puts the alias where it is in scope; the
-- distinct-from guard keeps the update idempotent on partial states.
update public.citations c
set space_id     = x.space_id,
    source_id    = x.source_id,
    source_title = x.source_title,
    page         = x.page
from (
    select cit.id            as citation_id,
           m.space_id,
           ch.source_id,
           s.title           as source_title,
           ch.page
      from public.citations cit
      join public.messages  m  on m.id  = cit.message_id
      left join public.chunks  ch on ch.id = cit.chunk_id
      left join public.sources s  on s.id = ch.source_id
) x
where c.id = x.citation_id
  and (c.space_id is distinct from x.space_id
       or c.source_title is distinct from x.source_title);

-- Citations are always written with the answer, so make it not-null going
-- forwards via the writer rather than a constraint, to keep this migration
-- re-runnable on databases with partial data.
create index if not exists citations_space_idx
    on public.citations (space_id, created_at desc);

-- Partial index for the audit's hot path: only rows that can go stale.
create index if not exists citations_unverified_idx
    on public.citations (space_id) where not verified;


-- ---------------------------------------------------------------------------
-- rag_settings had RLS switched off, so every other table in this schema
-- protected rows by policy while this one relied solely on the router's
-- ownership check. Defence in depth: any future query path that forgets the
-- check is contained by the policy.
-- ---------------------------------------------------------------------------
alter table public.rag_settings enable row level security;

drop policy if exists "owner manages rag settings" on public.rag_settings;
create policy "owner manages rag settings" on public.rag_settings
    for all using (
        exists (select 1 from public.spaces s where s.id = space_id and s.user_id = auth.uid())
    );
