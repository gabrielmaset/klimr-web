-- 0098_recreational_role_cleanup.sql — recreational teams have no manager/staff tier.
-- The old ownership-transfer path demoted outgoing owners to 'manager' regardless of
-- team category, so recreational teams could carry phantom manager rows. Sweep any
-- manager/staff on non-pro teams back to plain members. Idempotent; owner untouched
-- (the owner IS the "team manager" on recreational teams).

update public.team_members tm
set role = 'member'
from public.teams t
where t.id = tm.team_id
  and t.category <> 'pro'
  and tm.role in ('manager', 'staff');
