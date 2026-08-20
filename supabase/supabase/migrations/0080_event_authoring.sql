-- 0080_event_authoring.sql — let members create and manage their OWN events
-- (open play, ladder nights, clinics, socials, casual round-robins). Authoring
-- was previously curated (admin/service only); this opens it to any authenticated
-- member, scoped to rows they own (created_by = auth.uid()). Table privileges
-- first, then row policies. Hard deletes stay disallowed — hosts cancel instead
-- (status = 'cancelled' via the update policy). Idempotent.

grant insert, update on public.events to authenticated;

drop policy if exists "events insert own" on public.events;
create policy "events insert own" on public.events
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "events update own" on public.events;
create policy "events update own" on public.events
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());
