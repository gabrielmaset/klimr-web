-- 0022_harden_functions.sql
-- Clears the Security Advisor's "Function Search Path Mutable" warnings by pinning
-- a fixed search_path on the functions that were missing it, and revokes EXECUTE on
-- the new-user trigger (it's fired by the auth.users trigger, never called directly).
-- No behavioral change. Safe to run once.

-- Pin search_path (the trigger guards + the ranking function were missing it).
alter function public.force_moderation_pending()      set search_path = public;
alter function public.guard_moderation_update()        set search_path = public;
alter function public.guard_verification_status()      set search_path = public;
alter function public.guard_account_status()           set search_path = public;
alter function public.guard_player_stats()             set search_path = public;
alter function public.ranked_players(text, text, text) set search_path = public;

-- handle_new_user runs only as the auth.users INSERT trigger (it executes with the
-- definer's rights regardless of grants), so nothing should be able to call it
-- directly. Revoking EXECUTE clears its "can execute" warnings with zero impact.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
