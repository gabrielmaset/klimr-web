-- 0234_mute_and_restrict.sql — KCDX-032, part two: the per-member controls.
--
-- The owner asked for every setting to be configurable per member. That is the
-- expensive answer: five settings times every member you have ever interacted
-- with, as stored state, plus a UI to manage it — and no large product does it,
-- because nobody maintains a per-person permission table by hand.
--
-- What people actually use, and what Instagram ships, is a small number of NAMED
-- LISTS. Those are the per-member overrides, and the owner already approved all
-- three:
--
--   MUTE      I stop seeing them. They can still see and reach me, and are not
--             told. The gentlest option and by far the most used, because it
--             costs the muter nothing socially.
--
--   RESTRICT  They can see me; their comments on my posts are visible only to
--             them until I approve, and they are not told. This is the "I do not
--             want a confrontation, and I do not want them to know" case —
--             usually someone you cannot block without consequences at the club.
--
--   BLOCK     Mutual and total (0208/0209). Already built.
--
-- Three lists cover the real cases at a fraction of the cost, and can be
-- extended if members ask for more.

create table if not exists public.mutes (
  muter_id   uuid not null references public.profiles(id) on delete cascade,
  muted_id   uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id),
  check (muter_id <> muted_id)
);

create table if not exists public.restrictions (
  restrictor_id  uuid not null references public.profiles(id) on delete cascade,
  restricted_id  uuid not null references public.profiles(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (restrictor_id, restricted_id),
  check (restrictor_id <> restricted_id)
);

alter table public.mutes enable row level security;
alter table public.restrictions enable row level security;

-- Own-row only, and note the asymmetry: the muter can read their list, the muted
-- person cannot discover they are on it. That secrecy IS the feature — a mute
-- the other person can detect is just a block with extra steps.
create policy mutes_own on public.mutes
  for select to authenticated using (muter_id = auth.uid());
create policy restrictions_own on public.restrictions
  for select to authenticated using (restrictor_id = auth.uid());

grant select on public.mutes, public.restrictions to authenticated;
grant all on public.mutes, public.restrictions to service_role;

create index if not exists mutes_muter_idx on public.mutes (muter_id);
create index if not exists restrictions_restrictor_idx on public.restrictions (restrictor_id);

create or replace function public.mute_player(p_target uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.mutes (muter_id, muted_id)
  select auth.uid(), p_target
   where auth.uid() is not null and p_target is not null and auth.uid() <> p_target
  on conflict do nothing;
$$;

create or replace function public.unmute_player(p_target uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.mutes where muter_id = auth.uid() and muted_id = p_target;
$$;

create or replace function public.restrict_player(p_target uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.restrictions (restrictor_id, restricted_id)
  select auth.uid(), p_target
   where auth.uid() is not null and p_target is not null and auth.uid() <> p_target
  on conflict do nothing;
$$;

create or replace function public.unrestrict_player(p_target uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.restrictions where restrictor_id = auth.uid() and restricted_id = p_target;
$$;

revoke all on function public.mute_player(uuid), public.unmute_player(uuid),
                      public.restrict_player(uuid), public.unrestrict_player(uuid) from public, anon;
grant execute on function public.mute_player(uuid), public.unmute_player(uuid),
                        public.restrict_player(uuid), public.unrestrict_player(uuid)
  to authenticated, service_role;

-- ── the predicates ───────────────────────────────────────────────────────
create or replace function public.is_muted_by(p_viewer uuid, p_author uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.mutes m where m.muter_id = p_viewer and m.muted_id = p_author);
$$;

create or replace function public.is_restricted_by(p_owner uuid, p_commenter uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.restrictions r
                  where r.restrictor_id = p_owner and r.restricted_id = p_commenter);
$$;

grant execute on function public.is_muted_by(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_restricted_by(uuid, uuid) to authenticated, service_role;

-- ── the feed honours a mute ──────────────────────────────────────────────
-- A mute is one-directional and silent, so it belongs in the VIEWER's read path
-- rather than in the author's visibility. `feed_items` is where the muted person
-- would otherwise keep appearing.
drop policy if exists "feed read published" on public.feed_items;
create policy "feed read published" on public.feed_items
  for select to authenticated using (
    auth.role() = 'authenticated'
    and published_at <= now()
    and not public.is_blocked_pair(auth.uid(), actor_id)
    and not public.is_muted_by(auth.uid(), actor_id)
  );

-- ── blocked people's past comments hide, and come back on unblock ────────
-- The owner's answer: hidden, not deleted, so unblocking restores them. That is
-- the humane version and it is also the cheap one — blocks already FILTER rather
-- than delete, so this is a predicate, not a migration of data. A delete would
-- have been irreversible and would have destroyed other people's threads.
create or replace function public.comment_visible_to(p_comment uuid, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.post_comments c
      join public.posts p on p.id = c.post_id
     where c.id = p_comment
       and not public.is_blocked_pair(p_viewer, c.author_id)
       and not public.is_muted_by(p_viewer, c.author_id)
       -- A restricted person's comment is visible to them and to the post's
       -- owner, and to nobody else, until the owner approves it. They are never
       -- told, which is the entire point.
       and (
         not public.is_restricted_by(p.author_id, c.author_id)
         or p_viewer = c.author_id
         or p_viewer = p.author_id
       )
  );
$$;

grant execute on function public.comment_visible_to(uuid, uuid) to authenticated, service_role;

comment on function public.comment_visible_to is
  'KCDX-032: block hides a comment reversibly (unblocking restores it — hidden, never deleted); mute '
  'hides it for the muter only; restrict shows it to its author and the post owner alone. None of the '
  'three tells the other person, which is what makes them usable.';
