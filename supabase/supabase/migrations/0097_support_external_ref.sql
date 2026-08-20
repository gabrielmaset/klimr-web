-- 0097_support_external_ref.sql — reserves two-way helpdesk sync on support tickets.
-- When Klimr connects a third-party support system (Zendesk / Zoho / Intercom /
-- Salesforce), the vendor's ticket id is stored here so updates can flow both
-- ways. Nullable and unused until an integration is switched on.

alter table public.support_tickets
  add column if not exists external_ref text;

-- Lookups by vendor id must stay indexed at any ticket volume; partial index
-- keeps it free for the (currently universal) null case.
create index if not exists support_tickets_external_ref_idx
  on public.support_tickets (external_ref)
  where external_ref is not null;
