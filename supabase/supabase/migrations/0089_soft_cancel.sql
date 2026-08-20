-- 0089_soft_cancel.sql — soft-cancel / soft-delete with recovery for events, tournaments, teams.
-- Nothing is hard-deleted: a cancelled/deleted row keeps all its data and can be recovered
-- within a window, after which it lives on read-only in an archive. Idempotent.
alter table events      add column if not exists cancelled_at timestamptz;
alter table tournaments add column if not exists cancelled_at timestamptz;
alter table teams       add column if not exists deleted_at   timestamptz;
create index if not exists idx_events_cancelled_at      on events (cancelled_at);
create index if not exists idx_tournaments_cancelled_at on tournaments (cancelled_at);
create index if not exists idx_teams_deleted_at         on teams (deleted_at);
