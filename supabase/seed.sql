-- Reference data. Safe to run in any environment (idempotent).

insert into public.sports (key, name, skill_system) values
  ('tennis','Tennis','NTRP'),
  ('pickleball','Pickleball','DUPR'),
  ('padel','Padel','Level'),
  ('racquetball','Racquetball','USAR'),
  ('golf','Golf','Handicap')
on conflict (key) do nothing;

insert into public.zip_regions (zip, neighborhood, city, state, country) values
  ('90066','Mar Vista','Los Angeles','CA','US'),
  ('90405','Santa Monica','Santa Monica','CA','US'),
  ('90230','Culver City','Culver City','CA','US'),
  ('90049','Brentwood','Los Angeles','CA','US'),
  ('90024','Westwood','Los Angeles','CA','US'),
  ('90291','Venice','Los Angeles','CA','US')
on conflict (zip) do nothing;
