-- 0262_migration_journal.sql — a durable record of which migrations this database
-- has actually run, and a way to compare it against the repository.
--
-- KRA-012 (P1, re-audit 2026-08-10). Klimr applies migrations by pasting SQL into
-- the Supabase editor. Nothing records that this happened. `MIGRATIONS_LEDGER.md`
-- is a hand-maintained file in the REPO, so it states what someone believed and
-- typed — not what the database did.
--
-- The cost has been concrete and recurring throughout this remediation. Every
-- claim of the form "production is at 0234" traced back to a person remembering,
-- and every disposition that depended on it inherited that uncertainty. The
-- audit's phrasing is exact: there is no machine-generated proof that production
-- ran 0001–0234 with matching checksums.
--
-- ── WHAT THIS DOES AND DOES NOT SOLVE ────────────────────────────────────
-- It cannot retroactively prove what happened before it exists. A journal that
-- starts today records from today. The entry for everything earlier is the
-- owner's confirmation, and that is now written INTO the database rather than
-- left in a chat log — which is a smaller claim than the audit asks for, and the
-- honest one.
--
-- What it does give, from now on: every migration that runs records itself with
-- its own checksum, `journal_drift()` names any file in the repo the database has
-- not run, and the readiness gate refuses to boot against a database that is
-- behind the code. Applying by paste is unchanged; the journalling is one line at
-- the end of each file.

create table if not exists public.migration_journal (
  id          text primary key,          -- '0262'
  filename    text not null,
  checksum    text,                      -- sha256 of the file, when the caller supplies it
  applied_at  timestamptz not null default now(),
  applied_by  text not null default current_user,
  note        text
);

alter table public.migration_journal enable row level security;
revoke all on public.migration_journal from anon, authenticated;
grant all on public.migration_journal to service_role;

comment on table public.migration_journal is
  'KRA-012: what this database has actually run. MIGRATIONS_LEDGER.md is a file in the repo and '
  'records what someone believed; this records what happened, written by the migration itself.';

-- ── recording ────────────────────────────────────────────────────────────
-- Idempotent: re-pasting a migration is a normal recovery action and must not
-- fail on its own journal line. The FIRST application is what is dated, because
-- that is the fact of interest — a re-run does not change when the schema
-- changed.
create or replace function public.journal_migration(
  p_id       text,
  p_filename text,
  p_checksum text default null,
  p_note     text default null
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.migration_journal (id, filename, checksum, note)
  values (p_id, p_filename, p_checksum, p_note)
  on conflict (id) do update
     set filename = excluded.filename,
         checksum = coalesce(excluded.checksum, public.migration_journal.checksum),
         note     = coalesce(excluded.note, public.migration_journal.note);
$$;

revoke all on function public.journal_migration(text, text, text, text) from public, anon, authenticated;
grant execute on function public.journal_migration(text, text, text, text) to service_role;

-- ── the pre-existing history, recorded as what it is ─────────────────────
-- 0001–0261 ran before this table existed. Their entry is the OWNER'S
-- CONFIRMATION, marked as such, so nobody later reads a complete-looking journal
-- and believes the early rows were machine-observed. `applied_at` is deliberately
-- null-ish in meaning: the note carries the caveat, not a fabricated timestamp.
insert into public.migration_journal (id, filename, checksum, applied_by, note)
values (
  '0000-baseline',
  'pre-journal history',
  null,
  'owner-confirmation',
  'Migrations 0001-0261 were applied before this journal existed. Owner confirmed 0001-0234 applied ' ||
  '2026-08-10; 0235+ were pasted after that confirmation. These rows are ASSERTED, not observed — ' ||
  'the first machine-recorded entry is 0262 itself.'
)
on conflict (id) do nothing;

-- ── drift: what the repo has that the database has not run ───────────────
-- The repo side is supplied by the caller (a migration file list), because the
-- database cannot read the filesystem. `tests/` and the readiness gate pass it in.
create or replace function public.journal_drift(p_repo_ids text[])
returns table (id text, state text)
language sql
stable
security definer
set search_path = public
as $$
  select r.id,
         case when j.id is null then 'in_repo_not_applied' else 'applied' end
    from unnest(p_repo_ids) as r(id)
    left join public.migration_journal j on j.id = r.id
   where j.id is null
  union all
  -- And the reverse: something ran here that the repo does not contain, which
  -- means a hand-edit in the SQL console or a branch that was never merged.
  select j.id, 'applied_not_in_repo'
    from public.migration_journal j
   where j.id <> '0000-baseline'
     and not (j.id = any(p_repo_ids));
$$;

revoke all on function public.journal_drift(text[]) from public, anon, authenticated;
grant execute on function public.journal_drift(text[]) to service_role;

comment on function public.journal_drift is
  'KRA-012: compares the repository migration list against what this database has journalled. Reports '
  'BOTH directions — a file never applied, and a migration applied here that no file explains.';

create or replace function public.migration_journal_intact()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- the baseline is present and honest about what it is
    exists (
      select 1 from public.migration_journal
       where id = '0000-baseline' and applied_by = 'owner-confirmation'
         and note like '%ASSERTED, not observed%'
    )
    -- and this migration journalled itself, which is the proof the mechanism runs
    and exists (select 1 from public.migration_journal where id = '0262');
$$;

revoke all on function public.migration_journal_intact() from public, anon, authenticated;
grant execute on function public.migration_journal_intact() to service_role;

-- ── this migration records itself ────────────────────────────────────────
-- The line every migration from here carries. It is last, so it records only a
-- migration that reached the end.
select public.journal_migration('0262', '0262_migration_journal.sql', null,
  'First machine-recorded entry. Everything before this is the owner-confirmation baseline.');

create or replace function public.klimr_ready(p_min_checks integer default 42)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*) from public.klimr_readiness()) >= p_min_checks
     and not exists (select 1 from public.klimr_readiness() where not passed);
$$;

revoke all on function public.klimr_ready(integer) from public, anon, authenticated;
grant execute on function public.klimr_ready(integer) to service_role;
