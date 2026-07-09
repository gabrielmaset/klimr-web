-- 0104_marketplace_expiry_notifications.sql — daily "expiring soon" reminders
-- for active gear listings (≤3 days left), set-based, deduped, scheduled with
-- pg_cron. Defensive: if pg_cron isn't available on this plan, the migration
-- still succeeds and only the schedule is skipped (function stays ready).

create or replace function public.notify_expiring_listings()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, kind, title, body, link_url)
  select
    l.listed_by,
    'system',
    'Expiring soon — ' || l.title,
    'Your listing closes in ' || greatest(1, ceil(extract(epoch from (l.expires_at - now())) / 86400))::int || ' day(s). Relist to keep it live.',
    '/marketplace/' || l.id
  from public.marketplace_listings l
  where l.kind = 'gear'
    and l.status = 'active'
    and l.listed_by is not null
    and l.expires_at between now() and now() + interval '3 days'
    and not exists (
      select 1 from public.notifications n
      where n.user_id = l.listed_by
        and n.link_url = '/marketplace/' || l.id
        and n.title like 'Expiring soon%'
        and n.created_at > now() - interval '4 days'
    );
$$;

do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron unavailable — expiry reminders will not be scheduled (function created anyway).';
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and not exists (select 1 from cron.job where jobname = 'klimr-listing-expiry') then
    perform cron.schedule('klimr-listing-expiry', '0 16 * * *', 'select public.notify_expiring_listings()');
  end if;
exception when others then
  raise notice 'cron schedule skipped: %', sqlerrm;
end $$;
