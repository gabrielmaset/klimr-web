// Klimr database types (Phase 1) — matches supabase/migrations/0001_init.sql.
// Once your Supabase project is live, regenerate with:
//   npx supabase gen types typescript --project-id <your-id> > lib/database.types.ts

export type VerificationStatus = "unverified" | "pending" | "verified";
export type MatchStatus = "open" | "scheduled" | "completed" | "disputed" | "void";
export type ResultStatus = "pending" | "confirmed" | "void";
export type JoinStatus = "pending" | "accepted" | "declined" | "waitlisted" | "offered" | "joined" | "expired";
export type ReportReason =
  | "harassment"
  | "cheating"
  | "no_show"
  | "inappropriate"
  | "fake_profile"
  | "other";
export type ModerationStatus = "pending" | "approved" | "rejected" | "flagged";

export type TournamentStatus =
  | "draft"
  | "published"
  | "registration_open"
  | "registration_closed"
  | "in_progress"
  | "completed"
  | "archived"
  | "cancelled";
export type TournamentEntryType = "individual" | "team";
export type TournamentVisibility = "public" | "unlisted";
export type RegistrationStatus = "pending" | "confirmed" | "waitlisted" | "withdrawn" | "declined";
export type PaymentStatus = "unpaid" | "proof_submitted" | "confirmed" | "denied";
export type PaymentSubmissionStatus = "submitted" | "confirmed" | "denied";
export type CustomFieldType = "short_text" | "long_text" | "single_select" | "multi_select" | "number" | "date";
export type FeeBasis = "per_team" | "per_player";
export type FieldScope = "per_team" | "per_player";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      court_sessions: {
        Row: { id: string; code: string; event_id: string | null; organizer_id: string; title: string; sport_key: string; status: string; win_cap: number; center_lat: number | null; center_lng: number | null; radius_m: number; allow_guests: boolean; require_location: boolean; event_only: boolean; require_approval: boolean; allow_full_teams: boolean; paused: boolean;
          paused_by: string | null;
          tournament_id: string | null;
          team_name_mode: string;
          activated_at: string;
          display_code: string | null; court_id: string | null; created_at: string; ended_at: string | null };
        Insert: {
          court_id?: string | null; id?: string; code: string; event_id?: string | null; organizer_id: string; title?: string; sport_key: string; status?: string; win_cap?: number; center_lat?: number | null; center_lng?: number | null; radius_m?: number; allow_guests?: boolean; require_location?: boolean; event_only?: boolean; require_approval?: boolean; allow_full_teams?: boolean; paused?: boolean;
          paused_by?: string | null;
          tournament_id?: string | null;
          team_name_mode?: string;
          activated_at?: string;
          display_code?: string | null; created_at?: string; ended_at?: string | null };
        Update: {
          court_id?: string | null; id?: string; code?: string; event_id?: string | null; organizer_id?: string; title?: string; sport_key?: string; status?: string; win_cap?: number; center_lat?: number | null; center_lng?: number | null; radius_m?: number; allow_guests?: boolean; require_location?: boolean; event_only?: boolean; require_approval?: boolean; allow_full_teams?: boolean; paused?: boolean;
          paused_by?: string | null;
          tournament_id?: string | null;
          team_name_mode?: string;
          activated_at?: string;
          display_code?: string | null; created_at?: string; ended_at?: string | null };
        Relationships: [];
      };
      queue_courts: {
        Row: { id: string; session_id: string; label: string; team_size: number; levels: string[]; sort: number; created_at: string; closed_at: string | null };
        Insert: { id?: string; session_id: string; label?: string; team_size?: number; levels?: string[]; sort?: number; created_at?: string; closed_at?: string | null };
        Update: { id?: string; session_id?: string; label?: string; team_size?: number; levels?: string[]; sort?: number; created_at?: string; closed_at?: string | null };
        Relationships: [];
      };
      queue_teams: {
        Row: { id: string; session_id: string; court_id: string; status: string; wins: number; hold_court: boolean; queued_at: string | null; created_at: string };
        Insert: { id?: string; session_id: string; court_id: string; status?: string; wins?: number; hold_court?: boolean; queued_at?: string | null; created_at?: string };
        Update: { id?: string; session_id?: string; court_id?: string; status?: string; wins?: number; hold_court?: boolean; queued_at?: string | null; created_at?: string };
        Relationships: [];
      };
      queue_team_members: {
        Row: { id: string; team_id: string; user_id: string | null; guest_name: string | null; session_id: string | null; joined_at: string };
        Insert: { id?: string; team_id: string; user_id?: string | null; guest_name?: string | null; session_id?: string | null; joined_at?: string };
        Update: { id?: string; team_id?: string; user_id?: string | null; guest_name?: string | null; session_id?: string | null; joined_at?: string };
        Relationships: [];
      };
      queue_matches: {
        Row: { id: string; session_id: string; court_id: string; team_a: string; team_b: string; status: string; winner_team: string | null; started_at: string; ended_at: string | null };
        Insert: { id?: string; session_id: string; court_id: string; team_a: string; team_b: string; status?: string; winner_team?: string | null; started_at?: string; ended_at?: string | null };
        Update: { id?: string; session_id?: string; court_id?: string; team_a?: string; team_b?: string; status?: string; winner_team?: string | null; started_at?: string; ended_at?: string | null };
        Relationships: [];
      };
      queue_join_requests: {
        Row: { id: string; session_id: string; court_id: string; user_id: string | null; guest_name: string | null; status: string; created_at: string; decided_at: string | null };
        Insert: { id?: string; session_id: string; court_id: string; user_id?: string | null; guest_name?: string | null; status?: string; created_at?: string; decided_at?: string | null };
        Update: { id?: string; session_id?: string; court_id?: string; user_id?: string | null; guest_name?: string | null; status?: string; created_at?: string; decided_at?: string | null };
        Relationships: [];
      };
      queue_points: {
        Row: { id: string; user_id: string; sport_key: string; session_id: string | null; match_id: string | null; points: number; won: boolean; earned_at: string; created_at: string };
        Insert: { id?: string; user_id: string; sport_key: string; session_id?: string | null; match_id?: string | null; points?: number; won?: boolean; earned_at?: string; created_at?: string };
        Update: { id?: string; user_id?: string; sport_key?: string; session_id?: string | null; match_id?: string | null; points?: number; won?: boolean; earned_at?: string; created_at?: string };
        Relationships: [];
      };
      deleted_users_ledger: {
        Row: {
          id: string;
          user_id: string;
          member_no: number | null;
          display_name: string | null;
          email: string | null;
          account_created_at: string | null;
          archived_at: string | null;
          purged_at: string;
          purged_by: string | null;
          reason: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          member_no?: number | null;
          display_name?: string | null;
          email?: string | null;
          account_created_at?: string | null;
          archived_at?: string | null;
          purged_at?: string;
          purged_by?: string | null;
          reason?: string;
        };
        Update: { reason?: string };
        Relationships: [];
      };
      error_logs: {
        Row: {
          id: string;
          user_id: string | null;
          level: string;
          message: string;
          detail: string | null;
          url: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          level?: string;
          message: string;
          detail?: string | null;
          url?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: { detail?: string | null };
        Relationships: [];
      };
      match_invites: {
        Row: { id: string; match_id: string; invited_user_id: string; invited_by: string; status: string; created_at: string };
        Insert: { id?: string; match_id: string; invited_user_id: string; invited_by: string; status?: string; created_at?: string };
        Update: { id?: string; match_id?: string; invited_user_id?: string; invited_by?: string; status?: string; created_at?: string };
        Relationships: [];
      };
      friendships: {
        Row: { id: string; requester_id: string; addressee_id: string; status: string; created_at: string; responded_at: string | null };
        Insert: { id?: string; requester_id: string; addressee_id: string; status?: string; created_at?: string; responded_at?: string | null };
        Update: { id?: string; requester_id?: string; addressee_id?: string; status?: string; created_at?: string; responded_at?: string | null };
        Relationships: [];
      };
      follows: {
        Row: { follower_id: string; followee_id: string; created_at: string };
        Insert: { follower_id: string; followee_id: string; created_at?: string };
        Update: { follower_id?: string; followee_id?: string; created_at?: string };
        Relationships: [];
      };
      sport_formats: {
        Row: { sport_key: string; format_key: string; label: string; short_label: string; players_per_side: number; sides: number; total_players: number; is_default: boolean; is_casual: boolean; sort: number };
        Insert: { sport_key: string; format_key: string; label: string; short_label: string; players_per_side: number; sides?: number; total_players: number; is_default?: boolean; is_casual?: boolean; sort?: number };
        Update: { sport_key?: string; format_key?: string; label?: string; short_label?: string; players_per_side?: number; sides?: number; total_players?: number; is_default?: boolean; is_casual?: boolean; sort?: number };
        Relationships: [];
      };
      sports: {
        Row: { key: string; name: string; skill_system: string };
        Insert: { key: string; name: string; skill_system: string };
        Update: { key?: string; name?: string; skill_system?: string };
        Relationships: [];
      };
      zip_regions: {
        Row: { zip: string; neighborhood: string; city: string; state: string; country: string };
        Insert: { zip: string; neighborhood: string; city: string; state: string; country?: string };
        Update: { zip?: string; neighborhood?: string; city?: string; state?: string; country?: string };
        Relationships: [];
      };
      rank_history: {
        Row: { user_id: string; sport_key: string; week: string; points: number; rank: number | null; };
        Insert: { user_id: string; sport_key: string; week: string; points: number; rank?: number | null; };
        Update: { points?: number; rank?: number | null; };
        Relationships: [];
      };
      verification_handoffs: {
        Row: { token: string; user_id: string; created_at: string; expires_at: string; consumed_at: string | null; };
        Insert: { token?: string; user_id: string; created_at?: string; expires_at?: string; consumed_at?: string | null; };
        Update: { token?: string; user_id?: string; created_at?: string; expires_at?: string; consumed_at?: string | null; };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          member_no: number | null;
          display_name: string;
          first_name: string | null;
          last_name: string | null;
          home_zip: string | null;
          neighborhood: string | null;
          city: string | null;
          state: string | null;
          country: string;
          primary_sport: string | null;
          verification_status: VerificationStatus;
          open_to_invites: boolean;
          location_precision: string;
          reliability: number;
          avatar_hue: number;
          avatar_path: string | null;
          is_active: boolean | null;
          cover_path: string | null;
          bio: string | null;
          gender: string | null;
          birth_year: number | null;
          date_of_birth: string | null;
          availability: { day: string; start: string; end: string }[];
          preferred_format: string;
          play_style: string;
          handedness: string | null;
          account_status: string;
          archived_at: string | null;
          suspended_until: string | null;
          signup_code: string | null;
          gear: Json;
          usual_times: string | null;
          profile_gallery: Json;
          show_courts: boolean;
          show_teams: boolean;
          show_tournaments: boolean;
          created_at: string;
          last_seen_at: string | null;
          presence_mode: string;
          connections_count: number;
          followers_count: number;
          following_count: number;
         timezone: string | null;  onboarding_draft: Json | null; phone_country: string; phone: string | null };
        Insert: {
          member_no?: number | null;
          id: string;
          display_name?: string;
          first_name?: string | null;
          last_name?: string | null;
          home_zip?: string | null;
          neighborhood?: string | null;
          city?: string | null;
          state?: string | null;
          country?: string;
          primary_sport?: string | null;
          verification_status?: VerificationStatus;
          open_to_invites?: boolean;
          location_precision?: string;
          reliability?: number;
          avatar_hue?: number;
          avatar_path?: string | null;
          cover_path?: string | null;
          bio?: string | null;
          gender?: string | null;
          birth_year?: number | null;
          date_of_birth?: string | null;
          availability?: { day: string; start: string; end: string }[];
          preferred_format?: string;
          play_style?: string;
          handedness?: string | null;
          account_status?: string;
          archived_at?: string | null;
          suspended_until?: string | null;
          created_at?: string;
          last_seen_at?: string | null;
          presence_mode?: string;
          connections_count?: number;
          followers_count?: number;
          following_count?: number;
         timezone?: string | null;  onboarding_draft?: Json | null; phone_country?: string; phone?: string | null };
        Update: {
          display_name?: string;
          first_name?: string | null;
          last_name?: string | null;
          home_zip?: string | null;
          neighborhood?: string | null;
          city?: string | null;
          state?: string | null;
          country?: string;
          primary_sport?: string | null;
          verification_status?: VerificationStatus;
          open_to_invites?: boolean;
          location_precision?: string;
          reliability?: number;
          avatar_hue?: number;
          avatar_path?: string | null;
          cover_path?: string | null;
          bio?: string | null;
          gender?: string | null;
          birth_year?: number | null;
          date_of_birth?: string | null;
          availability?: { day: string; start: string; end: string }[];
          preferred_format?: string;
          play_style?: string;
          handedness?: string | null;
          account_status?: string;
          archived_at?: string | null;
          suspended_until?: string | null;
          last_seen_at?: string | null;
          presence_mode?: string;
          connections_count?: number;
          followers_count?: number;
          following_count?: number;
         gear?: Json; usual_times?: string | null; profile_gallery?: Json; show_courts?: boolean; show_teams?: boolean; show_tournaments?: boolean;  timezone?: string | null;  onboarding_draft?: Json | null; phone_country?: string; phone?: string | null };
        Relationships: [];
      };
      gate_access_codes: {
        Row: { code: string; email: string; expires_at: string; used_at: string | null; created_at: string };
        Insert: { code: string; email: string; expires_at: string; used_at?: string | null; created_at?: string };
        Update: { code?: string; email?: string; expires_at?: string; used_at?: string | null; created_at?: string; };
        Relationships: [];
      };
      invite_codes: {
        Row: {
          code: string;
          max_uses: number;
          uses: number;
          note: string | null;
          owner_id: string | null;
          active: boolean;
          sent_to_email: string | null;
          created_at: string;
          last_used_at: string | null;
        };
        Insert: {
          code: string;
          max_uses?: number;
          uses?: number;
          note?: string | null;
          owner_id?: string | null;
          active?: boolean;
          sent_to_email?: string | null;
        };
        Update: {
          max_uses?: number;
          uses?: number;
          note?: string | null;
          owner_id?: string | null;
          active?: boolean;
          sent_to_email?: string | null;
          last_used_at?: string | null;
        };
        Relationships: [];
      };
      investor_codes: {
        Row: {
          code: string;
          label: string | null;
          active: boolean;
          expires_at: string | null;
          sent_to_email: string | null;
          created_at: string;
          last_used_at: string | null;
        };
        Insert: {
          code: string;
          label?: string | null;
          active?: boolean;
          expires_at?: string | null;
          sent_to_email?: string | null;
        };
        Update: {
          label?: string | null;
          active?: boolean;
          expires_at?: string | null;
          sent_to_email?: string | null;
          last_used_at?: string | null;
        };
        Relationships: [];
      };
      player_sports: {
        Row: {
          user_id: string;
          sport_key: string;
          points: number;
          skill_rating: number | null;
          matches_played: number;
          wins: number;
          skill_level: string;
          preferred_format: string;
          handedness: string | null;
          active: boolean;
          updated_at: string;
         last_result_at: string | null; };
        Insert: {
          user_id: string;
          sport_key: string;
          points?: number;
          skill_rating?: number | null;
          matches_played?: number;
          wins?: number;
          skill_level?: string;
          preferred_format?: string;
          handedness?: string | null;
          active?: boolean;
          updated_at?: string;
         last_result_at?: string | null; };
        Update: {
          points?: number;
          skill_rating?: number | null;
          matches_played?: number;
          wins?: number;
          skill_level?: string;
          preferred_format?: string;
          handedness?: string | null;
          active?: boolean;
          updated_at?: string;
         last_result_at?: string | null; };
        Relationships: [];
      };
      matches: {
        Row: {
          id: string;
          sport_key: string;
          format: string;
          organizer_id: string;
          scheduled_at: string | null;
          location_text: string | null;
          court_id: string | null;
          total_slots: number;
          status: MatchStatus;
          recurring: boolean;
          recurrence: string | null;
          result: Json | null;
          result_status: ResultStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          sport_key: string;
          format: string;
          organizer_id: string;
          scheduled_at?: string | null;
          location_text?: string | null;
          court_id?: string | null;
          total_slots?: number;
          status?: MatchStatus;
          recurring?: boolean;
          recurrence?: string | null;
          result?: Json | null;
          result_status?: ResultStatus;
          created_at?: string;
        };
        Update: {
          sport_key?: string;
          format?: string;
          scheduled_at?: string | null;
          location_text?: string | null;
          court_id?: string | null;
          total_slots?: number;
          status?: MatchStatus;
          recurring?: boolean;
          recurrence?: string | null;
          result?: Json | null;
          result_status?: ResultStatus;
        };
        Relationships: [];
      };
      match_participants: {
        Row: {
          match_id: string;
          user_id: string;
          side: number | null;
          slot: number | null;
          is_organizer: boolean;
          confirmed: boolean;
          joined_at: string;
        };
        Insert: {
          match_id: string;
          user_id: string;
          side?: number | null;
          slot?: number | null;
          is_organizer?: boolean;
          confirmed?: boolean;
          joined_at?: string;
        };
        Update: { side?: number | null; slot?: number | null; is_organizer?: boolean; confirmed?: boolean };
        Relationships: [];
      };
      join_requests: {
        Row: {
          id: string;
          match_id: string;
          requester_id: string;
          status: JoinStatus;
          waitlist_position: number | null;
          offered_at: string | null;
          offer_expires_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          match_id: string;
          requester_id: string;
          status?: JoinStatus;
          offered_at?: string | null;
          offer_expires_at?: string | null;
          waitlist_position?: number | null;
          created_at?: string;
        };
        Update: { status?: JoinStatus;
          offered_at?: string | null;
          offer_expires_at?: string | null;
          created_at?: string; waitlist_position?: number | null };
        Relationships: [];
      };
      sponsorships: {
        Row: { id: string; business_id: string; target_kind: string; target_id: string; label: string; description: string | null; amount_cents: number | null; currency: string; starts_on: string; ends_on: string | null; status: string; created_by: string; created_at: string; responded_at: string | null };
        Insert: { id?: string; business_id: string; target_kind: string; target_id: string; label?: string; description?: string | null; amount_cents?: number | null; currency?: string; starts_on?: string; ends_on?: string | null; status?: string; created_by: string };
        Update: { label?: string; description?: string | null; amount_cents?: number | null; starts_on?: string; ends_on?: string | null };
        Relationships: [];
      };
      sponsorship_categories: {
        Row: { key: string; label: string; tier: string; updated_at: string };
        Insert: { key: string; label: string; tier: string };
        Update: { label?: string; tier?: string };
        Relationships: [];
      };
      sponsorship_events: {
        Row: { id: string; sponsorship_id: string; prev: string | null; next: string; actor: string | null; reason: string | null; created_at: string };
        Insert: { id?: string; sponsorship_id: string; prev?: string | null; next: string; actor?: string | null; reason?: string | null };
        Update: { reason?: string | null };
        Relationships: [];
      };
      business_tier_applications: {
        Row: { id: string; business_id: string; submitted_by: string; status: string; domain: string; notes: string | null; docs: Json; terms_accepted_at: string; decided_by: string | null; decided_at: string | null; decision_note: string | null; created_at: string };
        Insert: { id?: string; business_id: string; submitted_by: string; status?: string; domain: string; notes?: string | null; docs?: Json; terms_accepted_at: string };
        Update: { status?: string; decided_by?: string | null; decided_at?: string | null; decision_note?: string | null };
        Relationships: [];
      };
      business_accounts: {
        Row: { id: string; kind: string; name: string; slug: string; owner_id: string; headline: string | null; bio: string | null; website: string | null; contact_email: string | null; phone: string | null; area_text: string | null; sports: string[]; roles: string[]; logo_path: string | null; category: string | null; verification_level: string; status: string; published: boolean; created_at: string; updated_at: string };
        Insert: { id?: string; kind: string; name: string; slug: string; owner_id: string; headline?: string | null; bio?: string | null; website?: string | null; contact_email?: string | null; phone?: string | null; area_text?: string | null; sports?: string[]; roles?: string[]; logo_path?: string | null; category?: string | null; verification_level?: string; status?: string; published?: boolean };
        Update: { name?: string; slug?: string; headline?: string | null; bio?: string | null; website?: string | null; contact_email?: string | null; phone?: string | null; area_text?: string | null; sports?: string[]; roles?: string[]; logo_path?: string | null; category?: string | null; verification_level?: string; status?: string; published?: boolean };
        Relationships: [];
      };
      business_members: {
        Row: { business_id: string; user_id: string; role: string; added_by: string | null; created_at: string };
        Insert: { business_id: string; user_id: string; role: string; added_by?: string | null; created_at?: string };
        Update: { role?: string };
        Relationships: [];
      };
      blocks: {
        Row: { blocker_id: string; blocked_id: string; created_at: string };
        Insert: { blocker_id: string; blocked_id: string; created_at?: string };
        Update: { created_at?: string };
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          reporter_id: string;
          reported_id: string;
          reason: ReportReason;
          context: string | null;
          status: string;
          reviewed_by: string | null;
          reviewed_at: string | null;
          resolution: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          reporter_id: string;
          reported_id: string;
          reason: ReportReason;
          context?: string | null;
          status?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          resolution?: string | null;
          created_at?: string;
        };
        Update: {
          reason?: ReportReason;
          context?: string | null;
          status?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          resolution?: string | null;
        };
        Relationships: [];
      };
      mfa_failed_verification_attempts: {
        Row: { user_id: string; factor_id: string; failed_count: number; last_failed_at: string; locked_until: string | null };
        Insert: { user_id: string; factor_id: string; failed_count?: number; last_failed_at?: string; locked_until?: string | null };
        Update: { failed_count?: number; last_failed_at?: string; locked_until?: string | null };
        Relationships: [];
      };
      court_evidence: {
        Row: { id: string; place_id: string; sport: string; source_url: string | null; source_label: string | null; excerpt: string | null; supports_verdict: string | null; confidence: number | null; extractor_model: string | null; fetched_at: string; created_at: string };
        Insert: { id?: string; place_id: string; sport: string; source_url?: string | null; source_label?: string | null; excerpt?: string | null; supports_verdict?: string | null; confidence?: number | null; extractor_model?: string | null; fetched_at?: string; created_at?: string };
        Update: { excerpt?: string | null; supports_verdict?: string | null; confidence?: number | null };
        Relationships: [];
      };
      post_origins: {
        Row: { post_id: string; lat: number; lng: number };
        Insert: { post_id: string; lat: number; lng: number };
        Update: { lat?: number; lng?: number };
        Relationships: [];
      };
      perf_samples: {
        Row: { id: number; metric: string; value_ms: number; route: string | null; is_mobile: boolean | null; created_at: string };
        Insert: { id?: number; metric: string; value_ms: number; route?: string | null; is_mobile?: boolean | null; created_at?: string };
        Update: { value_ms?: number; route?: string | null };
        Relationships: [];
      };
      courtside_devices: {
        Row: { install_id: string; label: string | null; venue_name: string | null; session_id: string | null; app_version: string | null; platform: string | null; network_state: string | null; battery_pct: number | null; last_ip_hash: string | null; first_seen_at: string; last_seen_at: string; retired_at: string | null; notes: string | null; token_hash: string | null; registered_at: string | null; revoked_at: string | null; beat_count: number };
        Insert: { install_id: string; label?: string | null; venue_name?: string | null; session_id?: string | null; app_version?: string | null; platform?: string | null; network_state?: string | null; battery_pct?: number | null; last_ip_hash?: string | null; first_seen_at?: string; last_seen_at?: string; retired_at?: string | null; notes?: string | null };
        Update: { label?: string | null; venue_name?: string | null; notes?: string | null; retired_at?: string | null };
        Relationships: [];
      };
      jobs: {
        Row: { id: string; kind: string; payload: Json; dedupe_key: string | null; status: string; attempts: number; max_attempts: number; run_after: string; leased_until: string | null; lease_owner: string | null; last_error: string | null; correlation_id: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; kind: string; payload?: Json; dedupe_key?: string | null; status?: string; attempts?: number; max_attempts?: number; run_after?: string; leased_until?: string | null; lease_owner?: string | null; last_error?: string | null; correlation_id?: string | null; created_at?: string; updated_at?: string };
        Update: { status?: string; attempts?: number; run_after?: string; leased_until?: string | null; lease_owner?: string | null; last_error?: string | null };
        Relationships: [];
      };
      queue_session_version: {
        Row: { session_id: string; version: number; updated_at: string };
        Insert: { session_id: string; version?: number; updated_at?: string };
        Update: { version?: number; updated_at?: string };
        Relationships: [];
      };
      queue_command_log: {
        Row: { idempotency_key: string; session_id: string; court_id: string | null; command: string; result_team_id: string | null; actor_user_id: string | null; created_at: string };
        Insert: { idempotency_key: string; session_id: string; court_id?: string | null; command: string; result_team_id?: string | null; actor_user_id?: string | null; created_at?: string };
        Update: { command?: string; result_team_id?: string | null };
        Relationships: [];
      };
      rank_snapshots: {
        Row: { snap_date: string; user_id: string; sport_key: string; points: number; rank: number };
        Insert: { snap_date: string; user_id: string; sport_key: string; points: number; rank: number };
        Update: { points?: number; rank?: number };
        Relationships: [];
      };
      post_tags: {
        Row: { id: string; post_id: string; user_id: string; tagged_by: string; status: string; created_at: string; responded_at: string | null };
        Insert: { id?: string; post_id: string; user_id: string; tagged_by: string; status?: string; created_at?: string; responded_at?: string | null };
        Update: { status?: string };
        Relationships: [];
      };
      post_reports: {
        Row: { id: string; post_id: string | null; reporter_id: string; author_id: string | null; reason: string; detail: string | null; body_snapshot: string | null; media_snapshot: string | null; status: string; created_at: string; reviewed_by: string | null; reviewed_at: string | null; resolution: string | null };
        Insert: { post_id?: string | null; reporter_id: string; author_id?: string | null; reason: string; detail?: string | null; body_snapshot?: string | null; media_snapshot?: string | null; status?: string };
        Update: { status?: string; reviewed_by?: string | null; reviewed_at?: string | null; resolution?: string | null };
        Relationships: [];
      };
      posts: {
        Row: {
          id: string;
          author_id: string;
          body: string | null;
          sport_key: string | null;
          match_id: string | null;
          moderation_status: ModerationStatus;
          moderation_labels: string[] | null;
          author_type: string;
          repost_of: string | null;
          post_type: string;
          media_path: string | null;
          media_duration_seconds: number | null;
          milestone: Json | null;
          match_summary: Json | null;
          audience: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          body?: string | null;
          sport_key?: string | null;
          match_id?: string | null;
          moderation_status?: ModerationStatus;
          moderation_labels?: string[] | null;
          author_type?: string;
          repost_of?: string | null;
          post_type?: string;
          media_path?: string | null;
          media_duration_seconds?: number | null;
          milestone?: Json | null;
          match_summary?: Json | null;
          audience?: string;
          created_at?: string;
        };
        Update: {
          post_type?: string;
          media_path?: string | null;
          media_duration_seconds?: number | null;
          milestone?: Json | null;
          match_summary?: Json | null;
          audience?: string;
          body?: string | null;
          sport_key?: string | null;
          match_id?: string | null;
          moderation_status?: ModerationStatus;
          moderation_labels?: string[] | null;
        };
        Relationships: [];
      };
      post_media: {
        Row: {
          id: string;
          post_id: string;
          storage_path: string;
          media_type: string;
          width: number | null;
          height: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          post_id: string;
          storage_path: string;
          media_type?: string;
          width?: number | null;
          height?: number | null;
          created_at?: string;
        };
        Update: { storage_path?: string; media_type?: string; width?: number | null; height?: number | null };
        Relationships: [];
      };
      post_likes: {
        Row: { post_id: string; user_id: string; created_at: string };
        Insert: { post_id: string; user_id: string; created_at?: string };
        Update: { created_at?: string };
        Relationships: [];
      };
      post_comments: {
        Row: {
          id: string;
          post_id: string;
          author_id: string;
          body: string;
          moderation_status: ModerationStatus;
          parent_comment_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          post_id: string;
          author_id: string;
          body: string;
          moderation_status?: ModerationStatus;
          parent_comment_id?: string | null;
          created_at?: string;
        };
        Update: { body?: string; moderation_status?: ModerationStatus };
        Relationships: [];
      };
      safety_incidents: {
        Row: {
          id: string;
          kind: string;
          status: string;
          uploader_id: string | null;
          post_id: string | null;
          storage_path: string | null;
          sha256: string | null;
          perceptual_hash: string | null;
          provider: string | null;
          match_ref: string | null;
          ai_labels: string[] | null;
          detected_at: string;
          reported_at: string | null;
          preserved_until: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          kind: string;
          status?: string;
          uploader_id?: string | null;
          post_id?: string | null;
          storage_path?: string | null;
          sha256?: string | null;
          perceptual_hash?: string | null;
          provider?: string | null;
          match_ref?: string | null;
          ai_labels?: string[] | null;
          detected_at?: string;
          reported_at?: string | null;
          preserved_until?: string | null;
          notes?: string | null;
        };
        Update: {
          status?: string;
          reported_at?: string | null;
          preserved_until?: string | null;
          notes?: string | null;
        };
        Relationships: [];
      };
      pymk_dismissals: {
        Row: { user_id: string; dismissed_id: string; dismissed_at: string; expires_at: string };
        Insert: { user_id: string; dismissed_id: string; dismissed_at?: string; expires_at?: string };
        Update: { expires_at?: string };
        Relationships: [];
      };
      pymk_cache: {
        Row: { user_id: string; payload: Json; computed_at: string };
        Insert: { user_id: string; payload: Json; computed_at?: string };
        Update: { payload?: Json; computed_at?: string };
        Relationships: [];
      };
      connection_declines: {
        Row: { pair_lo: string; pair_hi: string; declined_by: string; declined_at: string };
        Insert: { pair_lo: string; pair_hi: string; declined_by: string; declined_at?: string };
        Update: { declined_by?: string; declined_at?: string };
        Relationships: [];
      };
      support_tickets: {
        Row: {
          id: string;
          user_id: string;
          source: string;
          category: string;
          severity: string;
          status: string;
          subject: string;
          body: string | null;
          ai_summary: string | null;
          conversation_id: string | null;
          admin_note: string | null;
          external_ref: string | null;
          created_at: string;
          updated_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          source?: string;
          category?: string;
          severity?: string;
          status?: string;
          subject: string;
          body?: string | null;
          ai_summary?: string | null;
          conversation_id?: string | null;
          admin_note?: string | null;
          external_ref?: string | null;
          created_at?: string;
          updated_at?: string;
          resolved_at?: string | null;
        };
        Update: {
          severity?: string;
          status?: string;
          admin_note?: string | null;
          external_ref?: string | null;
          updated_at?: string;
          resolved_at?: string | null;
        };
        Relationships: [];
      };
      support_conversations: {
        Row: { id: string; user_id: string; escalated: boolean; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; escalated?: boolean; created_at?: string; updated_at?: string };
        Update: { escalated?: boolean; updated_at?: string };
        Relationships: [];
      };
      support_messages: {
        Row: { id: number; conversation_id: string; role: string; content: string; created_at: string };
        Insert: { conversation_id: string; role: string; content: string; created_at?: string };
        Update: { content?: string };
        Relationships: [];
      };
      admin_users: {
        Row: { user_id: string; role: string; note: string | null; created_at: string };
        Insert: { user_id: string; role: string; note?: string | null; created_at?: string };
        Update: { role?: string; note?: string | null };
        Relationships: [];
      };
      admin_actions: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          target_user_id: string | null;
          target_ref: string | null;
          detail: string | null;
          meta: Json | null;
          command_id: string | null;
          outcome: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          action: string;
          target_user_id?: string | null;
          target_ref?: string | null;
          detail?: string | null;
          meta?: Json | null;
          command_id?: string | null;
          outcome?: string | null;
          created_at?: string;
        };
        Update: { detail?: string | null; outcome?: string | null };
        Relationships: [];
      };
      user_preferences: {
        Row: {
          user_id: string;
          notif_match_invites: boolean;
          notif_ranking_changes: boolean;
          notif_region_challenges: boolean;
          notif_marketplace_events: boolean;
          email_digest: string;
          profile_visibility: string;
          location_precision: string;
          who_can_invite: string;
          updated_at: string; notif_team_invites: boolean; notif_team_roster: boolean; notif_team_activity: boolean };
        Insert: {
          user_id: string;
          notif_match_invites?: boolean;
          notif_ranking_changes?: boolean;
          notif_region_challenges?: boolean;
          notif_marketplace_events?: boolean;
          email_digest?: string;
          profile_visibility?: string;
          location_precision?: string;
          who_can_invite?: string;
          updated_at?: string; notif_team_invites?: boolean; notif_team_roster?: boolean; notif_team_activity?: boolean };
        Update: {
          notif_match_invites?: boolean;
          notif_ranking_changes?: boolean;
          notif_region_challenges?: boolean;
          notif_marketplace_events?: boolean;
          email_digest?: string;
          profile_visibility?: string;
          location_precision?: string;
          who_can_invite?: string;
          updated_at?: string; notif_team_invites?: boolean; notif_team_roster?: boolean; notif_team_activity?: boolean };
        Relationships: [];
      };
      feed_items: {
        Row: {
          id: string;
          kind: string;
          title: string | null;
          body: string;
          sport_key: string | null;
          link_url: string | null;
          link_label: string | null;
          created_by: string | null;
          published_at: string;
          created_at: string;
          actor_id: string | null;
          zip: string | null;
          lat: number | null;
          lng: number | null;
          object_kind: string | null;
          object_id: string | null;
          meta: Json;
          dedupe_key: string | null;
          audience: string;
        };
        Insert: {
          id?: string;
          kind?: string;
          title?: string | null;
          body: string;
          sport_key?: string | null;
          link_url?: string | null;
          link_label?: string | null;
          created_by?: string | null;
          published_at?: string;
          created_at?: string; actor_id?: string | null; zip?: string | null; object_kind?: string | null; object_id?: string | null; meta?: Json; dedupe_key?: string | null; audience?: string; };
        Update: {
          kind?: string;
          title?: string | null;
          body?: string;
          sport_key?: string | null;
          link_url?: string | null;
          link_label?: string | null;
          published_at?: string;
        };
        Relationships: [];
      };
      user_keys: {
        Row: { user_id: string; device_id: string; public_key: string; created_at: string; updated_at: string };
        Insert: { user_id: string; device_id: string; public_key: string; created_at?: string; updated_at?: string };
        Update: { public_key?: string; updated_at?: string };
        Relationships: [];
      };
      conversation_reads: {
        Row: { user_id: string; conversation_id: string; last_read_at: string };
        Insert: { user_id: string; conversation_id: string; last_read_at?: string };
        Update: { last_read_at?: string };
        Relationships: [];
      };
      health_article_reads: {
        Row: { slug: string; reads: number; updated_at: string };
        Insert: { slug: string; reads?: number; updated_at?: string };
        Update: { reads?: number; updated_at?: string };
        Relationships: [];
      };
      conversations: {
        Row: { id: string; match_id: string | null; team_id: string | null; listing_id: string | null; kind: string; created_by: string | null; peer_id: string | null; created_at: string; expires_at: string | null };
        Insert: { id?: string; match_id?: string | null; team_id?: string | null; listing_id?: string | null; kind?: string; created_by?: string | null; peer_id?: string | null; created_at?: string; expires_at?: string | null };
        Update: { expires_at?: string | null; kind?: string };
        Relationships: [];
      };
      conversation_events: {
        Row: { id: string; conversation_id: string; kind: string; actor_id: string | null; target_id: string | null; body: string | null; created_at: string };
        Insert: { id?: string; conversation_id: string; kind: string; actor_id?: string | null; target_id?: string | null; body?: string | null; created_at?: string };
        Update: { body?: string | null };
        Relationships: [];
      };
      conversation_keys: {
        Row: {
          conversation_id: string;
          recipient_id: string;
          recipient_device: string;
          wrapped_key: string;
          iv: string;
          wrapped_by: string;
          wrapped_by_device: string;
          created_at: string;
        };
        Insert: {
          conversation_id: string;
          recipient_id: string;
          recipient_device: string;
          wrapped_key: string;
          iv: string;
          wrapped_by: string;
          wrapped_by_device: string;
          created_at?: string;
        };
        Update: { wrapped_key?: string; iv?: string; wrapped_by?: string; wrapped_by_device?: string };
        Relationships: [];
      };
      messages: {
        Row: { id: string; conversation_id: string; sender_id: string; ciphertext: string; iv: string; created_at: string };
        Insert: { id?: string; conversation_id: string; sender_id: string; ciphertext: string; iv: string; created_at?: string };
        Update: { ciphertext?: string; iv?: string };
        Relationships: [];
      };
      sponsors: {
        Row: {
          id: string;
          name: string;
          hue: number;
          type: string;
          location: string | null;
          tagline: string | null;
          about: string | null;
          perks: string[];
          products: { name: string; price: string }[];
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          hue?: number;
          type?: string;
          location?: string | null;
          tagline?: string | null;
          about?: string | null;
          perks?: string[];
          products?: { name: string; price: string }[];
          created_at?: string;
        };
        Update: {
          name?: string;
          hue?: number;
          type?: string;
          location?: string | null;
          tagline?: string | null;
          about?: string | null;
          perks?: string[];
          products?: { name: string; price: string }[];
        };
        Relationships: [];
      };
      player_sponsorships: {
        Row: {
          id: string;
          player_id: string;
          sponsor_id: string;
          status: string;
          category: string;
          term: string;
          started_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          player_id: string;
          sponsor_id: string;
          status?: string;
          category?: string;
          term?: string;
          started_at?: string | null;
          created_at?: string;
        };
        Update: { status?: string; started_at?: string | null };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          actor_id: string | null;
          kind: string;
          title: string;
          body: string | null;
          link_url: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          actor_id?: string | null;
          kind?: string;
          title: string;
          body?: string | null;
          link_url?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: { read_at?: string | null };
        Relationships: [];
      };
      teams: {
        Row: { id: string; name: string; sport_key: string; city: string | null; neighborhood: string | null; zip: string | null; state: string | null; max_size: number | null; category: string; created_by: string; created_at: string; deleted_at: string | null };
        Insert: { id?: string; name: string; sport_key: string; city?: string | null; neighborhood?: string | null; zip?: string | null; state?: string | null; max_size?: number | null; category?: string; created_by: string; created_at?: string; deleted_at?: string | null };
        Update: { name?: string; city?: string | null; neighborhood?: string | null; zip?: string | null; state?: string | null; max_size?: number | null; category?: string; created_by?: string; deleted_at?: string | null };
        Relationships: [];
      };
      login_events: {
        Row: { id: string; user_id: string; created_at: string; ip: string | null; user_agent: string | null; device: string | null; browser: string | null; os: string | null; city: string | null; region: string | null; country: string | null };
        Insert: { id?: string; user_id: string; created_at?: string; ip?: string | null; user_agent?: string | null; device?: string | null; browser?: string | null; os?: string | null; city?: string | null; region?: string | null; country?: string | null };
        Update: { ip?: string | null };
        Relationships: [];
      };
      team_members: {
        Row: { team_id: string; user_id: string; role: string; designation: string | null; joined_at: string };
        Insert: { team_id: string; user_id: string; role?: string; designation?: string | null; joined_at?: string };
        Update: { role?: string; designation?: string | null };
        Relationships: [];
      };
      team_matches: {
        Row: { id: string; sport_key: string; home_team_id: string; away_team_id: string; proposed_by: string; scheduled_at: string | null; location_text: string | null; status: string; home_score: number | null; away_score: number | null; winner_team_id: string | null; note: string | null; decided_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; sport_key: string; home_team_id: string; away_team_id: string; proposed_by: string; scheduled_at?: string | null; location_text?: string | null; status?: string; home_score?: number | null; away_score?: number | null; winner_team_id?: string | null; note?: string | null; decided_at?: string | null; created_at?: string; updated_at?: string };
        Update: { sport_key?: string; scheduled_at?: string | null; location_text?: string | null; status?: string; home_score?: number | null; away_score?: number | null; winner_team_id?: string | null; note?: string | null; decided_at?: string | null; updated_at?: string };
        Relationships: [];
      };
      team_invites: {
        Row: { id: string; team_id: string; invited_user_id: string; invited_by: string; status: string; created_at: string };
        Insert: { id?: string; team_id: string; invited_user_id: string; invited_by: string; status?: string; created_at?: string };
        Update: { status?: string };
        Relationships: [];
      };
      tournaments: {
        Row: {
          id: string;
          owner_id: string;
          code: string;
          title: string;
          sport_key: string;
          queue_enabled: boolean;
          status: string;
          cancelled_at: string | null;
          entry_type: string;
          visibility: string;
          summary: string | null;
          description: string | null;
          starts_at: string | null;
          ends_at: string | null; roster_lock_policy: string | null; roster_lock_custom: string | null; results_finalized_at: string | null; points_awarded_at: string | null;
          timezone: string | null;
          location_name: string | null;
          location_address: string | null;
          location_zip: string | null;
          location_lat: number | null;
          location_lng: number | null;
          location_place_id: string | null;
          location_url: string | null;
          location_pin_source: string | null;
          location_pin_at: string | null;
          registration_opens_at: string | null;
          registration_deadline: string | null;
          capacity: number | null;
          min_women: number;
          min_men: number;
          reserves_allowed: number;
          cover_path: string | null;
          logo_path: string | null;
          weather_enabled: boolean;
          promoted: boolean;
          format_config: Json;
          suspended_at: string | null;
          suspended_by: string | null;
          suspended_reason: string | null;
          created_at: string;
          updated_at: string;
         host_agreed_at: string | null; venue_attested_at: string | null; };
        Insert: {
          location_pin_source?: string | null;
          location_pin_at?: string | null;
          id?: string;
          owner_id: string;
          code: string;
          title: string;
          sport_key: string;
          status?: string;
          cancelled_at?: string | null;
          entry_type?: string;
          visibility?: string;
          summary?: string | null;
          description?: string | null;
          starts_at?: string | null;
          ends_at?: string | null; roster_lock_policy?: string | null; roster_lock_custom?: string | null; results_finalized_at?: string | null; points_awarded_at?: string | null;
          timezone?: string | null;
          location_name?: string | null;
          location_address?: string | null;
          location_zip?: string | null;
          location_lat?: number | null;
          location_lng?: number | null;
          location_place_id?: string | null;
          location_url?: string | null;
          registration_opens_at?: string | null;
          registration_deadline?: string | null;
          capacity?: number | null;
          min_women?: number;
          min_men?: number;
          reserves_allowed?: number;
          cover_path?: string | null;
          logo_path?: string | null;
          weather_enabled?: boolean;
          promoted?: boolean;
          format_config?: Json;
          suspended_at?: string | null;
          suspended_by?: string | null;
          suspended_reason?: string | null;
          created_at?: string;
          updated_at?: string;
         host_agreed_at?: string | null; venue_attested_at?: string | null; };
        Update: {
          location_pin_source?: string | null;
          location_pin_at?: string | null;
          title?: string;
          sport_key?: string;
          queue_enabled?: boolean;
          status?: string;
          cancelled_at?: string | null;
          entry_type?: string;
          visibility?: string;
          summary?: string | null;
          description?: string | null;
          starts_at?: string | null;
          ends_at?: string | null; roster_lock_policy?: string | null; roster_lock_custom?: string | null; results_finalized_at?: string | null; points_awarded_at?: string | null;
          timezone?: string | null;
          location_name?: string | null;
          location_address?: string | null;
          location_zip?: string | null;
          location_lat?: number | null;
          location_lng?: number | null;
          location_place_id?: string | null;
          location_url?: string | null;
          registration_opens_at?: string | null;
          registration_deadline?: string | null;
          capacity?: number | null;
          min_women?: number;
          min_men?: number;
          reserves_allowed?: number;
          cover_path?: string | null;
          logo_path?: string | null;
          weather_enabled?: boolean;
          promoted?: boolean;
          format_config?: Json;
          suspended_at?: string | null;
          suspended_by?: string | null;
          suspended_reason?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      tournament_managers: {
        Row: { tournament_id: string; user_id: string; role: string; created_at: string };
        Insert: { tournament_id: string; user_id: string; role?: string; created_at?: string };
        Update: { role?: string };
        Relationships: [];
      };
      tournament_plan_items: {
        Row: {
          id: string;
          tournament_id: string;
          title: string;
          kind: string;
          starts_at: string;
          ends_at: string | null;
          notes: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          tournament_id: string;
          title: string;
          kind?: string;
          starts_at: string;
          ends_at?: string | null;
          notes?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          title?: string;
          kind?: string;
          starts_at?: string;
          ends_at?: string | null;
          notes?: string | null;
          sort_order?: number;
        };
        Relationships: [];
      };
      tournament_divisions: {
        Row: { id: string; tournament_id: string; name: string; description: string | null; fee_cents: number; fee_basis: string; capacity: number | null; team_size: number | null; group_count: number | null; group_size: number | null; group_extra: number; group_extra_mode: string; sort_order: number; created_at: string; updated_at: string };
        Insert: { id?: string; tournament_id: string; name: string; description?: string | null; fee_cents?: number; fee_basis?: string; capacity?: number | null; team_size?: number | null; group_count?: number | null; group_size?: number | null; group_extra?: number; group_extra_mode?: string; sort_order?: number; created_at?: string; updated_at?: string };
        Update: { name?: string; description?: string | null; fee_cents?: number; fee_basis?: string; capacity?: number | null; team_size?: number | null; group_count?: number | null; group_size?: number | null; group_extra?: number; group_extra_mode?: string; sort_order?: number; updated_at?: string };
        Relationships: [];
      };
      tournament_groups: {
        Row: { id: string; tournament_id: string; division_id: string; name: string; sort_order: number; created_at: string };
        Insert: { id?: string; tournament_id: string; division_id: string; name: string; sort_order?: number; created_at?: string };
        Update: { name?: string; sort_order?: number };
        Relationships: [];
      };
      tournament_draws: {
        Row: { id: string; tournament_id: string; division_id: string; draw_number: number; drawn_by: string | null; drawn_at: string };
        Insert: { id?: string; tournament_id: string; division_id: string; draw_number: number; drawn_by?: string | null; drawn_at?: string };
        Update: { draw_number?: number };
        Relationships: [];
      };
      tournament_group_entries: {
        Row: { id: string; group_id: string; tournament_id: string; division_id: string; registration_id: string; seed: number | null; sort_order: number };
        Insert: { id?: string; group_id: string; tournament_id: string; division_id: string; registration_id: string; seed?: number | null; sort_order?: number };
        Update: { seed?: number | null; sort_order?: number; group_id?: string };
        Relationships: [];
      };
      tournament_points: {
        Row: { id: string; user_id: string; sport_key: string; tournament_id: string; division_id: string; registration_id: string | null; points: number; place: number | null; field_size: number | null; played: boolean; earned_at: string; created_at: string };
        Insert: { id?: string; user_id: string; sport_key: string; tournament_id: string; division_id: string; registration_id?: string | null; points?: number; place?: number | null; field_size?: number | null; played?: boolean; earned_at?: string; created_at?: string };
        Update: { points?: number; place?: number | null; field_size?: number | null; played?: boolean; earned_at?: string };
        Relationships: [];
      };
      tournament_waitlist: {
        Row: { id: string; tournament_id: string; division_id: string | null; kind: string; user_id: string | null; email: string | null; name: string | null; status: string; notified_at: string | null; created_at: string };
        Insert: { id?: string; tournament_id: string; division_id?: string | null; kind: string; user_id?: string | null; email?: string | null; name?: string | null; status?: string; notified_at?: string | null; created_at?: string };
        Update: { division_id?: string | null; user_id?: string | null; email?: string | null; name?: string | null; status?: string; notified_at?: string | null };
        Relationships: [];
      };
      tournament_matches: {
        Row: { id: string; tournament_id: string; division_id: string; group_id: string | null; bracket: string; round: number; slot: number; entry_a: string | null; entry_b: string | null; score_a: number | null; score_b: number | null; winner_id: string | null; status: string; scheduled_at: string | null; court: string | null; next_match_id: string | null; next_slot: string | null; sort_order: number; created_at: string; updated_at: string };
        Insert: { id?: string; tournament_id: string; division_id: string; group_id?: string | null; bracket?: string; round?: number; slot?: number; entry_a?: string | null; entry_b?: string | null; score_a?: number | null; score_b?: number | null; winner_id?: string | null; status?: string; scheduled_at?: string | null; court?: string | null; next_match_id?: string | null; next_slot?: string | null; sort_order?: number; created_at?: string; updated_at?: string };
        Update: { group_id?: string | null; bracket?: string; round?: number; slot?: number; entry_a?: string | null; entry_b?: string | null; score_a?: number | null; score_b?: number | null; winner_id?: string | null; status?: string; scheduled_at?: string | null; court?: string | null; next_match_id?: string | null; next_slot?: string | null; sort_order?: number; updated_at?: string };
        Relationships: [];
      };
      tournament_custom_fields: {
        Row: { id: string; tournament_id: string; label: string; description: string | null; field_type: string; options: Json; required: boolean; scope: string; sort_order: number; reask_on_substitution: boolean; created_at: string };
        Insert: { id?: string; tournament_id: string; label: string; description?: string | null; field_type?: string; options?: Json; required?: boolean; scope?: string; sort_order?: number; reask_on_substitution?: boolean; created_at?: string };
        Update: { label?: string; description?: string | null; field_type?: string; options?: Json; required?: boolean; scope?: string; sort_order?: number; reask_on_substitution?: boolean };
        Relationships: [];
      };
      tournament_registrations: {
        Row: { id: string; tournament_id: string; division_id: string | null; team_id: string | null; registrant_id: string; status: string; payment_status: string; team_answers: Json; waitlist_position: number | null; moderation_note: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; tournament_id: string; division_id?: string | null; team_id?: string | null; registrant_id: string; status?: string; payment_status?: string; team_answers?: Json; waitlist_position?: number | null; created_at?: string; updated_at?: string };
        Update: { division_id?: string | null; team_id?: string | null; status?: string; payment_status?: string; team_answers?: Json; waitlist_position?: number | null; moderation_note?: string | null; updated_at?: string };
        Relationships: [];
      };
      tournament_registration_players: {
        Row: { id: string; registration_id: string; tournament_id: string; user_id: string; is_reserve: boolean; played: boolean | null; waiver_accepted_at: string | null; waiver_version: string | null; rules_accepted_at: string | null; rules_version: string | null; player_answers: Json; confirmed_at: string | null; created_at: string };
        Insert: { id?: string; registration_id: string; tournament_id: string; user_id: string; is_reserve?: boolean; played?: boolean | null; waiver_accepted_at?: string | null; waiver_version?: string | null; rules_accepted_at?: string | null; rules_version?: string | null; player_answers?: Json; confirmed_at?: string | null; created_at?: string };
        Update: { is_reserve?: boolean; played?: boolean | null; waiver_accepted_at?: string | null; waiver_version?: string | null; rules_accepted_at?: string | null; rules_version?: string | null; player_answers?: Json; confirmed_at?: string | null };
        Relationships: [];
      };
      tournament_substitution_requests: {
        Row: { id: string; tournament_id: string; registration_id: string; team_id: string | null; requested_by: string; player_out: string; player_in: string; status: string; note: string | null; expires_at: string | null; decided_at: string | null; created_at: string };
        Insert: { id?: string; tournament_id: string; registration_id: string; team_id?: string | null; requested_by: string; player_out: string; player_in: string; status?: string; note?: string | null; expires_at?: string | null; decided_at?: string | null; created_at?: string };
        Update: { status?: string; note?: string | null; expires_at?: string | null; decided_at?: string | null };
        Relationships: [];
      };
      tournament_payments: {
        Row: { id: string; registration_id: string; tournament_id: string; submitted_by: string; proof_path: string | null; amount_cents: number | null; status: string; deny_reason: string | null; reviewed_by: string | null; reviewed_at: string | null; created_at: string };
        Insert: { id?: string; registration_id: string; tournament_id: string; submitted_by: string; proof_path?: string | null; amount_cents?: number | null; status?: string; deny_reason?: string | null; reviewed_by?: string | null; reviewed_at?: string | null; created_at?: string };
        Update: { proof_path?: string | null; amount_cents?: number | null; status?: string; deny_reason?: string | null; reviewed_by?: string | null; reviewed_at?: string | null };
        Relationships: [];
      };
      court_search_cache: {
        Row: { zip: string; radius_km: number; sport: string; results: Json; fetched_at: string };
        Insert: { zip: string; radius_km: number; sport: string; results?: Json; fetched_at?: string };
        Update: { results?: Json; fetched_at?: string };
        Relationships: [];
      };
      court_sport_intel: {
        Row: { place_id: string; sport: string; verdict: string; confidence: number; reliability: number; evidence: string | null; source: string | null; source_url: string | null; evidence_excerpt: string | null; verifying_at: string | null; display_name: string | null; lat: number | null; lng: number | null; address: string | null; website: string | null; rating: number | null; rating_count: number | null; checked_at: string };
        Insert: { place_id: string; sport: string; verdict: string; confidence?: number; reliability?: number; evidence?: string | null; source?: string | null; source_url?: string | null; evidence_excerpt?: string | null; verifying_at?: string | null; display_name?: string | null; lat?: number | null; lng?: number | null; address?: string | null; website?: string | null; rating?: number | null; rating_count?: number | null; checked_at?: string };
        Update: { verdict?: string; confidence?: number; reliability?: number; evidence?: string | null; source?: string | null; source_url?: string | null; evidence_excerpt?: string | null; verifying_at?: string | null; display_name?: string | null; lat?: number | null; lng?: number | null; address?: string | null; website?: string | null; rating?: number | null; rating_count?: number | null; checked_at?: string };
        Relationships: [];
      };
      service_usage: {
        Row: { month: string; live_search_count: number; updated_at: string };
        Insert: { month: string; live_search_count?: number; updated_at?: string };
        Update: { live_search_count?: number; updated_at?: string };
        Relationships: [];
      };
      zip_geocode: {
        Row: { zip: string; lat: number; lng: number; fetched_at: string };
        Insert: { zip: string; lat: number; lng: number; fetched_at?: string };
        Update: { lat?: number; lng?: number; fetched_at?: string };
        Relationships: [];
      };
      courts_scan_log: {
        Row: { zip: string; sport: string; scanned_at: string };
        Insert: { zip: string; sport: string; scanned_at?: string };
        Update: { zip?: string; sport?: string; scanned_at?: string };
        Relationships: [];
      };
      user_sport_affinity: {
        Row: { user_id: string; sport_key: string; score: number; updated_at: string };
        Insert: { user_id: string; sport_key: string; score?: number; updated_at?: string };
        Update: { user_id?: string; sport_key?: string; score?: number; updated_at?: string };
        Relationships: [];
      };
      user_author_affinity: {
        Row: { user_id: string; author_id: string; score: number; updated_at: string };
        Insert: { user_id: string; author_id: string; score?: number; updated_at?: string };
        Update: { user_id?: string; author_id?: string; score?: number; updated_at?: string };
        Relationships: [];
      };
      court_suggestions: {
        Row: { id: string; user_id: string; name: string; address: string; phone: string | null; website_url: string | null; maps_url: string | null; notes: string | null; sports: string[]; status: string; admin_note: string | null; created_at: string; reviewed_at: string | null; reviewed_by: string | null };
        Insert: { id?: string; user_id: string; name: string; address: string; phone?: string | null; website_url?: string | null; maps_url?: string | null; notes?: string | null; sports?: string[]; status?: string; admin_note?: string | null; created_at?: string; reviewed_at?: string | null; reviewed_by?: string | null };
        Update: { status?: string; admin_note?: string | null; reviewed_at?: string | null; reviewed_by?: string | null };
        Relationships: [];
      };
      courts: {
        Row: {
          id: string;
          name: string;
          sports: string[];
          address: string | null;
          neighborhood: string | null;
          city: string | null;
          state: string | null;
          zip: string | null;
          lat: number | null;
          lng: number | null;
          amenities: string[];
          google_place_id: string | null;
          facts_inference: Json | null;
          facts_inferred: string[];
          facts_inferred_at: string | null;
          is_active: boolean;
          rating: number | null;
          rating_count: number | null;
          is_private: boolean;
          indoor: boolean;
          lights: boolean | null;
          free: boolean | null;
          court_count: number | null;
          confirmed_at: string | null;
          confirmed_by: string | null;
          website: string | null;
          created_at: string;
        };
        Insert: {
          is_active?: boolean;
          facts_inference?: Json | null;
          facts_inferred?: string[];
          facts_inferred_at?: string | null;
          indoor?: boolean;
          lights?: boolean | null;
          free?: boolean | null;
          court_count?: number | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          id?: string;
          name: string;
          sports?: string[];
          address?: string | null;
          neighborhood?: string | null;
          city?: string | null;
          state?: string | null;
          zip?: string | null;
          lat?: number | null;
          lng?: number | null;
          amenities?: string[];
          google_place_id?: string | null;
          rating?: number | null;
          rating_count?: number | null;
          is_private?: boolean;
          website?: string | null;
          created_at?: string;
        };
        Update: {
          is_active?: boolean;
          facts_inference?: Json | null;
          facts_inferred?: string[];
          facts_inferred_at?: string | null;
          indoor?: boolean;
          lights?: boolean | null;
          free?: boolean | null;
          court_count?: number | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          name?: string;
          sports?: string[];
          amenities?: string[];
          lat?: number | null;
          lng?: number | null;
          address?: string | null;
          neighborhood?: string | null;
          city?: string | null;
          state?: string | null;
          zip?: string | null;
          google_place_id?: string | null;
          rating?: number | null;
          rating_count?: number | null;
          is_private?: boolean;
          website?: string | null;
        };
        Relationships: [];
      };
      court_reviews: {
        Row: { id: string; court_id: string; author_id: string; rating: number; body: string | null; created_at: string };
        Insert: { id?: string; court_id: string; author_id: string; rating: number; body?: string | null; created_at?: string };
        Update: { rating?: number; body?: string | null };
        Relationships: [];
      };
      court_checkins: {
        Row: { id: string; court_id: string; user_id: string; created_at: string };
        Insert: { id?: string; court_id: string; user_id: string; created_at?: string };
        Update: { id?: string; court_id?: string; user_id?: string; created_at?: string };
        Relationships: [];
      };
      region_challenges: {
        Row: {
          id: string;
          sport_key: string;
          scope: string;
          region_a: string;
          region_b: string;
          status: string;
          starts_at: string;
          ends_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          sport_key: string;
          scope?: string;
          region_a: string;
          region_b: string;
          status?: string;
          starts_at?: string;
          ends_at?: string | null;
          created_at?: string;
        };
        Update: { status?: string; ends_at?: string | null };
        Relationships: [];
      };
      feature_flags: {
        Row: { key: string; enabled: boolean; note: string | null; updated_at: string };
        Insert: { key: string; enabled?: boolean; note?: string | null; updated_at?: string };
        Update: { enabled?: boolean; note?: string | null; updated_at?: string };
        Relationships: [];
      };
      event_occurrences: {
        Row: { id: string; event_id: string; occ_date: string; starts_at: string; ends_at: string; status: string; verified_count: number; evidence: Json | null; skip_note: string | null; closed_at: string | null; created_at: string };
        Insert: { id?: string; event_id: string; occ_date: string; starts_at: string; ends_at: string; status?: string; verified_count?: number; evidence?: Json | null; skip_note?: string | null; closed_at?: string | null; created_at?: string };
        Update: { status?: string; verified_count?: number; evidence?: Json | null; skip_note?: string | null; closed_at?: string | null };
        Relationships: [];
      };
      liveness_transitions: {
        Row: { id: string; event_id: string; occurrence_id: string | null; scope: string; prev: string; next: string; reason_code: string; shadow: boolean; evidence: Json | null; rule_version: number; job_id: string | null; created_at: string };
        Insert: { id?: string; event_id: string; occurrence_id?: string | null; scope: string; prev: string; next: string; reason_code: string; shadow?: boolean; evidence?: Json | null; rule_version?: number; job_id?: string | null; created_at?: string };
        Update: { reason_code?: string };
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          title: string;
          sport_key: string;
          kind: string;
          description: string | null;
          court_id: string | null;
          location_text: string | null;
          starts_at: string;
          ends_at: string | null;
          capacity: number | null;
          cost_text: string | null;
          status: string;
          cancelled_at: string | null;
          created_by: string | null;
          created_at: string;
          cover_path: string | null;
          thumb_path: string | null;
          location_url: string | null;
          whatsapp_url: string | null;
          queue_enabled: boolean;
          join_policy: string;
          recurrence: string;
          recurrence_days: string[];
         host_ack_at: string | null;  location_reveal: string;           liveness_status: string;           liveness_shadow: string;           empty_streak: number;           last_alive_at: string | null;           dormant_at: string | null;           organizer_state: string;           paused_until: string | null;           liveness_rule_version: number; location_lat: number | null; location_lng: number | null; location_pin_source: string | null; location_pin_at: string | null; description_en: string | null; description_en_at: string | null; };
        Insert: {
          location_lat?: number | null;
          location_lng?: number | null;
          location_pin_source?: string | null;
          location_pin_at?: string | null;
          description_en?: string | null;
          description_en_at?: string | null;
          id?: string;
          title: string;
          sport_key: string;
          kind?: string;
          description?: string | null;
          court_id?: string | null;
          location_text?: string | null;
          starts_at: string;
          ends_at?: string | null;
          capacity?: number | null;
          cost_text?: string | null;
          status?: string;
          cancelled_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          cover_path?: string | null;
          thumb_path?: string | null;
          location_url?: string | null;
          whatsapp_url?: string | null;
          queue_enabled?: boolean;
          join_policy?: string;
          recurrence?: string;
          recurrence_days?: string[];
         host_ack_at?: string | null;  location_reveal?: string;           liveness_status?: string;           liveness_shadow?: string;           empty_streak?: number;           last_alive_at?: string | null;           dormant_at?: string | null;           organizer_state?: string;           paused_until?: string | null;           liveness_rule_version?: number; };
        Update: {
          location_lat?: number | null;
          location_lng?: number | null;
          location_pin_source?: string | null;
          location_pin_at?: string | null;
          description_en?: string | null;
          description_en_at?: string | null;
          title?: string;
          sport_key?: string;
          kind?: string;
          description?: string | null;
          court_id?: string | null;
          location_text?: string | null;
          starts_at?: string;
          ends_at?: string | null;
          capacity?: number | null;
          cost_text?: string | null;
          status?: string;
          cancelled_at?: string | null;
          cover_path?: string | null;
          thumb_path?: string | null;
          location_url?: string | null;
          whatsapp_url?: string | null;
          queue_enabled?: boolean;
          join_policy?: string;
          recurrence?: string;
          recurrence_days?: string[];
         location_reveal?: string;           liveness_status?: string;           liveness_shadow?: string;           empty_streak?: number;           last_alive_at?: string | null;           dormant_at?: string | null;           organizer_state?: string;           paused_until?: string | null; };
        Relationships: [];
      };
      event_rsvps: {
        Row: { event_id: string; user_id: string; status: string; created_at: string };
        Insert: { event_id: string; user_id: string; status?: string; created_at?: string };
        Update: { status?: string; created_at?: string };
        Relationships: [];
      };
      event_managers: {
        Row: { event_id: string; user_id: string; added_by: string | null; created_at: string };
        Insert: { event_id: string; user_id: string; added_by?: string | null; created_at?: string };
        Update: { added_by?: string | null };
        Relationships: [];
      };
      marketplace_listings: {
        Row: {
          id: string;
          kind: string;
          title: string;
          sport_key: string | null;
          category: string | null;
          price_text: string | null;
          price_cents: number | null;
          condition: string | null;
          location: string | null;
          description: string | null;
          contact_email: string | null;
          listed_by: string | null;
          status: string;
          created_at: string;
          mode: string;
          obo: boolean;
          trade_wants: string | null;
          photos: string[];
          zip: string | null;
          renewed_at: string;
          expires_at: string;
          sold_at: string | null;
          meet_court_ids: string[];
        };
        Insert: {
          id?: string;
          kind: string;
          title: string;
          sport_key?: string | null;
          category?: string | null;
          price_text?: string | null;
          price_cents?: number | null;
          condition?: string | null;
          location?: string | null;
          description?: string | null;
          contact_email?: string | null;
          listed_by?: string | null;
          status?: string;
          created_at?: string;
          mode?: string;
          obo?: boolean;
          trade_wants?: string | null;
          photos?: string[];
          zip?: string | null;
          renewed_at?: string;
          expires_at?: string;
          sold_at?: string | null;
          meet_court_ids?: string[];
        };
        Update: {
          title?: string;
          price_text?: string | null;
          price_cents?: number | null;
          description?: string | null;
          location?: string | null;
          status?: string;
          mode?: string;
          obo?: boolean;
          trade_wants?: string | null;
          photos?: string[];
          zip?: string | null;
          category?: string | null;
          sport_key?: string | null;
          condition?: string | null;
          renewed_at?: string;
          expires_at?: string;
          sold_at?: string | null;
          meet_court_ids?: string[];
        };
        Relationships: [];
      };
      listing_offers: {
        Row: {
          id: string;
          listing_id: string;
          buyer_id: string;
          actor_id: string;
          amount_cents: number | null;
          note: string | null;
          parent_offer_id: string | null;
          status: string;
          created_at: string;
          expires_at: string;
          decided_at: string | null;
        };
        Insert: {
          id?: string;
          listing_id: string;
          buyer_id: string;
          actor_id: string;
          amount_cents?: number | null;
          note?: string | null;
          parent_offer_id?: string | null;
          status?: string;
          created_at?: string;
          expires_at?: string;
          decided_at?: string | null;
        };
        Update: { status?: string; decided_at?: string | null };
        Relationships: [];
      };
      listing_meetups: {
        Row: {
          id: string;
          listing_id: string;
          offer_id: string | null;
          proposed_by: string;
          buyer_id: string;
          court_id: string | null;
          place_text: string | null;
          starts_at: string;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          offer_id?: string | null;
          proposed_by: string;
          buyer_id: string;
          court_id?: string | null;
          place_text?: string | null;
          starts_at: string;
          status?: string;
          created_at?: string;
        };
        Update: { status?: string; starts_at?: string; court_id?: string | null; place_text?: string | null };
        Relationships: [];
      };
      listing_reports: {
        Row: { id: string; listing_id: string; reporter_id: string; reason: string; created_at: string; resolved_at: string | null };
        Insert: { id?: string; listing_id: string; reporter_id: string; reason: string; created_at?: string; resolved_at?: string | null };
        Update: { resolved_at?: string | null };
        Relationships: [];
      };
      saved_listings: {
        Row: { user_id: string; listing_id: string; created_at: string };
        Insert: { user_id: string; listing_id: string; created_at?: string };
        Update: { created_at?: string };
        Relationships: [];
      };
      provider_reviews: {
        Row: { id: string; provider_user_id: string; reviewer_id: string; rating: number; body: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; provider_user_id: string; reviewer_id: string; rating: number; body?: string | null; created_at?: string; updated_at?: string };
        Update: { rating?: number; body?: string | null; updated_at?: string };
        Relationships: [];
      };
      class_providers: {
        Row: { user_id: string; status: string; headline: string | null; bio: string | null; approved_by: string | null; approved_at: string; created_at: string; roles: string[]; verification_level: string; rating_avg: number | null; rating_count: number; credential_expires_at: string | null; format: string; price_from_cents: number | null; availability: string; next_opening: string | null; area_text: string | null; sports: string[] };
        Insert: { user_id: string; status?: string; headline?: string | null; bio?: string | null; approved_by?: string | null; approved_at?: string; created_at?: string; roles?: string[]; verification_level?: string; credential_expires_at?: string | null; format?: string; price_from_cents?: number | null; availability?: string; next_opening?: string | null; area_text?: string | null; sports?: string[];           business_id?: string | null };
        Update: { status?: string; headline?: string | null; bio?: string | null; approved_by?: string | null; roles?: string[]; verification_level?: string; credential_expires_at?: string | null; format?: string; price_from_cents?: number | null; availability?: string; next_opening?: string | null; area_text?: string | null; sports?: string[];           business_id?: string | null };
        Relationships: [];
      };
      broadcasts: {
        Row: { id: string; subject: string; body: string; audience: Json; recipient_count: number; sent_by: string | null; created_at: string; };
        Insert: { id?: string; subject: string; body: string; audience?: Json; recipient_count?: number; sent_by?: string | null; created_at?: string; };
        Update: { subject?: string; body?: string; audience?: Json; recipient_count?: number; };
        Relationships: [];
      };
      provider_applications: {
        Row: {
          id: string;
          user_id: string;
          role: string;
          status: string;
          headline: string | null;
          bio: string | null;
          credential_type: string | null;
          credential_id: string | null;
          credential_jurisdiction: string | null;
          verification_url: string | null;
          applicant_note: string | null;
          review_note: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
          content_hash: string | null;
          submitted_at: string | null;
          version: number;
         phone: string | null; attestations: Json; };
        Insert: {
          id?: string;
          user_id: string;
          role: string;
          status?: string;
          headline?: string | null;
          bio?: string | null;
          credential_type?: string | null;
          credential_id?: string | null;
          credential_jurisdiction?: string | null;
          verification_url?: string | null;
          applicant_note?: string | null;
          review_note?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          content_hash?: string | null;
          submitted_at?: string | null;
          version?: number;
         document_path?: string | null;  phone?: string | null; attestations?: Json; };
        Update: {
          status?: string;
          headline?: string | null;
          bio?: string | null;
          credential_type?: string | null;
          credential_id?: string | null;
          credential_jurisdiction?: string | null;
          verification_url?: string | null;
          applicant_note?: string | null;
          review_note?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          updated_at?: string;
          content_hash?: string | null;
          submitted_at?: string | null;
          version?: number;
        };
        Relationships: [];
      };
      classes: {
        Row: {
          id: string;
          provider_id: string;
          sport_key: string;
          title: string;
          summary: string | null;
          description: string | null;
          status: string;
          level_min: number | null;
          level_max: number | null;
          capacity: number | null;
          is_paid: boolean;
          price_cents: number;
          price_basis: string;
          recurrence: string;
          location_name: string | null;
          location_address: string | null;
          location_zip: string | null;
          location_lat: number | null;
          location_lng: number | null;
          location_place_id: string | null;
          class_format: string;
          level_label: string;
          age_group: string;
          gender_pref: string;
          what_to_bring: string | null;
          prerequisites: string | null;
          cancellation_policy: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          provider_id: string;
          sport_key: string;
          title: string;
          summary?: string | null;
          description?: string | null;
          status?: string;
          level_min?: number | null;
          level_max?: number | null;
          capacity?: number | null;
          is_paid?: boolean;
          price_cents?: number;
          price_basis?: string;
          recurrence?: string;
          location_name?: string | null;
          location_address?: string | null;
          location_zip?: string | null;
          location_lat?: number | null;
          location_lng?: number | null;
          location_place_id?: string | null;
          class_format?: string;
          level_label?: string;
          age_group?: string;
          gender_pref?: string;
          what_to_bring?: string | null;
          prerequisites?: string | null;
          cancellation_policy?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          sport_key?: string;
          title?: string;
          summary?: string | null;
          description?: string | null;
          status?: string;
          level_min?: number | null;
          level_max?: number | null;
          capacity?: number | null;
          is_paid?: boolean;
          price_cents?: number;
          price_basis?: string;
          recurrence?: string;
          location_name?: string | null;
          location_address?: string | null;
          location_zip?: string | null;
          location_lat?: number | null;
          location_lng?: number | null;
          location_place_id?: string | null;
          class_format?: string;
          level_label?: string;
          age_group?: string;
          gender_pref?: string;
          what_to_bring?: string | null;
          prerequisites?: string | null;
          cancellation_policy?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      class_sessions: {
        Row: { id: string; class_id: string; starts_at: string; ends_at: string | null; capacity: number | null; status: string; created_at: string };
        Insert: { id?: string; class_id: string; starts_at: string; ends_at?: string | null; capacity?: number | null; status?: string; created_at?: string };
        Update: { starts_at?: string; ends_at?: string | null; capacity?: number | null; status?: string };
        Relationships: [];
      };
      class_enrollments: {
        Row: { id: string; session_id: string; class_id: string; user_id: string; status: string; payment_status: string; confirmed_at: string | null; enrolled_at: string; updated_at: string };
        Insert: { id?: string; session_id: string; class_id: string; user_id: string; status?: string; payment_status?: string; confirmed_at?: string | null; enrolled_at?: string; updated_at?: string };
        Update: { status?: string; payment_status?: string; confirmed_at?: string | null; updated_at?: string };
        Relationships: [];
      };
    };
    Views: {
      /** KCDX-001: your own profile row, every column. The view filters on
       *  `id = auth.uid()` in SQL, so a query with no filter still returns at
       *  most your own row. */
      profile_private: {
        Row: {
          account_status: string;
          archived_at: string | null;
          availability: { day: string; start: string; end: string }[];
          avatar_hue: number;
          avatar_path: string | null;
          bio: string | null;
          birth_year: number | null;
          city: string | null;
          connections_count: number;
          country: string;
          cover_path: string | null;
          created_at: string;
          date_of_birth: string | null;
          display_name: string;
          first_name: string | null;
          followers_count: number;
          following_count: number;
          gear: Json;
          gender: string | null;
          handedness: string | null;
          home_zip: string | null;
          id: string;
          is_active: boolean | null;
          last_name: string | null;
          last_seen_at: string | null;
          location_precision: string;
          member_no: number | null;
          neighborhood: string | null;
          onboarding_draft: Json | null;
          open_to_invites: boolean;
          phone: string | null;
          phone_country: string;
          play_style: string;
          preferred_format: string;
          presence_mode: string;
          primary_sport: string | null;
          profile_gallery: Json;
          reliability: number;
          show_courts: boolean;
          show_teams: boolean;
          show_tournaments: boolean;
          signup_code: string | null;
          state: string | null;
          suspended_until: string | null;
          timezone: string | null;
          usual_times: string | null;
          verification_status: VerificationStatus;
        };
        Relationships: [];
      };
      /** KCDX-001: the approved member-to-member projection of `profiles`.
       *  Adding a field here is a privacy decision, and it also has to be
       *  granted by name on the base table — the type will not save you. */
      profiles_public: {
        Row: {
          id: string;
          display_name: string;
          avatar_hue: number;
          avatar_path: string | null;
          cover_path: string | null;
          bio: string | null;
          city: string | null;
          state: string | null;
          country: string;
          primary_sport: string | null;
          verification_status: VerificationStatus;
          reliability: number;
          connections_count: number;
          followers_count: number;
          following_count: number;
          member_no: number | null;
          created_at: string;
          last_seen_at: string | null;
          presence_mode: string;
          open_to_invites: boolean;
          show_courts: boolean;
          show_teams: boolean;
          show_tournaments: boolean;
          gear: Json;
          profile_gallery: Json;
          usual_times: string | null;
          play_style: string;
          preferred_format: string;
          handedness: string | null;
          is_active: boolean | null;
          age: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      get_ranked_feed: {
        Args: { p_scope?: string; p_limit?: number };
        Returns: { id: string; score: number; likes: number; comments: number; viewer_liked: boolean }[];
      };
      refresh_feed_affinities: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      global_search: {
        Args: { p_q: string; p_limit?: number; p_kinds?: string[] | null };
        Returns: { kind: string; id: string; title: string; subtitle: string | null; rank: number }[];
      };
      accept_substitution: {
        Args: { p_request_id: string; p_answers: Json; p_accept_waiver: boolean; p_accept_rules: boolean };
        Returns: Json;
      };
      courts_finder: {
        Args: { p_lat: number; p_lng: number; p_radius_mi: number };
        Returns: {
          id: string; name: string; area: string | null; city: string | null;
          lat: number; lng: number; sports: string[]; court_count: number | null;
          indoor: boolean; lights: boolean | null; free: boolean | null;
          google_rating: number | null; google_rating_count: number | null;
          member_rating: number | null; member_review_count: number;
          live_queue: boolean; active_player_count: number; recent_players: Json;
          busy: string | null; distance_mi: number;
        }[];
      };
      create_match_post: {
        Args: { p_match_id: string; p_opponent: string; p_score: string; p_court: string; p_note?: string };
        Returns: string;
      };
      liveness_run: { Args: { p_grace_hours?: number; p_job_id?: string }; Returns: Json };
      is_business_manager: { Args: { p_business: string; p_uid: string }; Returns: boolean };
      respond_sponsorship: { Args: { p_id: string; p_accept: boolean }; Returns: Json };
      end_sponsorship: { Args: { p_id: string }; Returns: Json };
      liveness_skip_occurrence: { Args: { p_event: string; p_date: string; p_note?: string }; Returns: Json };
      liveness_unskip_occurrence: { Args: { p_event: string; p_date: string }; Returns: Json };
      liveness_pause_series: { Args: { p_event: string; p_until: string }; Returns: Json };
      liveness_resume_series: { Args: { p_event: string }; Returns: Json };
      liveness_end_series: { Args: { p_event: string }; Returns: Json };
      bump_article_read: { Args: { p_slug: string }; Returns: undefined };
      ranked_players: {
        Args: { p_sport: string; p_scope?: string; p_region?: string | null };
        Returns: {
          user_id: string;
          display_name: string;
          avatar_hue: number;
          verification_status: VerificationStatus;
          points: number;
          skill_rating: number | null;
          matches_played: number;
          wins: number;
          rank: number;
        }[];
      };
      current_admin_role: { Args: Record<string, never>; Returns: string };
      request_connection: { Args: { p_target: string }; Returns: string };
      accept_connection: { Args: { p_requester: string }; Returns: boolean };
      remove_connection: { Args: { p_other: string; p_as_decline?: boolean }; Returns: undefined };
      follow_player: { Args: { p_target: string }; Returns: boolean };
      unfollow_player: { Args: { p_target: string }; Returns: undefined };
      block_player: { Args: { p_target: string }; Returns: undefined };
      is_blocked_pair: { Args: { a: string; b: string }; Returns: boolean };
      mutual_connections: {
        Args: { p_other: string; p_limit?: number };
        Returns: { user_id: string; display_name: string; avatar_hue: number; avatar_path: string | null }[];
      };
      mutual_connections_count: { Args: { p_other: string }; Returns: number };
      relationship_context: {
        Args: { p_other: string };
        Returns: {
          mutual_count: number;
          shared_sports: string[];
          same_city: boolean;
          same_neighborhood: boolean;
          played_together: number;
          shared_team: string | null;
          co_tournaments: number;
        }[];
      };
      people_you_may_know: {
        Args: { p_limit?: number };
        Returns: {
          user_id: string;
          display_name: string;
          avatar_hue: number;
          avatar_path: string | null;
          verification_status: VerificationStatus;
          city: string | null;
          neighborhood: string | null;
          primary_sport: string | null;
          score: number;
          mutual_count: number;
          shared_sports: string[];
          played_together: number;
          shared_team: boolean;
          same_area: string | null;
        }[];
      };
      chat_unread_count: { Args: Record<string, never>; Returns: number };
      claim_live_search: { Args: { p_month: string; p_cap: number }; Returns: boolean };
      generate_invite_codes: { Args: { p_count: number; p_max_uses?: number; p_note?: string | null }; Returns: string[] };
      generate_investor_codes: { Args: { p_count: number; p_note?: string | null }; Returns: string[] };
      check_rate_limit: { Args: { p_key: string; p_max: number; p_window_seconds: number }; Returns: boolean };
      place_on_team: { Args: { p_court_id: string; p_user_id: string | null; p_guest_name: string | null; p_idempotency_key: string | null }; Returns: string };
      queue_version: { Args: { p_session_id: string }; Returns: number };
      queue_poll_head: { Args: { p_session_id: string }; Returns: { version: number; organizer_id: string | null }[] };
      enqueue_job: { Args: { p_kind: string; p_payload: Json; p_dedupe_key: string | null; p_run_after: string; p_max_attempts: number; p_correlation_id: string | null }; Returns: string };
      claim_jobs: { Args: { p_kind: string | null; p_limit: number; p_owner: string; p_lease_seconds: number }; Returns: Database["public"]["Tables"]["jobs"]["Row"][] };
      complete_job: { Args: { p_id: string }; Returns: undefined };
      fail_job: { Args: { p_id: string; p_error: string }; Returns: string };
      replay_job: { Args: { p_id: string }; Returns: undefined };
      merge_format_config: { Args: { p_id: string; p_patch: Json; p_expected_updated_at?: string | null }; Returns: Json };
      courtside_register: { Args: { p_install_id: string; p_secret_hash: string; p_token_hash: string; p_platform: string | null; p_app_version: string | null }; Returns: boolean };
      courtside_issue_enrollment: { Args: { p_session_id: string; p_secret_hash: string; p_label: string | null; p_ttl_minutes: number }; Returns: string };
      can_i_act_on: { Args: { p_subject: string; p_action: string }; Returns: boolean };
      feed_type_counts: { Args: { p_scope: string }; Returns: { post_type: string; n: number }[] };
      browse_kind: { Args: { p_kind: string; p_limit: number }; Returns: { kind: string; id: string; title: string; subtitle: string | null; sort_at: string | null }[] };
      posts_within: { Args: { p_lat: number | null; p_lng: number | null; p_radius_mi: number }; Returns: string[] };
      record_health_snapshot: { Args: Record<string, never>; Returns: { subsystem: string; ok: boolean; detail: string | null; transitioned: boolean }[] };
      points_drift_count: { Args: Record<string, never>; Returns: number };
      team_remove_member: { Args: { p_team: string; p_target: string }; Returns: string };
      class_enroll: { Args: { p_session: string }; Returns: string };
      queue_start_next: { Args: { p_court: string }; Returns: Json };
      tournament_register_team: { Args: { p_tournament: string; p_division: string | null; p_team: string | null; p_roster: Json; p_answers: Json; p_accept_waiver: boolean; p_accept_rules: boolean }; Returns: Json };
      rebuild_all_player_points: { Args: Record<string, never>; Returns: number };
      rum_ingest: { Args: { p_metric: string; p_value_ms: number; p_route: string | null; p_is_mobile: boolean; p_daily_cap: number }; Returns: string };
      claim_storage_deletions: { Args: { p_limit: number }; Returns: { id: string; bucket_id: string; object_path: string; attempts: number }[] };
      mark_storage_deletion: { Args: { p_id: string; p_ok: boolean; p_error: string | null }; Returns: undefined };
      enqueue_storage_deletion: { Args: { p_bucket: string; p_path: string; p_reason: string }; Returns: undefined };
      storage_deletions_stuck: { Args: Record<string, never>; Returns: number };
      storage_deletions_abandoned: { Args: Record<string, never>; Returns: number };
      storage_deletion_intact: { Args: Record<string, never>; Returns: boolean };
      players_open_to_requests: { Args: { p_ids: string[] }; Returns: { player_id: string }[] };
      one_invite_control_intact: { Args: Record<string, never>; Returns: boolean };
      function_acl_intact: { Args: Record<string, never>; Returns: boolean };
      report_and_ingest_intact: { Args: Record<string, never>; Returns: boolean };
      can_i_see_connections: { Args: { p_subject: string }; Returns: boolean };
      can_i_see_schedule: { Args: { p_subject: string }; Returns: boolean };
      can_i_see_comment: { Args: { p_comment: string }; Returns: boolean };
      legal_name_boundary_intact: { Args: Record<string, never>; Returns: boolean };
      privacy_oracle_intact: { Args: Record<string, never>; Returns: boolean };
      ladder_enforced_intact: { Args: Record<string, never>; Returns: boolean };
      purge_expired_enrollments: { Args: Record<string, never>; Returns: number };
      courtside_enrollment_intact: { Args: Record<string, never>; Returns: boolean };
      courtside_heartbeat: { Args: { p_install_id: string; p_token_hash: string; p_app_version: string | null; p_platform: string | null; p_network_state: string | null; p_battery_pct: number | null; p_session_id: string | null; p_ip_hash: string | null }; Returns: boolean };
      courtside_revoke: { Args: { p_install_id: string }; Returns: undefined };
      fleet_metrics: { Args: Record<string, never>; Returns: { registered_queues: number; standalone_queues: number; event_queues: number; live_instances: number; running_live_play: number }[] };
      fleet_metric_detail: { Args: { p_metric: string }; Returns: { session_id: string; title: string | null; code: string | null; source: string; status: string; created_at: string; live_devices: number; waiting_teams: number; live_matches: number; last_device_at: string | null }[] };
      admin_force_end_session: { Args: { p_session_id: string; p_actor: string }; Returns: boolean };
      perf_report: { Args: { p_hours: number }; Returns: { metric: string; budget_ms: number; samples: number; p50_ms: number | null; p95_ms: number | null; worst_ms: number | null; within_budget: boolean | null }[] };
      prune_perf_samples: { Args: Record<string, never>; Returns: number };
      schema_manifest_missing: { Args: Record<string, never>; Returns: string[] };
      profile_boundary_intact: { Args: Record<string, never>; Returns: boolean };
      queue_boundary_intact: { Args: Record<string, never>; Returns: boolean };
      tournament_boundary_intact: { Args: Record<string, never>; Returns: boolean };
      moderation_reentry_intact: { Args: Record<string, never>; Returns: boolean };
      video_disabled_intact: { Args: Record<string, never>; Returns: boolean };
      grant_hygiene_intact: { Args: Record<string, never>; Returns: boolean };
      end_court_session: { Args: { p_session_id: string; p_actor: string | null; p_reason: string }; Returns: boolean };
      end_stale_court_sessions: { Args: { p_max_hours?: number }; Returns: number };
      unblock_player: { Args: { p_target: string }; Returns: undefined };
      social_invariants_intact: { Args: Record<string, never>; Returns: boolean };
      pymk_dismiss: { Args: { p_target: string }; Returns: undefined };
      pymk_valid_targets: { Args: { p_ids: string[] }; Returns: string[] };
      played_together_counts: { Args: { p_ids: string[] }; Returns: { other_id: string; matches: number }[] };
      is_discoverable_player: { Args: { p_id: string }; Returns: boolean };
      is_discoverable_tournament: { Args: { p_id: string }; Returns: boolean };
      discoverable_players: { Args: { p_ids: string[] }; Returns: { player_id: string }[] };
      queue_finish_match: { Args: { p_match: string; p_winner: string }; Returns: Json };
      event_admit: { Args: { p_event: string; p_user: string; p_cycle_start: string | null; p_force_going?: boolean }; Returns: Json };
      queue_placement_intact: { Args: Record<string, never>; Returns: boolean };
      event_capacity_intact: { Args: Record<string, never>; Returns: boolean };
      match_confirm_offer: { Args: { p_match: string; p_user: string }; Returns: Json };
      match_promote_waitlist: { Args: { p_match: string; p_offer_mins: number }; Returns: Json };
      match_capacity_intact: { Args: Record<string, never>; Returns: boolean };
      tournament_score_match: { Args: { p_match: string; p_score_a: number; p_score_b: number; p_expected_status?: string | null }; Returns: Json };
      tournament_clear_match: { Args: { p_match: string }; Returns: Json };
      bracket_graph_intact: { Args: Record<string, never>; Returns: boolean };
      klimr_readiness: { Args: Record<string, never>; Returns: { check_name: string; passed: boolean; detail: string | null }[] };
      klimr_ready: { Args: { p_min_checks?: number }; Returns: boolean };
      report_post: { Args: { p_post: string; p_reason: string; p_detail?: string | null }; Returns: Json };
      purge_orphan_feed_media: { Args: { p_grace_hours?: number }; Returns: number };
      resolve_feed_post: { Args: { p_post: string }; Returns: { post_id: string; visible: boolean; reason: string; author_id: string | null }[] };
      klimr_health: { Args: Record<string, never>; Returns: { subsystem: string; ok: boolean; detail: string }[] };
      klimr_healthy: { Args: Record<string, never>; Returns: boolean };
      chrome_data: { Args: Record<string, never>; Returns: Json };
      storage_manifest_take: { Args: { p_note?: string | null }; Returns: string };
      pymk_pool_saturation: { Args: Record<string, never>; Returns: { pool: string; members_at_cap: number; cap: number }[] };
      deliver_social_outbox: { Args: { p_limit?: number }; Returns: number };
      social_outbox_stuck: { Args: Record<string, never>; Returns: { id: number; kind: string; created_at: string; attempts: number; last_error: string | null }[] };
      post_media_inventory: { Args: Record<string, never>; Returns: { storage_path: string; size_bytes: number; uploaded_at: string; still_referenced: boolean; referencing_post: string | null }[] };
      legacy_media_retired: { Args: Record<string, never>; Returns: boolean };
      media_integrity_intact: { Args: Record<string, never>; Returns: boolean };
      recompute_player_points: { Args: { p_user: string; p_sport: string }; Returns: number };
      enrollment_boundary_intact: { Args: Record<string, never>; Returns: boolean };
      class_set_confirmation: { Args: { p_enrollment: string; p_confirmed: boolean }; Returns: Json };
      class_cancel_enrollment: { Args: { p_enrollment: string }; Returns: Json };
      team_ownership_intact: { Args: Record<string, never>; Returns: boolean };
      team_invite_respond: { Args: { p_invite: string; p_accept: boolean }; Returns: Json };
      team_transfer_ownership: { Args: { p_team: string; p_to: string }; Returns: Json };
      team_leave: { Args: { p_team: string }; Returns: Json };
      review_integrity_intact: { Args: Record<string, never>; Returns: boolean };
      is_privileged_writer: { Args: Record<string, never>; Returns: boolean };
      offer_invariants_intact: { Args: Record<string, never>; Returns: boolean };
      marketplace_offer_create: { Args: { p_listing: string; p_amount?: number | null; p_note?: string | null; p_parent?: string | null }; Returns: Json };
      marketplace_offer_respond: { Args: { p_offer: string; p_accept: boolean }; Returns: Json };
      provider_review_decide: { Args: { p_app: string; p_decision: string; p_expected_hash: string; p_reviewer: string; p_note?: string | null }; Returns: Json };
      tournament_register: { Args: { p_tournament: string; p_division?: string | null; p_team?: string | null; p_answers?: Json; p_accept_waiver?: boolean; p_accept_rules?: boolean }; Returns: Json };
      tournament_withdraw: { Args: { p_registration: string }; Returns: Json };
      tournament_submit_payment_proof: { Args: { p_registration: string; p_proof_path: string }; Returns: Json };
      tournament_review_payment: { Args: { p_registration: string; p_decision: string; p_reason?: string | null }; Returns: Json };
      courtside_authorize: { Args: { p_install_id: string; p_token_hash: string; p_session_id: string }; Returns: boolean };
      search_zero_rate: { Args: { p_hours: number }; Returns: { searches: number; zero_results: number; zero_pct: number | null }[] };
      court_data_quality: { Args: Record<string, never>; Returns: { total_verdicts: number; confirmed: number; denied: number; unknown: number; coverage_pct: number | null; median_age_days: number | null; stale_pct: number | null; disagreement_pct: number | null; evidence_per_verdict: number | null; verifying_now: number }[] };
      ranking_data_quality: { Args: Record<string, never>; Returns: { snapshot_days: number; latest_snapshot: string | null; hours_since_latest: number | null; players_in_latest: number; sports_covered: number }[] };
      courtside_fleet_status: { Args: Record<string, never>; Returns: { registered: number; app_open: number; on_live_session: number; in_active_play: number }[] };
      courtside_device_tiers: { Args: Record<string, never>; Returns: { install_id: string; tier: string; session_id: string | null; last_seen_at: string }[] };
      code_lock_seconds: { Args: { p_bucket: string }; Returns: number };
      note_code_failure: { Args: { p_bucket: string; p_max: number; p_window_seconds: number; p_lock_seconds: number }; Returns: number };
      clear_code_attempts: { Args: { p_bucket: string }; Returns: undefined };
      account_active_for_email: { Args: { p_email: string }; Returns: boolean };
      shift_tournament_plan: { Args: { p_tournament: string; p_shift: string }; Returns: undefined };
    };
    Enums: {
      verification_status: VerificationStatus;
      match_status: MatchStatus;
      result_status: ResultStatus;
      join_status: JoinStatus;
      report_reason: ReportReason;
      moderation_status: ModerationStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];
