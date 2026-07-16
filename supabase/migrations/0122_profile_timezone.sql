-- 0122_profile_timezone.sql — per-member time zone: captured automatically at
-- signup (the device's IANA zone), editable in Settings → Profile. Timestamps
-- around the product (starting with Admin → Diagnostics) render in the
-- viewer's zone instead of the server's.

alter table public.profiles
  add column if not exists timezone text;
