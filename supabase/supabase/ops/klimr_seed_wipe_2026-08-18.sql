-- klimr_seed_wipe_2026-08-18.sql — ONE-TIME PRODUCTION OPERATION (not a migration).
-- Deletes all synthetic seed data. Keeps: exactly two owner accounts (and their
-- profile/config), platform config, real-world court intel, infra journals.
-- player_sports is FULLY wiped (owner decision): keepers re-pick sports at next login.
-- Aborts loudly with FULL ROLLBACK if production does not match the previewed
-- state (exactly 2 keeper matches; exactly 256 profiles).
--
-- THE ONLY EDIT POINT is the two keeper email literals below.
-- Wholesale deletes run with each table's USER triggers disabled (live-operation
-- guards do not apply to teardown); FK/system triggers stay ON, so cascades and
-- referential integrity remain enforced throughout.
-- Storage bytes are NOT deleted by SQL (prohibited): every non-keeper object is
-- ENQUEUED into storage_deletions; the worker-heartbeat drain deletes bytes via
-- the Storage API and records completion only after the API confirms.

begin;
set local klimr.stats_writer = 'on';
set local klimr.privileged_write = 'on';

do $$
declare
  v_keep uuid[];
  v_n    int;
begin
  select array_agg(u.id) into v_keep
    from auth.users u
   where lower(u.email) in ('gduran@klimr.com',
                            'gabrielmaset@hotmail.com');
  if coalesce(array_length(v_keep,1),0) <> 2 then
    raise exception 'ABORT (nothing deleted): keeper emails matched % account(s), expected exactly 2',
      coalesce(array_length(v_keep,1),0);
  end if;

  select count(*) into v_n from public.profiles;
  if v_n <> 256 then
    raise exception 'ABORT (nothing deleted): profiles=% but the preview counted 256 — state changed since preview', v_n;
  end if;

  -- content wipe: 110 tables, FK-topological order (children first)
  alter table public.admin_actions disable trigger user;
  delete from public.admin_actions;
  alter table public.admin_actions enable trigger user;
  alter table public.blocks disable trigger user;
  delete from public.blocks;
  alter table public.blocks enable trigger user;
  alter table public.broadcasts disable trigger user;
  delete from public.broadcasts;
  alter table public.broadcasts enable trigger user;
  alter table public.business_members disable trigger user;
  delete from public.business_members;
  alter table public.business_members enable trigger user;
  alter table public.business_tier_applications disable trigger user;
  delete from public.business_tier_applications;
  alter table public.business_tier_applications enable trigger user;
  alter table public.class_enrollments disable trigger user;
  delete from public.class_enrollments;
  alter table public.class_enrollments enable trigger user;
  alter table public.class_sessions disable trigger user;
  delete from public.class_sessions;
  alter table public.class_sessions enable trigger user;
  alter table public.classes disable trigger user;
  delete from public.classes;
  alter table public.classes enable trigger user;
  alter table public.code_attempt_lockouts disable trigger user;
  delete from public.code_attempt_lockouts;
  alter table public.code_attempt_lockouts enable trigger user;
  alter table public.connection_declines disable trigger user;
  delete from public.connection_declines;
  alter table public.connection_declines enable trigger user;
  alter table public.conversation_events disable trigger user;
  delete from public.conversation_events;
  alter table public.conversation_events enable trigger user;
  alter table public.conversation_keys disable trigger user;
  delete from public.conversation_keys;
  alter table public.conversation_keys enable trigger user;
  alter table public.conversation_reads disable trigger user;
  delete from public.conversation_reads;
  alter table public.conversation_reads enable trigger user;
  alter table public.court_checkins disable trigger user;
  delete from public.court_checkins;
  alter table public.court_checkins enable trigger user;
  alter table public.court_reviews disable trigger user;
  delete from public.court_reviews;
  alter table public.court_reviews enable trigger user;
  alter table public.court_suggestions disable trigger user;
  delete from public.court_suggestions;
  alter table public.court_suggestions enable trigger user;
  alter table public.courtside_devices disable trigger user;
  delete from public.courtside_devices;
  alter table public.courtside_devices enable trigger user;
  alter table public.courtside_enrollments disable trigger user;
  delete from public.courtside_enrollments;
  alter table public.courtside_enrollments enable trigger user;
  alter table public.deleted_users_ledger disable trigger user;
  delete from public.deleted_users_ledger;
  alter table public.deleted_users_ledger enable trigger user;
  alter table public.error_logs disable trigger user;
  delete from public.error_logs;
  alter table public.error_logs enable trigger user;
  alter table public.event_managers disable trigger user;
  delete from public.event_managers;
  alter table public.event_managers enable trigger user;
  alter table public.event_rsvps disable trigger user;
  delete from public.event_rsvps;
  alter table public.event_rsvps enable trigger user;
  alter table public.feed_items disable trigger user;
  delete from public.feed_items;
  alter table public.feed_items enable trigger user;
  alter table public.follows disable trigger user;
  delete from public.follows;
  alter table public.follows enable trigger user;
  alter table public.friendships disable trigger user;
  delete from public.friendships;
  alter table public.friendships enable trigger user;
  alter table public.gate_access_codes disable trigger user;
  delete from public.gate_access_codes;
  alter table public.gate_access_codes enable trigger user;
  alter table public.health_article_reads disable trigger user;
  delete from public.health_article_reads;
  alter table public.health_article_reads enable trigger user;
  alter table public.jobs disable trigger user;
  delete from public.jobs;
  alter table public.jobs enable trigger user;
  alter table public.join_requests disable trigger user;
  delete from public.join_requests;
  alter table public.join_requests enable trigger user;
  alter table public.listing_meetups disable trigger user;
  delete from public.listing_meetups;
  alter table public.listing_meetups enable trigger user;
  alter table public.listing_offers disable trigger user;
  delete from public.listing_offers;
  alter table public.listing_offers enable trigger user;
  alter table public.listing_reports disable trigger user;
  delete from public.listing_reports;
  alter table public.listing_reports enable trigger user;
  alter table public.liveness_transitions disable trigger user;
  delete from public.liveness_transitions;
  alter table public.liveness_transitions enable trigger user;
  alter table public.event_occurrences disable trigger user;
  delete from public.event_occurrences;
  alter table public.event_occurrences enable trigger user;
  alter table public.login_events disable trigger user;
  delete from public.login_events;
  alter table public.login_events enable trigger user;
  alter table public.match_invites disable trigger user;
  delete from public.match_invites;
  alter table public.match_invites enable trigger user;
  alter table public.match_participants disable trigger user;
  delete from public.match_participants;
  alter table public.match_participants enable trigger user;
  alter table public.media_screenings disable trigger user;
  delete from public.media_screenings;
  alter table public.media_screenings enable trigger user;
  alter table public.messages disable trigger user;
  delete from public.messages;
  alter table public.messages enable trigger user;
  alter table public.conversations disable trigger user;
  delete from public.conversations;
  alter table public.conversations enable trigger user;
  alter table public.mfa_failed_verification_attempts disable trigger user;
  delete from public.mfa_failed_verification_attempts;
  alter table public.mfa_failed_verification_attempts enable trigger user;
  alter table public.mutes disable trigger user;
  delete from public.mutes;
  alter table public.mutes enable trigger user;
  alter table public.notifications disable trigger user;
  delete from public.notifications;
  alter table public.notifications enable trigger user;
  alter table public.perf_samples disable trigger user;
  delete from public.perf_samples;
  alter table public.perf_samples enable trigger user;
  alter table public.player_sponsorships disable trigger user;
  delete from public.player_sponsorships;
  alter table public.player_sponsorships enable trigger user;
  alter table public.post_comments disable trigger user;
  delete from public.post_comments;
  alter table public.post_comments enable trigger user;
  alter table public.post_likes disable trigger user;
  delete from public.post_likes;
  alter table public.post_likes enable trigger user;
  alter table public.post_media disable trigger user;
  delete from public.post_media;
  alter table public.post_media enable trigger user;
  alter table public.post_origins disable trigger user;
  delete from public.post_origins;
  alter table public.post_origins enable trigger user;
  alter table public.post_reports disable trigger user;
  delete from public.post_reports;
  alter table public.post_reports enable trigger user;
  alter table public.post_tags disable trigger user;
  delete from public.post_tags;
  alter table public.post_tags enable trigger user;
  alter table public.provider_applications disable trigger user;
  delete from public.provider_applications;
  alter table public.provider_applications enable trigger user;
  alter table public.provider_reviews disable trigger user;
  delete from public.provider_reviews;
  alter table public.provider_reviews enable trigger user;
  alter table public.class_providers disable trigger user;
  delete from public.class_providers;
  alter table public.class_providers enable trigger user;
  alter table public.pymk_cache disable trigger user;
  delete from public.pymk_cache;
  alter table public.pymk_cache enable trigger user;
  alter table public.pymk_dismissals disable trigger user;
  delete from public.pymk_dismissals;
  alter table public.pymk_dismissals enable trigger user;
  alter table public.queue_command_log disable trigger user;
  delete from public.queue_command_log;
  alter table public.queue_command_log enable trigger user;
  alter table public.queue_join_requests disable trigger user;
  delete from public.queue_join_requests;
  alter table public.queue_join_requests enable trigger user;
  alter table public.queue_points disable trigger user;
  delete from public.queue_points;
  alter table public.queue_points enable trigger user;
  alter table public.queue_matches disable trigger user;
  delete from public.queue_matches;
  alter table public.queue_matches enable trigger user;
  alter table public.queue_session_version disable trigger user;
  delete from public.queue_session_version;
  alter table public.queue_session_version enable trigger user;
  alter table public.queue_team_members disable trigger user;
  delete from public.queue_team_members;
  alter table public.queue_team_members enable trigger user;
  alter table public.queue_teams disable trigger user;
  delete from public.queue_teams;
  alter table public.queue_teams enable trigger user;
  alter table public.queue_courts disable trigger user;
  delete from public.queue_courts;
  alter table public.queue_courts enable trigger user;
  alter table public.court_sessions disable trigger user;
  delete from public.court_sessions;
  alter table public.court_sessions enable trigger user;
  alter table public.events disable trigger user;
  delete from public.events;
  alter table public.events enable trigger user;
  alter table public.rank_history disable trigger user;
  delete from public.rank_history;
  alter table public.rank_history enable trigger user;
  alter table public.rank_snapshots disable trigger user;
  delete from public.rank_snapshots;
  alter table public.rank_snapshots enable trigger user;
  alter table public.rate_limit_hits disable trigger user;
  delete from public.rate_limit_hits;
  alter table public.rate_limit_hits enable trigger user;
  alter table public.region_challenges disable trigger user;
  delete from public.region_challenges;
  alter table public.region_challenges enable trigger user;
  alter table public.reports disable trigger user;
  delete from public.reports;
  alter table public.reports enable trigger user;
  alter table public.restrictions disable trigger user;
  delete from public.restrictions;
  alter table public.restrictions enable trigger user;
  alter table public.safety_incidents disable trigger user;
  delete from public.safety_incidents;
  alter table public.safety_incidents enable trigger user;
  alter table public.posts disable trigger user;
  delete from public.posts;
  alter table public.posts enable trigger user;
  alter table public.matches disable trigger user;
  delete from public.matches;
  alter table public.matches enable trigger user;
  alter table public.saved_listings disable trigger user;
  delete from public.saved_listings;
  alter table public.saved_listings enable trigger user;
  alter table public.marketplace_listings disable trigger user;
  delete from public.marketplace_listings;
  alter table public.marketplace_listings enable trigger user;
  alter table public.service_usage disable trigger user;
  delete from public.service_usage;
  alter table public.service_usage enable trigger user;
  alter table public.social_outbox disable trigger user;
  delete from public.social_outbox;
  alter table public.social_outbox enable trigger user;
  alter table public.sponsors disable trigger user;
  delete from public.sponsors;
  alter table public.sponsors enable trigger user;
  alter table public.sponsorship_events disable trigger user;
  delete from public.sponsorship_events;
  alter table public.sponsorship_events enable trigger user;
  alter table public.sponsorships disable trigger user;
  delete from public.sponsorships;
  alter table public.sponsorships enable trigger user;
  alter table public.business_accounts disable trigger user;
  delete from public.business_accounts;
  alter table public.business_accounts enable trigger user;
  alter table public.support_messages disable trigger user;
  delete from public.support_messages;
  alter table public.support_messages enable trigger user;
  alter table public.support_tickets disable trigger user;
  delete from public.support_tickets;
  alter table public.support_tickets enable trigger user;
  alter table public.support_conversations disable trigger user;
  delete from public.support_conversations;
  alter table public.support_conversations enable trigger user;
  alter table public.team_invites disable trigger user;
  delete from public.team_invites;
  alter table public.team_invites enable trigger user;
  alter table public.team_join_requests disable trigger user;
  delete from public.team_join_requests;
  alter table public.team_join_requests enable trigger user;
  alter table public.team_match_result_corrections disable trigger user;
  delete from public.team_match_result_corrections;
  alter table public.team_match_result_corrections enable trigger user;
  alter table public.team_matches disable trigger user;
  delete from public.team_matches;
  alter table public.team_matches enable trigger user;
  alter table public.team_members disable trigger user;
  delete from public.team_members;
  alter table public.team_members enable trigger user;
  alter table public.tournament_custom_fields disable trigger user;
  delete from public.tournament_custom_fields;
  alter table public.tournament_custom_fields enable trigger user;
  alter table public.tournament_draws disable trigger user;
  delete from public.tournament_draws;
  alter table public.tournament_draws enable trigger user;
  alter table public.tournament_group_entries disable trigger user;
  delete from public.tournament_group_entries;
  alter table public.tournament_group_entries enable trigger user;
  alter table public.tournament_managers disable trigger user;
  delete from public.tournament_managers;
  alter table public.tournament_managers enable trigger user;
  alter table public.tournament_matches disable trigger user;
  delete from public.tournament_matches;
  alter table public.tournament_matches enable trigger user;
  alter table public.tournament_groups disable trigger user;
  delete from public.tournament_groups;
  alter table public.tournament_groups enable trigger user;
  alter table public.tournament_payments disable trigger user;
  delete from public.tournament_payments;
  alter table public.tournament_payments enable trigger user;
  alter table public.tournament_plan_items disable trigger user;
  delete from public.tournament_plan_items;
  alter table public.tournament_plan_items enable trigger user;
  alter table public.tournament_points disable trigger user;
  delete from public.tournament_points;
  alter table public.tournament_points enable trigger user;
  alter table public.tournament_registration_players disable trigger user;
  delete from public.tournament_registration_players;
  alter table public.tournament_registration_players enable trigger user;
  alter table public.tournament_substitution_requests disable trigger user;
  delete from public.tournament_substitution_requests;
  alter table public.tournament_substitution_requests enable trigger user;
  alter table public.tournament_registrations disable trigger user;
  delete from public.tournament_registrations;
  alter table public.tournament_registrations enable trigger user;
  alter table public.teams disable trigger user;
  delete from public.teams;
  alter table public.teams enable trigger user;
  alter table public.tournament_waitlist disable trigger user;
  delete from public.tournament_waitlist;
  alter table public.tournament_waitlist enable trigger user;
  alter table public.tournament_divisions disable trigger user;
  delete from public.tournament_divisions;
  alter table public.tournament_divisions enable trigger user;
  alter table public.tournaments disable trigger user;
  delete from public.tournaments;
  alter table public.tournaments enable trigger user;
  alter table public.user_author_affinity disable trigger user;
  delete from public.user_author_affinity;
  alter table public.user_author_affinity enable trigger user;
  alter table public.user_sport_affinity disable trigger user;
  delete from public.user_sport_affinity;
  alter table public.user_sport_affinity enable trigger user;
  alter table public.verification_handoffs disable trigger user;
  delete from public.verification_handoffs;
  alter table public.verification_handoffs enable trigger user;

  -- per-user specials
  alter table public.invite_codes disable trigger user;
  delete from public.invite_codes where owner_id is not null and not (owner_id = any(v_keep));
  alter table public.invite_codes enable trigger user;
  alter table public.player_sports disable trigger user;
  delete from public.player_sports;  -- owner decision 2026-08-18: FULL wipe, keepers re-onboard sports
  alter table public.player_sports enable trigger user;

  -- the accounts: cascade removes profiles + per-user config of the seeds
  delete from auth.users where not (id = any(v_keep));

  -- storage: enqueue every non-keeper object for API deletion
  perform public.enqueue_storage_deletion(o.bucket_id, o.name, 'seed_wipe_2026-08-18')
    from storage.objects o
   where not (o.bucket_id = 'avatars'
              and (o.name like v_keep[1] || '/%' or o.name like v_keep[2] || '/%'))
     and not exists (select 1 from public.storage_deletions d
                      where d.bucket_id = o.bucket_id and d.object_path = o.name);
