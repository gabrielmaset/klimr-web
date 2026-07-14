-- dev-seed.sql — TEST DATA for Health & Nutrition + Classes & Coaching.
-- Run in the Supabase SQL editor. Idempotent (safe to re-run).
-- Every row uses a fixed UUID from the reserved ranges below, so
-- dev-seed-cleanup.sql removes ALL of it in one pass. Seed accounts have no
-- password and cannot log in — they exist to populate directories.
--   users:    11111111-1111-4111-8111-1111111111 01..04
--   classes:  22222222-2222-4222-8222-2222222222 01..03
--   sessions: 33333333-3333-4333-8333-3333333333 01..04
--   enrolls:  44444444-4444-4444-8444-4444444444 01..04
--   reviews:  55555555-5555-4555-8555-5555555555 01..05

-- ── seed members (auth + profile) ───────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed-maya@klimr.test',  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('11111111-1111-4111-8111-111111111102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed-jonah@klimr.test', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('11111111-1111-4111-8111-111111111103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed-cole@klimr.test',  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('11111111-1111-4111-8111-111111111104', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed-priya@klimr.test', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, display_name, home_zip, avatar_hue, bio)
values
  ('11111111-1111-4111-8111-111111111101', 'Maya Reyes',   '90066', 340, 'Sports massage therapist (CMT) working with racquet athletes on the Westside.'),
  ('11111111-1111-4111-8111-111111111102', 'Jonah Park',   '90291', 150, 'Registered dietitian — fueling for tournaments and recovery.'),
  ('11111111-1111-4111-8111-111111111103', 'Cole Bennett', '90066', 25,  'USPTA tennis coach. Fundamentals first, footwork always.'),
  ('11111111-1111-4111-8111-111111111104', 'Priya Nair',   '90230', 210, 'Pickleball coach & group-fitness instructor. Drills that stick.')
on conflict (id) do update set
  display_name = excluded.display_name,
  home_zip = excluded.home_zip,
  avatar_hue = excluded.avatar_hue,
  bio = excluded.bio;

-- ── verified providers (2 health · 2 coaching) ──────────────────────────
insert into public.class_providers (user_id, status, roles, headline, bio, approved_at, rating_avg, rating_count, price_from_cents, sports)
values
  ('11111111-1111-4111-8111-111111111101', 'approved', array['massage_therapist'],            'Sports massage · CMT #123456789',        'Deep-tissue and recovery work for tennis, pickleball, and padel players. Table sessions in Mar Vista or at your club.', now(), 4.5, 2, 11000, array['tennis','pickleball','padel']),
  ('11111111-1111-4111-8111-111111111102', 'approved', array['dietitian'],                    'Registered Dietitian — performance fueling', 'Match-day nutrition plans, recovery protocols, and sustainable habits for competitive amateurs.', now(), null, 0, 9500, array['tennis','beach_volleyball']),
  ('11111111-1111-4111-8111-111111111103', 'approved', array['sport_coach'],                  'USPTA-certified tennis coach',           'Private lessons and small clinics at Mar Vista Rec. All levels — strong focus on serve mechanics.', now(), 4.5, 2, 9000, array['tennis']),
  ('11111111-1111-4111-8111-111111111104', 'approved', array['sport_coach','group_fitness'],  'Pickleball coach · group drills',        'High-energy group drills and private strategy sessions. Beginner-friendly, competitor-approved.', now(), 5.0, 1, 6500, array['pickleball'])
on conflict (user_id) do update set
  status = excluded.status,
  roles = excluded.roles,
  headline = excluded.headline,
  bio = excluded.bio,
  rating_avg = excluded.rating_avg,
  rating_count = excluded.rating_count,
  price_from_cents = excluded.price_from_cents,
  sports = excluded.sports;

