-- 0128_display_code.sql — SEPARATE credentials for joining vs operating.
-- The public join code (posters, QR) must not double as the courtside
-- operator code, or anyone who scans the poster can drive the match controls
-- remotely. display_code is the operator/kiosk credential: shown only in
-- organizer tools, typed into the Courtside iPad, and used by /q/<code>/<n>.
alter table public.court_sessions add column if not exists display_code text;
create unique index if not exists court_sessions_display_code_key on public.court_sessions (display_code);
do $$
declare
  r record;
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  for r in select id from public.court_sessions where display_code is null loop
    loop
      candidate := '';
      for i in 1..6 loop
        candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      end loop;
      begin
        update public.court_sessions set display_code = candidate where id = r.id;
        exit;
      exception when unique_violation then
        -- collide → spin again
      end;
    end loop;
  end loop;
end $$;