end $$;
commit;

-- verification report — read every line
select 'profiles' as k, count(*)::text as v from public.profiles
union all select 'auth_users', count(*)::text from auth.users
union all select 'remaining_account: '||u.email, 'attested='||(p.adult_attested_at is not null)::text
  from public.profiles p join auth.users u on u.id = p.id
union all select 'player_sports_rows_remaining', count(*)::text from public.player_sports
union all select 'points_sum_remaining', coalesce(sum(points),0)::text from public.player_sports
union all select 'storage_enqueued_this_wipe', count(*)::text from public.storage_deletions where reason = 'seed_wipe_2026-08-18'
union all select 'points_drift', public.points_drift_count()::text
union all select 'points_ledger_intact', public.points_ledger_intact()::text
union all select 'privileged_audit_intact', public.privileged_audit_intact()::text
union all select 'function_acl_intact', public.function_acl_intact()::text
union all select 'klimr_ready', public.klimr_ready()::text
union all select 'rank_snapshots', count(*)::text from public.rank_snapshots
union all select 'admin_actions', count(*)::text from public.admin_actions
union all select 'rank_history', count(*)::text from public.rank_history
union all select 'user_author_affinity', count(*)::text from public.user_author_affinity
union all select 'user_sport_affinity', count(*)::text from public.user_sport_affinity
union all select 'follows', count(*)::text from public.follows
union all select 'friendships', count(*)::text from public.friendships
union all select 'team_members', count(*)::text from public.team_members
union all select 'event_rsvps', count(*)::text from public.event_rsvps
union all select 'match_participants', count(*)::text from public.match_participants
union all select 'matches', count(*)::text from public.matches
union all select 'teams', count(*)::text from public.teams
union all select 'events', count(*)::text from public.events
union all select 'notifications', count(*)::text from public.notifications
union all select 'posts', count(*)::text from public.posts
union all select 'marketplace_listings', count(*)::text from public.marketplace_listings
union all select 'listing_offers', count(*)::text from public.listing_offers
union all select 'jobs', count(*)::text from public.jobs
union all select 'gate_access_codes', count(*)::text from public.gate_access_codes
union all select 'deleted_users_ledger', count(*)::text from public.deleted_users_ledger
union all select 'error_logs', count(*)::text from public.error_logs
union all select 'broadcasts', count(*)::text from public.broadcasts
union all select 'sponsors', count(*)::text from public.sponsors
union all select 'feed_items', count(*)::text from public.feed_items
union all select 'conversations', count(*)::text from public.conversations;
