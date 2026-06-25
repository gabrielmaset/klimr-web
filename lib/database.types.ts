// Klimr database types (Phase 1) — matches supabase/migrations/0001_init.sql.
// Once your Supabase project is live, regenerate with:
//   npx supabase gen types typescript --project-id <your-id> > lib/database.types.ts

export type VerificationStatus = "unverified" | "pending" | "verified";
export type MatchStatus = "open" | "scheduled" | "completed" | "disputed" | "void";
export type ResultStatus = "pending" | "confirmed" | "void";
export type JoinStatus = "pending" | "accepted" | "declined" | "waitlisted";
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
      profiles: {
        Row: {
          id: string;
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
          reliability: number;
          avatar_hue: number;
          avatar_path: string | null;
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
          created_at: string;
          last_seen_at: string | null;
          presence_mode: string;
        };
        Insert: {
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
        };
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
        };
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
          updated_at: string;
        };
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
          updated_at?: string;
        };
        Update: {
          points?: number;
          skill_rating?: number | null;
          matches_played?: number;
          wins?: number;
          skill_level?: string;
          preferred_format?: string;
          handedness?: string | null;
          updated_at?: string;
        };
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
          created_at: string;
        };
        Insert: {
          id?: string;
          match_id: string;
          requester_id: string;
          status?: JoinStatus;
          waitlist_position?: number | null;
          created_at?: string;
        };
        Update: { status?: JoinStatus; waitlist_position?: number | null };
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
      posts: {
        Row: {
          id: string;
          author_id: string;
          body: string | null;
          sport_key: string | null;
          match_id: string | null;
          moderation_status: ModerationStatus;
          moderation_labels: string[] | null;
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
          created_at?: string;
        };
        Update: {
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
          created_at: string;
        };
        Insert: {
          id?: string;
          post_id: string;
          author_id: string;
          body: string;
          moderation_status?: ModerationStatus;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          action: string;
          target_user_id?: string | null;
          target_ref?: string | null;
          detail?: string | null;
          created_at?: string;
        };
        Update: { detail?: string | null };
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
          updated_at: string;
        };
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
          updated_at?: string;
        };
        Update: {
          notif_match_invites?: boolean;
          notif_ranking_changes?: boolean;
          notif_region_challenges?: boolean;
          notif_marketplace_events?: boolean;
          email_digest?: string;
          profile_visibility?: string;
          location_precision?: string;
          who_can_invite?: string;
          updated_at?: string;
        };
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
          created_at?: string;
        };
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
      conversations: {
        Row: { id: string; match_id: string; created_by: string | null; created_at: string; expires_at: string | null };
        Insert: { id?: string; match_id: string; created_by?: string | null; created_at?: string; expires_at?: string | null };
        Update: { expires_at?: string | null };
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
        Row: { id: string; name: string; sport_key: string; city: string | null; neighborhood: string | null; zip: string | null; state: string | null; max_size: number | null; category: string; created_by: string; created_at: string };
        Insert: { id?: string; name: string; sport_key: string; city?: string | null; neighborhood?: string | null; zip?: string | null; state?: string | null; max_size?: number | null; category?: string; created_by: string; created_at?: string };
        Update: { name?: string; city?: string | null; neighborhood?: string | null; zip?: string | null; state?: string | null; max_size?: number | null; category?: string; created_by?: string };
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
          status: string;
          entry_type: string;
          visibility: string;
          summary: string | null;
          description: string | null;
          starts_at: string | null;
          ends_at: string | null;
          timezone: string | null;
          location_name: string | null;
          location_address: string | null;
          location_zip: string | null;
          location_lat: number | null;
          location_lng: number | null;
          location_place_id: string | null;
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
        };
        Insert: {
          id?: string;
          owner_id: string;
          code: string;
          title: string;
          sport_key: string;
          status?: string;
          entry_type?: string;
          visibility?: string;
          summary?: string | null;
          description?: string | null;
          starts_at?: string | null;
          ends_at?: string | null;
          timezone?: string | null;
          location_name?: string | null;
          location_address?: string | null;
          location_zip?: string | null;
          location_lat?: number | null;
          location_lng?: number | null;
          location_place_id?: string | null;
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
        };
        Update: {
          title?: string;
          sport_key?: string;
          status?: string;
          entry_type?: string;
          visibility?: string;
          summary?: string | null;
          description?: string | null;
          starts_at?: string | null;
          ends_at?: string | null;
          timezone?: string | null;
          location_name?: string | null;
          location_address?: string | null;
          location_zip?: string | null;
          location_lat?: number | null;
          location_lng?: number | null;
          location_place_id?: string | null;
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
        Row: { id: string; tournament_id: string; name: string; description: string | null; fee_cents: number; fee_basis: string; capacity: number | null; group_count: number | null; group_size: number | null; sort_order: number; created_at: string; updated_at: string };
        Insert: { id?: string; tournament_id: string; name: string; description?: string | null; fee_cents?: number; fee_basis?: string; capacity?: number | null; group_count?: number | null; group_size?: number | null; sort_order?: number; created_at?: string; updated_at?: string };
        Update: { name?: string; description?: string | null; fee_cents?: number; fee_basis?: string; capacity?: number | null; group_count?: number | null; group_size?: number | null; sort_order?: number; updated_at?: string };
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
        Row: { id: string; tournament_id: string; label: string; description: string | null; field_type: string; options: Json; required: boolean; scope: string; sort_order: number; created_at: string };
        Insert: { id?: string; tournament_id: string; label: string; description?: string | null; field_type?: string; options?: Json; required?: boolean; scope?: string; sort_order?: number; created_at?: string };
        Update: { label?: string; description?: string | null; field_type?: string; options?: Json; required?: boolean; scope?: string; sort_order?: number };
        Relationships: [];
      };
      tournament_registrations: {
        Row: { id: string; tournament_id: string; division_id: string | null; team_id: string | null; registrant_id: string; status: string; payment_status: string; team_answers: Json; waitlist_position: number | null; created_at: string; updated_at: string };
        Insert: { id?: string; tournament_id: string; division_id?: string | null; team_id?: string | null; registrant_id: string; status?: string; payment_status?: string; team_answers?: Json; waitlist_position?: number | null; created_at?: string; updated_at?: string };
        Update: { division_id?: string | null; team_id?: string | null; status?: string; payment_status?: string; team_answers?: Json; waitlist_position?: number | null; updated_at?: string };
        Relationships: [];
      };
      tournament_registration_players: {
        Row: { id: string; registration_id: string; tournament_id: string; user_id: string; is_reserve: boolean; played: boolean | null; waiver_accepted_at: string | null; waiver_version: string | null; rules_accepted_at: string | null; rules_version: string | null; player_answers: Json; confirmed_at: string | null; created_at: string };
        Insert: { id?: string; registration_id: string; tournament_id: string; user_id: string; is_reserve?: boolean; played?: boolean | null; waiver_accepted_at?: string | null; waiver_version?: string | null; rules_accepted_at?: string | null; rules_version?: string | null; player_answers?: Json; confirmed_at?: string | null; created_at?: string };
        Update: { is_reserve?: boolean; played?: boolean | null; waiver_accepted_at?: string | null; waiver_version?: string | null; rules_accepted_at?: string | null; rules_version?: string | null; player_answers?: Json; confirmed_at?: string | null };
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
          rating: number | null;
          rating_count: number | null;
          is_private: boolean;
          website: string | null;
          created_at: string;
        };
        Insert: {
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
          created_by: string | null;
          created_at: string;
        };
        Insert: {
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
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          starts_at?: string;
          ends_at?: string | null;
          capacity?: number | null;
          cost_text?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      event_rsvps: {
        Row: { event_id: string; user_id: string; created_at: string };
        Insert: { event_id: string; user_id: string; created_at?: string };
        Update: { created_at?: string };
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
        };
        Update: { title?: string; price_text?: string | null; price_cents?: number | null; description?: string | null; status?: string };
        Relationships: [];
      };
      saved_listings: {
        Row: { user_id: string; listing_id: string; created_at: string };
        Insert: { user_id: string; listing_id: string; created_at?: string };
        Update: { created_at?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
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
      chat_unread_count: { Args: Record<string, never>; Returns: number };
      claim_live_search: { Args: { p_month: string; p_cap: number }; Returns: boolean };
      generate_invite_codes: { Args: { p_count: number; p_max_uses?: number; p_note?: string | null }; Returns: string[] };
      generate_investor_codes: { Args: { p_count: number; p_note?: string | null }; Returns: string[] };
      check_rate_limit: { Args: { p_key: string; p_max: number; p_window_seconds: number }; Returns: boolean };
      code_lock_seconds: { Args: { p_bucket: string }; Returns: number };
      note_code_failure: { Args: { p_bucket: string; p_max: number; p_window_seconds: number; p_lock_seconds: number }; Returns: number };
      clear_code_attempts: { Args: { p_bucket: string }; Returns: undefined };
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
