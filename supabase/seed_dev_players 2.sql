-- DEV ONLY. Demo players so rankings have data to render. Do NOT run in production.
-- Inserts fake auth.users; the on_auth_user_created trigger creates each profile.
-- Run as the project owner (the Supabase SQL editor and local psql both qualify).

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001','marcus@example.com','{"display_name":"Marcus Chen"}'),
  ('00000000-0000-0000-0000-000000000002','sofia@example.com','{"display_name":"Sofia Reyes"}'),
  ('00000000-0000-0000-0000-000000000003','yuki@example.com','{"display_name":"Yuki Tanaka"}'),
  ('00000000-0000-0000-0000-000000000004','alex@example.com','{"display_name":"Alex Rivera"}'),
  ('00000000-0000-0000-0000-000000000005','priya@example.com','{"display_name":"Priya Sharma"}'),
  ('00000000-0000-0000-0000-000000000006','diego@example.com','{"display_name":"Diego Romero"}')
on conflict (id) do nothing;

-- Demo verification statuses. The guard trigger blocks status changes for everyone
-- but the service role, so we disable it just for this seed (we are the table owner).
alter table public.profiles disable trigger guard_verification;

update public.profiles set home_zip='90066', neighborhood='Mar Vista', city='Los Angeles', state='CA', country='US', primary_sport='pickleball', verification_status='verified', avatar_hue=18  where id='00000000-0000-0000-0000-000000000001';
update public.profiles set home_zip='90066', neighborhood='Mar Vista', city='Los Angeles', state='CA', country='US', primary_sport='pickleball', verification_status='verified', avatar_hue=200 where id='00000000-0000-0000-0000-000000000002';
update public.profiles set home_zip='90024', neighborhood='Westwood',  city='Los Angeles', state='CA', country='US', primary_sport='pickleball', verification_status='verified', avatar_hue=280 where id='00000000-0000-0000-0000-000000000003';
update public.profiles set home_zip='90066', neighborhood='Mar Vista', city='Los Angeles', state='CA', country='US', primary_sport='pickleball', verification_status='verified', avatar_hue=178 where id='00000000-0000-0000-0000-000000000004';
update public.profiles set home_zip='90066', neighborhood='Mar Vista', city='Los Angeles', state='CA', country='US', primary_sport='tennis',     verification_status='verified', avatar_hue=320 where id='00000000-0000-0000-0000-000000000005';
update public.profiles set home_zip='90230', neighborhood='Culver City',city='Culver City',state='CA', country='US', primary_sport='padel',      verification_status='pending',  avatar_hue=50  where id='00000000-0000-0000-0000-000000000006';

alter table public.profiles enable trigger guard_verification;

insert into public.player_sports (user_id, sport_key, points, skill_rating, matches_played, wins) values
  ('00000000-0000-0000-0000-000000000001','pickleball',2540,3.9,47,31),
  ('00000000-0000-0000-0000-000000000002','pickleball',2810,4.1,58,38),
  ('00000000-0000-0000-0000-000000000003','pickleball',5420,5.5,112,84),
  ('00000000-0000-0000-0000-000000000004','pickleball',2280,3.8,41,26),
  ('00000000-0000-0000-0000-000000000005','tennis',2920,4.0,64,42),
  ('00000000-0000-0000-0000-000000000006','padel',1180,2.7,33,15)
on conflict (user_id, sport_key) do nothing;
