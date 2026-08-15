---
paths:
  - "app/**"
  - "lib/**"
  - "components/**"
---

# Application data-access invariants

Apply these rules whenever application code reads or changes PostgreSQL, Supabase Data API/RPC, Storage, Realtime, caches, or durable state.

- Identify the effective database role/client for every access. A service-role or privileged client is exceptional, server-only, narrowly scoped, and still requires explicit business authorization.
- Trace the effective RLS, grants, function/view security, and public/Realtime/Storage exposure; application code cannot assume a migration name means a policy is active remotely.
- Use one approved server-only data-access/domain boundary per capability. It authenticates/authorizes and returns an audience-specific allowlisted DTO.
- Never pass raw rows, `select('*')` results, private identifiers/codes, exact location, policy/relationship internals, or service-role results across browser/public boundaries.
- Check every Supabase/database result and affected-row expectation. A discarded error/result, silent zero-row update, or partial insert is a failure, not success.
- Server-owned role, owner, status, price/value, verification, moderation, capacity, score/ranking, privilege, and timestamps are derived from trusted state and rejected/ignored from client write input.
- Durable uniqueness, capacity, money/value, order, lifecycle, and replay invariants are constraint-backed and changed atomically. UI checks and read-count-write sequences are forbidden.
- State transitions validate current state, caller, object/version precondition, and next state in the same command/transaction; high-impact transitions emit an audit event and durable side-effect work.
- Cache keys and invalidation include every audience/permission/version dimension. Cache or Realtime must not delay revocation beyond the documented safe bound.
- Preserve Klimr's Supabase Data API approach unless a reviewed ADR and connection budget justify a direct PostgreSQL driver. Serverless direct connections require the correct pooler mode, global/per-instance caps, statement/lock/idle timeouts, leak handling, and saturation alerts.
- Tests use real low-privilege roles and at least user A/user B; service-role success is separate. Contested state uses synchronized real-PostgreSQL clients.
- For schema-dependent changes, also open `database-supabase.md` and complete the applicable migration/failure plan.
