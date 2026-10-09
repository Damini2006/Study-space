-- ---------------------------------------------------------------------------
-- 0014: MCP personal access tokens become first-class API credentials.
--
-- The backend only understood Supabase session JWTs, so the MCP server had
-- no way to act as the user even after verifying an `ssk_` token — every
-- route answered 401 and no tool could ever return data. This function
-- answers the one question knowable before any identity exists: "does
-- this exact hash belong to a live token, and who holds it".
--
-- SECURITY DEFINER, like migration 0013's link resolvers: the one
-- legitimate cross-user read in the request path. Holding a token's
-- sha256 preimage is holding the token, so the lookup discloses nothing
-- the caller did not already have — only (user_id, scopes) for a hash it
-- presented. Deps reaches it over user_conn under anonymous claims, so
-- every *other* query keeps flowing through Postgres with RLS on.
-- ---------------------------------------------------------------------------
create or replace function public.verify_mcp_token(p_token_hash text)
returns table (user_id uuid, scopes text[])
language sql
security definer
stable
set search_path = public
as $$
  select t.user_id, t.scopes
  from public.mcp_tokens t
  where t.token_hash = p_token_hash
    and t.revoked_at is null
$$;

-- Executable only by the role every request connection assumes after
-- `set local role` (settings.db_user_role): never PUBLIC, never anon.
revoke execute on function public.verify_mcp_token(text) from public;
grant execute on function public.verify_mcp_token(text) to authenticated;
