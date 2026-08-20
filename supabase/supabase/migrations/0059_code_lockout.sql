-- 0059_code_lockout.sql — lock an IP out after repeated WRONG invite codes.
--
-- Counts only failed code attempts (a correct code clears the counter). After 5
-- wrong codes within 15 minutes, the IP is locked for 5 minutes. Applies to both
-- invite-code entry points (the /gate portal and signup). Service-role only.

create table if not exists public.code_attempt_lockouts (
  bucket        text primary key,                    -- e.g. 'codeguess:<ip>'
  fail_count    int not null default 0,
  window_start  timestamptz not null default now(),
  locked_until  timestamptz
);

alter table public.code_attempt_lockouts enable row level security;
revoke all on table public.code_attempt_lockouts from anon, authenticated, public;

-- Seconds remaining on an active lockout for a bucket (0 if not locked).
create or replace function public.code_lock_seconds(p_bucket text)
returns int language plpgsql security definer set search_path = public as $$
declare v timestamptz;
begin
  select locked_until into v from public.code_attempt_lockouts where bucket = p_bucket;
  if v is not null and v > now() then
    return ceil(extract(epoch from (v - now())))::int;
  end if;
  return 0;
end; $$;

-- Record a wrong attempt. Resets the counter if the accumulation window lapsed or a
-- previous lock expired; locks for p_lock_seconds once fail_count reaches p_max.
-- Returns the lockout seconds remaining if this attempt triggered/continues a lock, else 0.
create or replace function public.note_code_failure(p_bucket text, p_max int, p_window_seconds int, p_lock_seconds int)
returns int language plpgsql security definer set search_path = public as $$
declare
  r public.code_attempt_lockouts%rowtype;
  v_count int;
begin
  delete from public.code_attempt_lockouts
    where (locked_until is null or locked_until < now())
      and window_start < now() - interval '1 day';  -- opportunistic cleanup

  select * into r from public.code_attempt_lockouts where bucket = p_bucket;

  if r.locked_until is not null and r.locked_until > now() then
    return ceil(extract(epoch from (r.locked_until - now())))::int;
  end if;

  if r.bucket is null then
    insert into public.code_attempt_lockouts (bucket, fail_count, window_start) values (p_bucket, 1, now());
    v_count := 1;
  elsif now() - r.window_start > make_interval(secs => p_window_seconds) then
    update public.code_attempt_lockouts set fail_count = 1, window_start = now(), locked_until = null where bucket = p_bucket;
    v_count := 1;
  else
    update public.code_attempt_lockouts set fail_count = fail_count + 1 where bucket = p_bucket returning fail_count into v_count;
  end if;

  if v_count >= p_max then
    update public.code_attempt_lockouts set locked_until = now() + make_interval(secs => p_lock_seconds) where bucket = p_bucket;
    return p_lock_seconds;
  end if;
  return 0;
end; $$;

-- Clear the counter for a bucket (called on a correct code).
create or replace function public.clear_code_attempts(p_bucket text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.code_attempt_lockouts where bucket = p_bucket;
end; $$;

revoke all on function public.code_lock_seconds(text) from anon, authenticated, public;
revoke all on function public.note_code_failure(text, int, int, int) from anon, authenticated, public;
revoke all on function public.clear_code_attempts(text) from anon, authenticated, public;
grant execute on function public.code_lock_seconds(text) to service_role;
grant execute on function public.note_code_failure(text, int, int, int) to service_role;
grant execute on function public.clear_code_attempts(text) to service_role;
