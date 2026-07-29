-- 0143_admin_action_meta.sql — structured evidence for the admin audit trail.
-- admin_actions gains a meta jsonb snapshot (who/what/before/after, doc refs,
-- notes) written at action time, so every staff action carries a complete,
-- immutable record that the Trust & Safety overlay can display. Idempotent.
alter table public.admin_actions add column if not exists meta jsonb;
create index if not exists admin_actions_created_idx
  on public.admin_actions (created_at desc);
