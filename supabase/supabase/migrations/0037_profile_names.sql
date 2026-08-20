-- 0037_profile_names.sql — capture legal first + last name at signup so a real
-- identity-verification step can match against it later. The app shows only the
-- first name (display_name). Idempotent.

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name  text;

-- Bootstrap profile from signup metadata: store first/last name and default the
-- visible display_name to the first name (falling back to the email prefix).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, first_name, last_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'first_name', ''),
      split_part(new.email, '@', 1)
    ),
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', '')
  )
  on conflict (id) do nothing;
  return new;
end; $$;
