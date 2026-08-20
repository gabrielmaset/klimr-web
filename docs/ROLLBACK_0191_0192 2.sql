-- ROLLBACK_0191_0192.sql — put the two boundary migrations back exactly as they were.
--
-- WHY THIS FILE EXISTS INSTEAD OF A BACKUP. 0191 and 0192 change privileges,
-- policies, views and functions. They do not write, rewrite or delete a single
-- row. Nothing in them can lose data, so a database backup is not the recovery
-- path — this is. If a page starts returning "permission denied" after the
-- paste and the fix isn't obvious, run this, and the database is back to its
-- previous behaviour in one step.
--
-- Run the whole file. Every statement is idempotent.
--
-- AFTER RUNNING THIS, the P0 findings KCDX-001, 002, 007 and 008 are open again:
-- members can read each other's DOB, phone and home ZIP; queue presence is
-- anonymously readable and streamed; the operator credential ships in every
-- queue payload. That is the trade — availability now, privacy later — and it
-- should be a deliberate decision with a note in the ledger, not a quiet undo.

-- ── 0191: profiles ─────────────────────────────────────────────────────────
-- The migration revoked only SELECT, so restoring SELECT restores the previous
-- state exactly; the other privileges were never touched. The column-level
-- grants left behind are harmless — a table-level grant supersedes them.
grant select on public.profiles to anon, authenticated;

-- The views and the generated column are additive and safe to leave in place.
-- Uncomment only if you want the schema returned to its pre-0191 shape:
-- drop view if exists public.profiles_public;
-- drop view if exists public.profile_private;
-- alter table public.profiles drop column if exists is_active;

-- ── 0192: court_sessions and the queue tables ─────────────────────────────
grant select on public.court_sessions to anon, authenticated;
grant select on
  public.queue_courts, public.queue_teams, public.queue_team_members,
  public.queue_matches, public.queue_join_requests
to anon, authenticated;

-- The public read policies, as they were.
create policy "queue_courts readable"        on public.queue_courts        for select using (true);
create policy "queue_teams readable"         on public.queue_teams         for select using (true);
create policy "queue_team_members readable"  on public.queue_team_members  for select using (true);
create policy "queue_matches readable"       on public.queue_matches       for select using (true);
create policy "queue_join_requests readable" on public.queue_join_requests for select using (true);

-- Back onto the Realtime publication.
do $$
declare t text;
begin
  foreach t in array array['queue_courts','queue_teams','queue_team_members',
                           'queue_matches','queue_join_requests']
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ── confirm ────────────────────────────────────────────────────────────────
-- Both should now return FALSE — that is what "rolled back" looks like.
select public.profile_boundary_intact() as profile_boundary_still_closed,
       public.queue_boundary_intact()   as queue_boundary_still_closed;
