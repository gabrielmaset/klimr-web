-- 0100_chat_realtime_publication.sql — enables realtime broadcasts for chat liveness:
-- messages (new-message events for open threads + the Courtside list) and
-- match_participants (a joined match creates a new chat row live).
-- Idempotent: safe to run more than once.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'match_participants'
  ) then
    alter publication supabase_realtime add table public.match_participants;
  end if;
end $$;
