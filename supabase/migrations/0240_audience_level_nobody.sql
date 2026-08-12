-- 0240_audience_level_nobody.sql — adds the `nobody` level to the audience ladder.
--
-- ENUM VALUES ONLY. Nothing in this migration uses the new value, and that is
-- deliberate: PostgreSQL cannot use an enum value in the same transaction that
-- adds it. This project already learned that once — 0172/0173 were split for the
-- same reason — so the machinery lives in 0241 and this file must COMMIT first.
--
-- Owner decision (2026-08-10): Klimr had two invite controls after 0233 —
-- `user_preferences.who_can_invite` ('anyone' | 'nobody', from 0144, mirrored to
-- the indexed `profiles.open_to_invites` flag) and the ladder's
-- `profiles.who_can_invite` audience_level. Both were enforced, with the boolean
-- as the stricter override, so there was no hole — but two settings that mean
-- overlapping things is how surfaces start disagreeing, which is the defect
-- KCDX-032 was raised about in the first place.
--
-- The ladder becomes the single control. It could not express "nobody" until now,
-- which is precisely why the boolean had to survive alongside it.

alter type public.audience_level add value if not exists 'nobody';

-- Ordering note for the reader: `nobody` is the STRICTEST level and sits below
-- `connections`. The enum's declared order is not relied upon anywhere — every
-- comparison in `may_act_on` is an explicit CASE arm, not an inequality — so
-- appending the value is safe and does not reorder the ladder's meaning.
