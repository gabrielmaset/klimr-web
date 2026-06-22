-- 0056_rate_limits.sql — generic app-layer rate limiter.
--
-- A fixed-window counter keyed by an arbitrary string (e.g. "signup:<ip>"). The
-- app calls check_rate_limit() through the service role before sensitive actions
-- (invite-code checks, support form, payment-proof uploads) to throttle abuse and
-- enumeration that Supabase's own auth limits don't cover.

create table if not exists public.rate_limit_hits (
  bucket     text primary key,
  count      int not null default 0,
  expires_at timestamptz not null
);

alter table public.rate_limit_hits enable row level security;
-- No policies: only the service role (via the security-definer function) writes here.
revoke all on table public.rate_limit_hits from anon, authenticated, public;

-- Returns true if the call is allowed, false if the bucket is over p_max within the
-- current window. The window resets once expired.
create or replace function public.check_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  delete from public.rate_limit_hits where expires_at < now();  -- opportunistic cleanup

  insert into public.rate_limit_hits (bucket, count, expires_at)
    values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (bucket) do update
    set count = case when public.rate_limit_hits.expires_at < now() then 1
                     else public.rate_limit_hits.count + 1 end,
        expires_at = case when public.rate_limit_hits.expires_at < now()
                          then now() + make_interval(secs => p_window_seconds)
                          else public.rate_limit_hits.expires_at end
  returning count into v_count;

  return v_count <= p_max;
end; $$;

revoke all on function public.check_rate_limit(text, int, int) from anon, authenticated, public;
grant execute on function public.check_rate_limit(text, int, int) to service_role;
