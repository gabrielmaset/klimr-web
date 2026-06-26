-- 0028_courts_seed_expansion.sql — additional real Westside courts. Idempotent.
-- Extends the 6 courts seeded in 0015 with padel clubs, more pickleball, and a
-- Mar Vista racquetball/tennis spot so all four sports are represented on the map.
-- Fixed ids => safe to re-run.

insert into public.courts (id, name, sports, address, neighborhood, city, state, zip, lat, lng, amenities) values
  ('00000000-0000-0000-0000-00000000c0a7', 'Los Angeles Padel Club', array['padel'], '3801 Lenawee Ave', 'Culver City', 'Culver City', 'CA', '90232', 34.0182, -118.3761, array['Indoor courts','Coaching','Reservations','Pro shop']),
  ('00000000-0000-0000-0000-00000000c0a8', 'Padel Up — Culver City', array['padel'], '3007 Hauser Blvd', 'West Adams', 'Los Angeles', 'CA', '90016', 34.0265, -118.3652, array['Indoor courts','Gym','Recovery zone','Cafe','Reservations']),
  ('00000000-0000-0000-0000-00000000c0a9', 'Padel Up — Century City', array['padel'], '10250 Santa Monica Blvd', 'Century City', 'Los Angeles', 'CA', '90067', 34.0575, -118.4183, array['Rooftop courts','Coaching','Leagues','Reservations']),
  ('00000000-0000-0000-0000-00000000c0aa', 'Culver City Pickleball Courts', array['pickleball'], 'Culver Blvd & Elenda St', 'Culver City', 'Culver City', 'CA', '90230', 34.0101, -118.4051, array['Lighted courts','Free parking','Open play']),
  ('00000000-0000-0000-0000-00000000c0ab', 'Culver West Alexander Park', array['tennis','racquetball','pickleball'], '4162 Wade St', 'Mar Vista', 'Los Angeles', 'CA', '90066', 33.9933, -118.4339, array['Tennis courts','Racquetball courts','Pickleball','Playground','Free parking']),
  ('00000000-0000-0000-0000-00000000c0ac', 'Fox Hills Park', array['tennis','pickleball'], 'Green Valley Cir & Buckingham Pkwy', 'Fox Hills', 'Culver City', 'CA', '90230', 33.9834, -118.3859, array['Dedicated pickleball courts','Tennis courts','Restrooms','Walking path'])
on conflict (id) do nothing;