-- ── reviews (named cross-reviews between seed members) ──────────────────
insert into public.provider_reviews (id, provider_user_id, reviewer_id, rating, body)
values
  ('55555555-5555-4555-8555-555555555501', '11111111-1111-4111-8111-111111111101', '11111111-1111-4111-8111-111111111103', 5, 'Shoulder felt brand new before sectionals. Maya knows racquet bodies.'),
  ('55555555-5555-4555-8555-555555555502', '11111111-1111-4111-8111-111111111101', '11111111-1111-4111-8111-111111111104', 4, 'Great recovery session — booking monthly now.'),
  ('55555555-5555-4555-8555-555555555503', '11111111-1111-4111-8111-111111111103', '11111111-1111-4111-8111-111111111102', 5, 'Fixed my toss in one lesson. Patient and precise.'),
  ('55555555-5555-4555-8555-555555555504', '11111111-1111-4111-8111-111111111103', '11111111-1111-4111-8111-111111111101', 4, 'Clinic was well-paced; drills matched our level.'),
  ('55555555-5555-4555-8555-555555555505', '11111111-1111-4111-8111-111111111104', '11111111-1111-4111-8111-111111111102', 5, 'Best group drills on the Westside — you sweat and you learn.')
on conflict (id) do nothing;

-- ── classes (clinic · group · private) ──────────────────────────────────
insert into public.classes (id, provider_id, title, sport_key, summary, status, is_paid, price_cents, price_basis, location_name, class_format, level_min, level_max, capacity)
values
  ('22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111103', 'Tennis Fundamentals Clinic', 'tennis', 'Grips, rally basics, and serve foundations in a supportive small group.', 'published', false, 0, 'per_session', 'Mar Vista Recreation Center', 'clinic', 1, 2, 6),
  ('22222222-2222-4222-8222-222222222202', '11111111-1111-4111-8111-111111111104', 'Pickleball Small-Group Drills', 'pickleball', 'Dinks, thirds, and kitchen strategy — six players max, lots of reps.', 'published', true, 2500, 'per_session', 'Penmar Recreation Center', 'group_class', 1, 3, 8),
  ('22222222-2222-4222-8222-222222222203', '11111111-1111-4111-8111-111111111103', 'Private Tennis Lesson', 'tennis', 'One-on-one with video feedback on serve and footwork.', 'published', true, 9000, 'per_session', 'Mar Vista Recreation Center', 'private_lesson', null, null, 1)
on conflict (id) do nothing;

insert into public.class_sessions (id, class_id, starts_at, capacity, status)
values
  ('33333333-3333-4333-8333-333333333301', '22222222-2222-4222-8222-222222222201', now() + interval '3 days'  + interval '17 hours', null, 'scheduled'),
  ('33333333-3333-4333-8333-333333333302', '22222222-2222-4222-8222-222222222201', now() + interval '10 days' + interval '17 hours', null, 'scheduled'),
  ('33333333-3333-4333-8333-333333333303', '22222222-2222-4222-8222-222222222202', now() + interval '5 days'  + interval '18 hours 30 minutes', null, 'scheduled'),
  ('33333333-3333-4333-8333-333333333304', '22222222-2222-4222-8222-222222222203', now() + interval '4 days'  + interval '9 hours',  null, 'scheduled')
on conflict (id) do nothing;

-- four of six clinic seats taken → the card shows "2 spots left"
insert into public.class_enrollments (id, session_id, class_id, user_id, status)
values
  ('44444444-4444-4444-8444-444444444401', '33333333-3333-4333-8333-333333333301', '22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111101', 'enrolled'),
  ('44444444-4444-4444-8444-444444444402', '33333333-3333-4333-8333-333333333301', '22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111102', 'enrolled'),
  ('44444444-4444-4444-8444-444444444403', '33333333-3333-4333-8333-333333333301', '22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111104', 'enrolled'),
  ('44444444-4444-4444-8444-444444444404', '33333333-3333-4333-8333-333333333302', '22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111102', 'enrolled')
on conflict (id) do nothing;
