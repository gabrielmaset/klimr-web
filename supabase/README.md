# Klimr database (Supabase)

## Files
- `migrations/0001_init.sql` — full schema: tables, enums, RLS policies, the new-user→profile trigger, the verification guard, security-definer helpers, and `ranked_players(p_sport, p_scope, p_region)` — the function behind the geographic zoom.
- `seed.sql` — reference data (5 sports + LA-area ZIP→region rows). Safe in any environment.
- `seed_dev_players.sql` — DEV ONLY demo players so rankings render. Do not run in production.

## Apply — Supabase SQL editor
1. Supabase project → SQL Editor.
2. Run `migrations/0001_init.sql`.
3. Run `seed.sql`.

## Apply — Supabase CLI
    supabase link --project-ref <your-ref>
    supabase db push        # applies migrations/
    # run seed.sql via the SQL editor or psql

## ranked_players — the geographic zoom
`scope` is one of `zip`, `neighborhood`, `city`, `state`, `national`, `world`; `region` is the value at that scope. Examples:

    select * from ranked_players('pickleball', 'world');
    select * from ranked_players('pickleball', 'zip', '90066');
    select * from ranked_players('pickleball', 'city', 'Los Angeles');

## Integrity rules enforced in the DB
- Ranking points (`player_sports.points / wins / matches_played`) have **no user UPDATE policy** — only the server (service role) writes them.
- `profiles.verification_status` can be changed **only by the service role** (a trigger preserves the old value otherwise) — users cannot self-verify.

## Note on the dev player seed
`seed_dev_players.sql` inserts rows into `auth.users` directly. That works against the **local** Supabase stack (`supabase start`) and self-hosted Postgres. On **hosted** Supabase, create demo users from the dashboard (Authentication → Add user) — the profile auto-creates via the trigger — then run only the profile UPDATEs and the `player_sports` INSERTs from that file.

## Regenerate types after schema changes
    npx supabase gen types typescript --project-id <your-id> > lib/database.types.ts
