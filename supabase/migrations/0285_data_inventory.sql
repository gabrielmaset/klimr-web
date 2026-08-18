-- 0285_data_inventory.sql — D1/D2: erasure and export stop being hand-maintained
-- opinions. KFU-006 + KFU-030.
--
-- FINDINGS (audit, accepted).
--   KFU-006: account erasure had no declared semantics per artifact. 69 public
--     tables reference profiles, with DIFFERENT delete rules — several are NO
--     ACTION, so a deletion either fails or leaves the row behind depending on
--     which table it hits. Nobody had written down what SHOULD happen to each.
--   KFU-030: the DSAR export builds coverage from a hardcoded list in the route,
--     and reports one status that conflates two different questions — "did every
--     query succeed" and "did we cover everything we hold about you". An export
--     can be labelled complete while an entire category was never asked for.
--
-- DESIGN. One versioned inventory, declared per artifact, and controls that
-- check the declaration against the CATALOG rather than against itself:
--
--   public.data_inventory        what each user-referencing table is, what the
--                                export does with it, and what erasure does.
--   erasure_semantics_gaps()     (a) user-referencing tables with no declared
--                                disposition, and (b) declarations that
--                                CONTRADICT the real FK delete rule — the case
--                                that actually bites: believing something
--                                cascades when the constraint says NO ACTION.
--   export_declared_datasets()   the source of truth the export route reads at
--                                runtime, so coverage is measured against a
--                                versioned declaration instead of against the
--                                same list that produced the archive.
--
-- The inventory is seeded with what is genuinely known today. Everything else is
-- REPORTED AS UNDECLARED rather than defaulted to something convenient: a
-- default here would be a guess about someone's personal data.

create table if not exists public.data_inventory (
  table_name    text primary key,
  user_ref      text,
  export_scope  text not null check (export_scope in
                  ('included','excluded_e2ee','excluded_shared','excluded_safety','not_personal')),
  dataset_name  text,
  erasure       text not null check (erasure in
                  ('cascade','delete','anonymize','retain_safety','retain_legal','not_personal')),
  note          text,
  version       int  not null default 1,
  declared_at   timestamptz not null default now()
);

alter table public.data_inventory enable row level security;
revoke all on public.data_inventory from anon, authenticated;
grant all on public.data_inventory to service_role;

comment on table public.data_inventory is
  'KFU-006/KFU-030: the versioned declaration of what each user-referencing table holds, what the DSAR '
  'export does with it, and what account erasure does to it. Checked against the catalog by '
  'erasure_semantics_gaps(); read at runtime by the export route.';

insert into public.data_inventory (table_name, user_ref, export_scope, dataset_name, erasure, note) values
  ('profiles','id','included','profile','delete','The account record itself.'),
  ('player_sports','user_id','included','sports','cascade',null),
  ('posts','author_id','included','posts','delete','Authored content is removed with the account.'),
  ('post_comments','author_id','included','comments','delete',null),
  ('friendships','requester_id','included','connections','cascade',null),
  ('follows','follower_id','included','follows','cascade',null),
  ('blocks','blocker_id','included','blocks','delete','Blocks are removed; the other party keeps theirs.'),
  ('team_members','user_id','included','teams','delete',null),
  ('event_rsvps','user_id','included','event_registrations','cascade',null),
  ('tournament_registrations','user_id','included','tournament_registrations','retain_legal',
   'Competition records are retained where a result stands; personal fields anonymised.'),
  ('marketplace_listings','seller_id','included','listings','delete',null),
  ('listing_offers','actor_id','included','offers_made','anonymize',
   'FK is NO ACTION: the counterparty keeps a coherent negotiation history, so the actor is anonymised rather than removed.'),
  ('provider_applications','user_id','included','professional_status_requests','delete',null),
  ('notifications','user_id','included','notifications','delete',
   'FOUND BY THIS MIGRATION''S OWN CONTROL: the FK delete rule is SET NULL, not CASCADE, so deleting an '
   'account would leave notification rows holding titles and bodies about that person with a null user. '
   'Erasure must delete them explicitly; declared delete so the contradiction check stays honest.'),
  ('conversation_reads','user_id','included','conversation_reads','cascade',null),
  ('messages','sender_id','excluded_e2ee',null,'delete',
   'Bodies are end-to-end encrypted; the server holds ciphertext it cannot read, so they cannot appear in a server-side export.'),
  ('safety_incidents','uploader_id','included','incidents_about_my_uploads','retain_safety',
   'Safety evidence is retained by policy; the member still sees that it exists.'),
  ('post_reports','reporter_id','included','reports_i_filed_posts','retain_safety',null),
  ('reports','reporter_id','included','reports_i_filed_people','retain_safety',null),
  ('admin_actions','target_user_id','included','admin_actions','retain_legal',
   'Retained as an accountability record; staff identity withheld from the member.'),
  ('courtside_devices',null,'included','courtside_devices','delete',
   'Linked through organized sessions rather than a user column.')
