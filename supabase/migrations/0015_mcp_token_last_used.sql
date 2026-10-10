-- ---------------------------------------------------------------------------
-- 0015: tokens say when they were last used.
--
-- The API has exposed `last_used_at` since 0005, but nothing ever wrote
-- it — the field could only ever be null, and Settings had nothing true
-- to show. Verification is the one moment a token proves itself live, so
-- recording happens there, as SECURITY DEFINER like 0014's lookup: the
-- verifying connection carries anonymous claims while mcp_tokens rows
-- belong to their owner under RLS, so an ordinary update would match
-- zero rows and silently record nothing.
--
-- Throttled to at most one write per token per five minutes:
-- verify_pat runs on every MCP message and every PAT-authenticated API
-- request, and a write-per-request would trade a display nicety for row
-- locks on the hot path. For a field labelled with a date, "last used"
-- at most five minutes stale is honest.
-- ---------------------------------------------------------------------------
create or replace function public.touch_mcp_token(p_token_hash text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.mcp_tokens
     set last_used_at = now()
   where token_hash = p_token_hash
     and revoked_at is null
     and (last_used_at is null or last_used_at < now() - interval '5 minutes')
$$;

-- Same audience as 0014's lookup: the authenticated role every request
-- connection assumes after `set local role`; never PUBLIC, never anon.
revoke execute on function public.touch_mcp_token(text) from public;
grant execute on function public.touch_mcp_token(text) to authenticated;
