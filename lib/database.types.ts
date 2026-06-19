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
        };
        Update: {
          max_uses?: number;
          uses?: number;
          note?: string | null;
          owner_id?: string | null;
          active?: boolean;
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
          created_at: string;
          last_used_at: string | null;
        };
        Insert: {
          code: string;
          label?: string | null;
          active?: boolean;
          expires_at?: string | null;
        };
        Update: {
          label?: string | null;
          active?: boolean;
          expires_at?: string | null;
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
        Row: { id: string; name: string; sport_key: string; city: string | null; neighborhood: string | null; created_by: string; created_at: string };
        Insert: { id?: string; name: string; sport_key: string; city?: string | null; neighborhood?: string | null; created_by: string; created_at?: string };
        Update: { name?: string; city?: string | null; neighborhood?: string | null; created_by?: string };
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