on conflict (table_name) do update
  set user_ref = excluded.user_ref, export_scope = excluded.export_scope,
      dataset_name = excluded.dataset_name, erasure = excluded.erasure, note = excluded.note;

-- ── controls ────────────────────────────────────────────────────────────────
create or replace function public.erasure_semantics_gaps()
returns table (table_name text, issue text)
language sql
stable
security definer
set search_path = public
as $$
  -- (a) a table holds user references and nobody declared what erasure does.
  select distinct c.relname::text, 'undeclared: references profiles with no erasure semantics'
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
   where k.contype = 'f'
     and k.confrelid = 'public.profiles'::regclass
     and not exists (select 1 from public.data_inventory di where di.table_name = c.relname)
  union all
  -- (b) the declaration contradicts the constraint. This is the one that bites:
  --     believing a row disappears when the FK says NO ACTION.
  select di.table_name,
         'declared cascade but the foreign key delete rule is ' ||
         case k.confdeltype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
                            when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT'
                            else k.confdeltype::text end
    from public.data_inventory di
    join pg_class c on c.relname = di.table_name and c.relnamespace = 'public'::regnamespace
    join pg_constraint k on k.conrelid = c.oid and k.contype = 'f'
                        and k.confrelid = 'public.profiles'::regclass
   where di.erasure = 'cascade' and k.confdeltype <> 'c';
$$;

revoke all on function public.erasure_semantics_gaps() from public, anon, authenticated;
grant execute on function public.erasure_semantics_gaps() to service_role;

create or replace function public.export_declared_datasets()
returns table (dataset_name text, table_name text)
language sql
stable
security definer
set search_path = public
as $$
  select di.dataset_name, di.table_name
    from public.data_inventory di
   where di.export_scope = 'included' and di.dataset_name is not null;
$$;

revoke all on function public.export_declared_datasets() from public, anon;
grant execute on function public.export_declared_datasets() to authenticated, service_role;

comment on function public.export_declared_datasets is
  'KFU-030: the versioned list of datasets a complete DSAR export must attempt. The export route reads '
  'this at runtime so coverage is measured against a declaration, not against the same code that built '
  'the archive.';

insert into public.function_contracts (signature, class, audience, caller_bound, note) values
  ('public.export_declared_datasets()', 'public_rpc', 'authenticated', true,
   'Returns only dataset names — no personal data, no identity argument.'),
  ('public.erasure_semantics_gaps()', 'trigger_service', 'service_role', false, 'Release-checklist control.'),
  ('public.data_inventory', 'trigger_service', 'service_role', false, 'Declaration table, service-only.')
on conflict (signature) do update set class = excluded.class, note = excluded.note;

do $$
declare v_gaps int;
begin
  v_gaps := (select count(*) from public.erasure_semantics_gaps());
  raise notice '0285: % erasure semantics gap(s) reported — undeclared tables or declarations contradicting the catalog', v_gaps;
end $$;

select public.journal_migration('0285', '0285_data_inventory.sql', null,
  'KFU-006 and KFU-030: a versioned data inventory declaring export scope and erasure semantics per user referencing table, a control that checks declarations against the real foreign key delete rules, and a runtime source of truth the DSAR export measures its coverage against.');
