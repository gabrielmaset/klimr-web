-- 0141_author_type_fix.sql — corrective. posts.author_type is 'user' | 'business'
-- (0132 check constraint); 0139's create_match_post inserted the nonexistent
-- 'member', which would violate the check on first call. Same function, one
-- word fixed. Safe to run whether or not the seam has ever been called.
create or replace function public.create_match_post(
  p_match_id uuid,
  p_opponent text,
  p_score text,
  p_court text,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_sport text;
  v_name text;
  v_post_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select m.sport_key into v_sport from public.matches m where m.id = p_match_id;
  if v_sport is null then raise exception 'match not found'; end if;
  if not exists (
    select 1 from public.match_participants mp
    where mp.match_id = p_match_id and mp.user_id = v_uid
  ) then raise exception 'not a participant'; end if;
  if exists (
    select 1 from public.posts p
    where p.match_id = p_match_id and p.author_id = v_uid and p.post_type = 'match'
  ) then
    select p.id into v_post_id from public.posts p
    where p.match_id = p_match_id and p.author_id = v_uid and p.post_type = 'match' limit 1;
    return v_post_id; -- idempotent per author+match
  end if;
  select pr.display_name into v_name from public.profiles pr where pr.id = v_uid;
  insert into public.posts (author_id, author_type, post_type, body, sport_key, match_id, match_summary, moderation_status)
  values (
    v_uid, 'user', 'match', nullif(p_note, ''), v_sport, p_match_id,
    jsonb_build_object('winner', coalesce(v_name, 'Winner'), 'opponent', p_opponent, 'score', p_score, 'court', p_court),
    'approved'
  ) returning id into v_post_id;
  return v_post_id;
end $$;

revoke all on function public.create_match_post(uuid, text, text, text, text) from public;
grant execute on function public.create_match_post(uuid, text, text, text, text) to authenticated;

-- The 0006 moderation triggers bypass only current_user = 'service_role', and a
-- SECURITY DEFINER function runs as its OWNER. Owned by postgres, the seam's
-- 'approved' would be forced back to 'pending'. service_role owns it instead.
-- Postgres requires the NEW owner to hold CREATE on the schema for the
-- transfer, and Supabase's service_role doesn't — grant it for one statement,
-- then take it straight back.
grant create on schema public to service_role;
alter function public.create_match_post(uuid, text, text, text, text) owner to service_role;
revoke create on schema public from service_role;
