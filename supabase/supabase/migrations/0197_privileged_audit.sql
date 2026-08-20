-- 0197_privileged_audit.sql — KCDX-054 (P1): service-role usage is broad and its
-- audit layer is partial and non-durable.
--
-- THE DURABILITY PROBLEM, precisely. `getPrivilegedClient` wrote its audit row
-- with `void (async () => …)()` — a floating promise. On a serverless platform
-- the response returns and the invocation can be frozen or reclaimed before that
-- promise settles, so the row is written *usually*. An audit trail that is
-- usually written is not an audit trail; it is a log with unknown gaps, and the
-- gaps appear exactly under load, which is when you need it.
--
-- The code side of the fix uses `after()` so the runtime keeps the invocation
-- alive until the write completes. This migration gives that write something
-- worth landing in:
--
--   command_id  — one id per privileged operation, so the audit row can be tied
--                 to the state change it accompanied and to the request that
--                 caused it. Without a correlation id, reconciling "did this
--                 command actually run?" means guessing from timestamps.
--   outcome     — 'started' | 'ok' | 'error'. A row that says only "someone
--                 obtained a privileged client" answers half the question. The
--                 half that matters during an incident is whether the operation
--                 succeeded, and a row stuck at 'started' is itself the signal
--                 that an invocation died mid-flight.
--
-- NOT SOLVED HERE, and the larger half of the finding: 88 files still import the
-- raw admin client directly, and a privileged mutation is still not transacted
-- with its audit row. Transacting them means the audit lives inside the domain
-- commands — which is why 0193's tournament commands are the shape the rest
-- should follow, not an exception to it. That migration is per-domain work and
-- belongs with each domain's batch.

alter table public.admin_actions
  add column if not exists command_id uuid,
  add column if not exists outcome    text;

alter table public.admin_actions
  drop constraint if exists admin_actions_outcome_check;
alter table public.admin_actions
  add constraint admin_actions_outcome_check
  check (outcome is null or outcome in ('started', 'ok', 'error'));

-- Correlation is a lookup pattern, so it gets an index. Partial: most historical
-- rows have no command id and there is no reason to carry them.
create index if not exists admin_actions_command_idx
  on public.admin_actions (command_id) where command_id is not null;

-- Finding an operation that started and never finished is the query that matters
-- during an incident, so it should be cheap.
create index if not exists admin_actions_unfinished_idx
  on public.admin_actions (created_at desc) where outcome = 'started';

comment on column public.admin_actions.command_id is
  'KCDX-054: one id per privileged operation, linking the audit row to the state change and the request.';
comment on column public.admin_actions.outcome is
  'KCDX-054: started | ok | error. A row left at ''started'' means the invocation died mid-operation — that is a signal, not noise.';
