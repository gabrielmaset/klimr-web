-- 0225_post_reports.sql — KCDX-034 (P1, part): the active Feed has no way to
-- report a post.
--
-- `feed-post-card.tsx` — the card the live Feed actually renders — has no
-- report control, no delete control, and no reply. The richer components with
-- those affordances are legacy-only. `deleteOwnPost` exists in
-- `app/feed/actions.ts` and nothing reaches it.
--
-- So a member who sees something harmful in the Feed has no way to tell us. Not
-- a slow way or an awkward way: none. Every other safety control built this week
-- — the CSAM hash gate, the AI classifier, re-moderation on edit, video
-- containment — is automated detection. This is the one that catches what
-- automation misses, and it was missing.
--
-- ── THE EVIDENCE PROBLEM IS THE DESIGN PROBLEM ───────────────────────────
-- A report is about content, and the author can change that content the moment
-- they suspect a report. 0194 sends an edited post back to moderation, which
-- helps; deletion does not, because the row is gone and a moderator opens an
-- empty case.
--
-- So reporting SNAPSHOTS what was reported — the body text as it stood — and
-- registers any attached media as a `safety_incidents` row, which 0224's purge
-- and delete-trigger already skip. Both mechanisms already existed; nothing was
-- writing to them from a member-facing path.
--
-- ── DEDUPE AND RATE LIMIT ────────────────────────────────────────────────
-- One open report per person per post: reporting twice is not two reports, and a
-- moderator queue that counts the same person twice reads as consensus when it
-- is repetition. A per-reporter rate limit stops the queue being flooded — the
-- limit is deliberately generous, because a slow report is better than no
-- report and someone having a bad night on the Feed may legitimately report
-- several things.

create table if not exists public.post_reports (
  id           uuid primary key default gen_random_uuid(),
  -- NULLABLE, and that is the point: `on delete set null` with `not null` is a
  -- contradiction that makes deleting a reported post fail outright. The report
  -- must survive the post, so the reference is allowed to go while the snapshot
  -- below carries the case.
  post_id      uuid references public.posts(id) on delete set null,
  reporter_id  uuid not null references public.profiles(id) on delete cascade,
  author_id    uuid,                       -- who posted it, captured at report time
  reason       text not null check (reason in ('spam','harassment','hate','violence','sexual','minor_safety','self_harm','other')),
  detail       text,
  -- The snapshot. `post_id` is ON DELETE SET NULL rather than CASCADE
  -- deliberately: if the author deletes the post, the REPORT must survive it.
  -- A report that vanishes when the reported content vanishes is a reporting
  -- system that stops working exactly when someone is trying to escape it.
  body_snapshot   text,
  media_snapshot  text,
  status       text not null default 'open' check (status in ('open','reviewing','actioned','dismissed')),
  created_at   timestamptz not null default now(),
  reviewed_by  uuid,
  reviewed_at  timestamptz,
  resolution   text
);

alter table public.post_reports enable row level security;

-- A reporter may see their own reports; nobody else reads them from the client.
create policy post_reports_own on public.post_reports
  for select to authenticated using (reporter_id = auth.uid());

grant select on public.post_reports to authenticated;
grant all on public.post_reports to service_role;

-- Dedupe applies while the post still exists; once `post_id` is null the row is
-- history, and two people's reports about a deleted post are two separate cases.
create unique index if not exists post_reports_one_open
  on public.post_reports (post_id, reporter_id) where status in ('open','reviewing') and post_id is not null;
create index if not exists post_reports_queue_idx
  on public.post_reports (created_at) where status = 'open';

create or replace function public.report_post(
  p_post   uuid,
  p_reason text,
  p_detail text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_me uuid := auth.uid(); v_post record; v_id uuid;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;

  select id, author_id, body, media_path into v_post from public.posts where id = p_post;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_post.author_id = v_me then return jsonb_build_object('ok', false, 'error', 'own_post'); end if;

  -- Generous on purpose: a slow report is better than no report, and someone
  -- having a bad night on the Feed may legitimately report several things.
  if not public.check_rate_limit('report-post:' || v_me::text, 20, 3600) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- Reporting twice is not two reports. A queue that counts one person twice
  -- reads as consensus when it is repetition.
  if exists (
    select 1 from public.post_reports
     where post_id = p_post and reporter_id = v_me and status in ('open','reviewing')
  ) then
    return jsonb_build_object('ok', true, 'already_reported', true);
  end if;

  insert into public.post_reports (post_id, reporter_id, author_id, reason, detail, body_snapshot, media_snapshot)
  values (p_post, v_me, v_post.author_id, p_reason, left(coalesce(p_detail,''), 1000),
          left(coalesce(v_post.body,''), 4000), v_post.media_path)
  returning id into v_id;

  -- Preserve the media so 0224's purge and the delete trigger leave it alone.
  -- Both already skip `safety_incidents` paths; nothing was writing one from a
  -- member-facing path.
  if v_post.media_path is not null then
    insert into public.safety_incidents (kind, status, uploader_id, post_id, storage_path, reported_at, notes)
    values ('user_report', 'preserved', v_post.author_id, p_post, v_post.media_path, now(),
            'Preserved for member report ' || v_id::text)
    on conflict do nothing;
  end if;

  return jsonb_build_object('ok', true, 'report_id', v_id);
end;
$$;

revoke all on function public.report_post(uuid, text, text) from public, anon;
grant execute on function public.report_post(uuid, text, text) to authenticated, service_role;

comment on function public.report_post is
  'KCDX-034: a member reporting a post. Snapshots the body and preserves the media as a safety incident, '
  'because the author can delete the content the moment they suspect a report — and a report that dies '
  'with the content it is about stops working exactly when someone is trying to escape it.';
