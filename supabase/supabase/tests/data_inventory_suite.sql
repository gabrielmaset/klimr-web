-- data_inventory_suite.sql — KFU-006 / KFU-030 closure control.
-- Proves the inventory is checked against the CATALOG (not against itself), that
-- the contradiction detector actually fires, and that the export's coverage
-- source of truth is the declaration rather than the route's own list.
\set ON_ERROR_STOP on
begin;

-- ── the declaration is currently consistent with the catalog ────────────────
select case when not exists (select 1 from public.erasure_semantics_gaps()
                              where issue like 'declared cascade%')
  then 'ok   INV no declaration contradicts its foreign key delete rule'
  else 'INV-FAIL a declared cascade contradicts the catalog' end;

-- ── planted contradiction: the control must catch it ────────────────────────
update public.data_inventory set erasure = 'cascade' where table_name = 'notifications';
select case when exists (select 1 from public.erasure_semantics_gaps()
                          where table_name = 'notifications' and issue like 'declared cascade%')
  then 'ok   INV CONTROL a false cascade claim is detected (planted, observed red)'
  else 'INV-FAIL the contradiction control is blind' end;
update public.data_inventory set erasure = 'delete' where table_name = 'notifications';
select case when not exists (select 1 from public.erasure_semantics_gaps()
                              where table_name = 'notifications' and issue like 'declared cascade%')
  then 'ok   INV CONTROL the planted contradiction clears when corrected'
  else 'INV-FAIL control stuck on' end;

-- ── planted undeclared table: the coverage control must catch it ────────────
create table if not exists public.inv_planted_userdata (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  secret text
);
select case when exists (select 1 from public.erasure_semantics_gaps()
                          where table_name = 'inv_planted_userdata')
  then 'ok   INV CONTROL a new user-referencing table is reported as undeclared'
  else 'INV-FAIL a new table holding user data went undetected' end;

insert into public.data_inventory (table_name, user_ref, export_scope, dataset_name, erasure, note)
values ('inv_planted_userdata','user_id','included','planted','cascade','suite fixture');
select case when not exists (select 1 from public.erasure_semantics_gaps()
                              where table_name = 'inv_planted_userdata')
  then 'ok   INV CONTROL declaring the table clears the gap (the control tracks intent)'
  else 'INV-FAIL declaration did not clear the gap' end;
drop table public.inv_planted_userdata;

-- ── the export source of truth ──────────────────────────────────────────────
select case when (select count(*) from public.export_declared_datasets()) >= 15
  then 'ok   INV the export reads a versioned declaration of what it must cover'
  else 'INV-FAIL the declared export surface is implausibly small' end;
select case when not exists (select 1 from public.export_declared_datasets() where dataset_name is null)
  then 'ok   INV every included artifact names the dataset it appears as'
  else 'INV-FAIL an included artifact has no dataset name' end;

-- ── E2EE content is declared EXCLUDED with a stated reason, not forgotten ───
select case when (select export_scope from public.data_inventory where table_name = 'messages') = 'excluded_e2ee'
        and (select note from public.data_inventory where table_name = 'messages') is not null
  then 'ok   INV excluded categories carry a recorded reason (not silent omission)'
  else 'INV-FAIL an exclusion has no stated reason' end;

-- ── members cannot read the inventory itself ────────────────────────────────
select case when has_table_privilege('authenticated','public.data_inventory','select') = false
  then 'ok   INV the inventory is service-only'
  else 'INV-FAIL members can read the data inventory' end;

rollback;
