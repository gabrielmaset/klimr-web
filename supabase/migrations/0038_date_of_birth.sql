-- 0038_date_of_birth.sql — full date of birth, captured at profile creation
-- (18+ enforced in the app). Age is derived from this for public display; the
-- exact date is never shown to other members. birth_year stays as a fallback.
-- Idempotent.

alter table public.profiles add column if not exists date_of_birth date;
