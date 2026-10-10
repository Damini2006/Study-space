-- ---------------------------------------------------------------------------
-- Record this repo's migrations in supabase_migrations.schema_migrations.
--
-- Run against a database that already has the schema but none of its
-- bookkeeping — the local dev database qualified: all 16 migrations'
-- objects existed while the bookkeeping listed only another
-- application's ten rows (this dev instance shares its `public` schema
-- with a second project). To the Supabase CLI that state reads as
-- "nothing applied": every file looks pending, `db push` starts at
-- 0001, and it dies on the first `create table`.
--
-- Idempotent by primary key: version is the key, so re-running any row
-- is a no-op. The other application's rows stay — they are true history
-- of this database, and deleting them would only blind its own tooling.
-- Statements stay null on purpose: these rows name what is applied; the
-- files are the statements.
--
-- Verify afterwards with:
--   supabase migration list --db-url "postgresql://…/postgres?sslmode=disable"
-- which should pair all 16 local files with their rows (plus the other
-- project's 10 remote-only versions, which is honest and expected).
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name, statements)
values
  ('0001', 'init', null),
  ('0002', 'spaces_sources_chunks', null),
  ('0003', 'chat_studio', null),
  ('0004', 'study_notes_planner_focus', null),
  ('0005', 'evals_mcp', null),
  ('0006', 'rls', null),
  ('0007', 'storage', null),
  ('0008', 'space_sharing', null),
  ('0009', 'ai_intelligence', null),
  ('0010', 'citation_audit', null),
  ('0011', 'eval_results_config', null),
  ('0012', 'notes_content_text', null),
  ('0013', 'public_space_views', null),
  ('0014', 'mcp_pat_auth', null),
  ('0015', 'mcp_token_last_used', null),
  ('0016', 'vision_finance', null)
on conflict (version) do nothing;
