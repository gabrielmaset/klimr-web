-- 0070_tournament_gallery.sql — a public storage bucket for event photo galleries
-- (shots from previous tournaments, the venue, etc.) shown on the public /e/<code>
-- page. Photos are uploaded via a single-use signed URL minted server-side only
-- after a staff check, and the list of public URLs rides in
-- tournaments.format_config.gallery (anon already reads format_config via 0067),
-- so no extra table or anon policy is needed.
--
-- Writes and deletes go through the service role (admin client) after the action
-- verifies the caller owns/manages the tournament; the bucket is public so the
-- images load for logged-out visitors. Idempotent.

insert into storage.buckets (id, name, public)
values ('tournament-gallery', 'tournament-gallery', true)
on conflict (id) do update set public = true;
