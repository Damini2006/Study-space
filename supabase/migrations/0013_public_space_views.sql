-- 0013: the read path for published pages and invite links.
--
-- The API's request path always runs as the unprivileged role with row
-- level security on, so an anonymous caller sees no rows in `spaces` at
-- all — which is why these two endpoints answered 401/404 for exactly the
-- visitors they exist for. `_space_view` is the only bridge: SECURITY
-- DEFINER, EXECUTE revoked from PUBLIC, reachable only through the two
-- credential functions below. Each credential function validates the
-- credential *in the same statement* that reaches the data (a slug that is
-- still published, a token through `validate_space_share` — not revoked,
-- not expired), so a stale credential returns no row and there is no read
-- to leak before the check.

create or replace function public._space_view(p_space_id uuid)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'space', jsonb_build_object(
      'title', sp.title,
      'description', sp.description,
      'subject', sp.subject,
      'color', sp.color,
      'created_at', sp.created_at,
      'source_count', (select count(*) from public.sources s where s.space_id = sp.id),
      'card_count', (select count(*) from public.cards c where c.space_id = sp.id),
      'note_count', (select count(*) from public.notes n where n.space_id = sp.id)
    ),
    -- Each list is capped at 500 rows; the matching count above stays the
    -- real total so the page can say "first 500 of N" instead of quietly
    -- pretending the deck is short.
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', s.title, 'type', s.type, 'status', s.status,
        'char_count', s.char_count, 'created_at', s.created_at)
        order by s.created_at)
      from (select title, type, status, char_count, created_at
            from public.sources where space_id = p_space_id
            order by created_at limit 500) s), '[]'::jsonb),
    'cards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'front', c.front, 'back', c.back, 'tags', c.tags)
        order by c.created_at)
      from (select front, back, tags, created_at
            from public.cards where space_id = p_space_id
            order by created_at limit 500) c), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', n.title, 'content_text', n.content_text, 'pinned', n.pinned)
        order by n.pinned desc, n.updated_at desc)
      from (select title, content_text, pinned, updated_at
            from public.notes where space_id = p_space_id
            order by pinned desc, updated_at desc limit 500) n), '[]'::jsonb)
  )
  from public.spaces sp
  where sp.id = p_space_id
$$;

-- The builder takes a raw space id, so no caller outside this migration
-- may reach it directly; the two functions below are the entire surface.
revoke execute on function public._space_view(uuid) from public;

create or replace function public.published_space_view(p_slug text)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public._space_view(p.space_id)
  from public.space_public p
  where p.slug = p_slug and p.unpublished_at is null
$$;

create or replace function public.shared_space_view(p_token text)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public._space_view(v.space_id)
  from public.validate_space_share(p_token) v
$$;
