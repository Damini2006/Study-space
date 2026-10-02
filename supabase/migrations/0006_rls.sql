-- ============================================================
-- 0006: Row Level Security — every user-owned table
-- Pattern: a policy per table restricting rows to auth.uid().
-- Verified by backend/tests/test_rls.py (asserts every table in
-- schema `public` has RLS enabled + a policy exists).
-- ============================================================

do $$
declare
  tbl text;
  tables constant text[] := array[
    'profiles', 'spaces', 'sources', 'chunks',
    'chat_threads', 'messages', 'citations', 'claims',
    'studio_outputs', 'cards', 'card_state', 'review_logs',
    'notes', 'plans', 'plan_tasks', 'planner_runs',
    'planner_checkpoints', 'planner_checkpoint_writes',
    'focus_sessions', 'habits', 'habit_logs',
    'eval_runs', 'eval_results', 'mcp_tokens'
  ];
begin
  foreach tbl in array tables loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists "own rows" on public.%I', tbl);
    execute format(
      'create policy "own rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())',
      tbl
    );
  end loop;
end $$;

-- The API layer connects as an unprivileged role and injects the verified
-- JWT claims, so these policies are the ONLY authorization boundary.
-- The service-role connection (ingestion worker / admin scripts only)
-- runs as the table owner and is intentionally outside the request path.
