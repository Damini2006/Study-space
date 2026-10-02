-- ============================================================
-- Seed data: brings the demo workspace up to date.
-- NOTE: Demo users are created at runtime via Supabase Auth by the
-- frontend "Try the demo workspace" flow (POST /api/demo/session).
-- This file seeds OPTIONAL global fixtures only, so it stays safe
-- to run on hosted Supabase.
-- ============================================================

-- Daily quote bank used by the dashboard (prototype port).
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  author text not null default 'StudySpace'
);

insert into public.quotes (text, author) values
  ('Be consistent, not perfect.', 'StudySpace'),
  ('Small habits compound into big wins.', 'StudySpace'),
  ('Study in short focused bursts.', 'StudySpace'),
  ('Teach to learn: explain it aloud.', 'StudySpace'),
  ('Focus on progress, not perfection.', 'StudySpace'),
  ('The best time to start was yesterday. The next best time is now.', 'StudySpace'),
  ('Deep work is the ability to focus without distraction on a cognitively demanding task.', 'Cal Newport'),
  ('You do not rise to the level of your goals, you fall to the level of your systems.', 'James Clear')
on conflict (id) do nothing;

-- quotes is global (read-only) but still RLS-protected: any signed-in
-- user may read, nobody may write from the client.
alter table public.quotes enable row level security;
drop policy if exists "quotes readable" on public.quotes;
create policy "quotes readable" on public.quotes for select to authenticated using (true);
