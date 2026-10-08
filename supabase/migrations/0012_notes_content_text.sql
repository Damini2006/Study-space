-- Notes: content_text is the plain text of the jsonb document.
--
-- The column exists so body search (trgm index) and exports can read a
-- note's text without parsing TipTap JSON, but nothing ever derived it
-- from the document: the client never sent content_text, so every
-- app-created note had content_text = '' -- body-only phrases never
-- matched and exported note files were empty. Writes now derive the
-- plain text from `content` (routers/notes.py), and this backfills what
-- is already stored. Both paths share the function below, so they cannot
-- disagree.

create or replace function public.jsonb_tiptap_text(node jsonb)
returns text
language sql
immutable
parallel safe
as $$
  select case jsonb_typeof(node)
    when 'string' then node #>> '{}'
    when 'array' then (
      select coalesce(string_agg(public.jsonb_tiptap_text(elem), ' '), '')
      from jsonb_array_elements(node) as elem
    )
    when 'object' then
      case when node ? 'text'
        then coalesce(node ->> 'text', '')
        else (
          select coalesce(string_agg(public.jsonb_tiptap_text(val), ' '), '')
          from jsonb_each(node) as e (key, val)
          -- `type` is the node name and `attrs` carries markup metadata
          -- (hrefs, ids): neither is text the student wrote.
          where e.key not in ('type', 'attrs')
        )
      end
    else ''
  end;
$$;

update public.notes
set content_text = public.jsonb_tiptap_text(content)
where content_text = ''
  and content is not null
  and public.jsonb_tiptap_text(content) <> '';
