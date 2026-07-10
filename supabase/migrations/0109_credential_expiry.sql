-- 0109_credential_expiry.sql — expiry-conditioned professional approvals:
-- (1) class_providers.credential_expires_at — set by the admin at approval
--     from the document/registry. Expired pros drop out of listings
--     automatically (directory queries filter); their status is preserved so
--     resubmission restores them without re-review of identity.
-- (2) Daily reminders: 90 days out ("resubmit your documentation") and a
--     final 14-day warning. Deduped; set-based; defensive pg_cron wrapper.

alter table public.class_providers
  add column if not exists credential_expires_at timestamptz;

create index if not exists class_providers_expiry_idx
  on public.class_providers (credential_expires_at)
  where credential_expires_at is not null;

create or replace function public.notify_expiring_credentials()
returns void
language sql
security definer
set search_path = public
as $$
  -- 90-day notice (deduped over 60 days)
  insert into public.notifications (user_id, kind, title, body, link_url)
  select cp.user_id, 'system',
         'Your professional credential expires ' || to_char(cp.credential_expires_at, 'Mon DD, YYYY'),
         'Resubmit your documentation in Settings → Professional status to stay listed. Listings hide automatically at expiration.',
         '/settings/professional'
  from public.class_providers cp
  where cp.status = 'approved'
    and cp.credential_expires_at between now() and now() + interval '90 days'
    and not exists (
      select 1 from public.notifications n
      where n.user_id = cp.user_id
        and n.link_url = '/settings/professional'
        and n.title like 'Your professional credential expires%'
        and n.created_at > now() - interval '60 days'
    );

  -- 14-day final warning (deduped over 10 days)
  insert into public.notifications (user_id, kind, title, body, link_url)
  select cp.user_id, 'system',
         'Final notice — credential expires ' || to_char(cp.credential_expires_at, 'Mon DD, YYYY'),
         'Your listing will be hidden at expiration. Resubmit your documentation now to avoid interruption.',
         '/settings/professional'
  from public.class_providers cp
  where cp.status = 'approved'
    and cp.credential_expires_at between now() and now() + interval '14 days'
    and not exists (
      select 1 from public.notifications n
      where n.user_id = cp.user_id
        and n.link_url = '/settings/professional'
        and n.title like 'Final notice — credential expires%'
        and n.created_at > now() - interval '10 days'
    );
$$;

do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron unavailable — credential reminders will not be scheduled (function created anyway).';
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and not exists (select 1 from cron.job where jobname = 'klimr-credential-expiry') then
    perform cron.schedule('klimr-credential-expiry', '10 16 * * *', 'select public.notify_expiring_credentials()');
  end if;
exception when others then
  raise notice 'cron schedule skipped: %', sqlerrm;
end $$;
