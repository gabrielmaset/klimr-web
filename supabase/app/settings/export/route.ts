import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPrivilegedClient } from "@/lib/privileged";

/** GET /settings/export — a portable copy of the signed-in member's own data.
 *
 *  KCDX-057. This route returned five things — profile, sports, own posts,
 *  preferences and an auth id — while `DATA-GOVERNANCE.md` enumerated nine
 *  categories and labelled them "SPECIFIED, NOT BUILT". A data-rights route that
 *  silently omits most of what the governance document promises is worse than an
 *  honest partial one: the member believes they have their data, and nobody is
 *  prompted to fulfil the rest.
 *
 *  So this now does two things it did not do before.
 *
 *  1. It covers the categories that can be answered accurately from rows this
 *     member owns: social graph both directions, content, play history, teams,
 *     commerce, communications metadata, safety reports they filed, devices.
 *
 *  2. It states what it does NOT cover, in the payload itself. A member reading
 *     `coverage.excluded` learns that message BODIES are end-to-end encrypted and
 *     cannot be exported server-side, that media are referenced by path rather
 *     than embedded, and that staff identities in moderation records are
 *     withheld — and it tells them how to ask for the rest. That inclusion /
 *     exclusion index is what turns a partial export into an honest one.
 *
 *  SHARED OBJECTS. A conversation, a match, a team belongs to several people.
 *  This export carries the member's own participation and metadata, never the
 *  other participants' contributions — which is why chats appear as thread
 *  metadata and not as transcripts.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  const uid = user.id;

  // Own-row reads throughout. The privileged client is used only where a row the
  // member is party to is not readable through their own grants — their own
  // moderation record, for instance — and never to reach another member's data.
  const priv = getPrivilegedClient({ reason: "export:self-service-dsar", actorId: uid, targetUserId: uid });

  // KRA-016: these coerced `data` and DISCARDED `{ error }` entirely. supabase-js
  // does not throw, so a schema, grant or policy regression turned one dataset
  // into an empty array and the route still returned a successful archive — the
  // worst possible shape for a data-rights response, because the member believes
  // they have their data and nobody is prompted to fulfil the rest.
  //
  // Failures are collected rather than thrown so the member still receives what
  // DID load, but the archive says plainly that it is incomplete and names what
  // is missing. A silent empty category is the thing being removed.
  const failures: { dataset: string; error: string }[] = [];
  // Every dataset this route ATTEMPTS, recorded so coverage can be compared with
  // the database's versioned declaration rather than with this same file.
  const attempted: string[] = [];
  const one = async <T,>(dataset: string, p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T | null> => {
    attempted.push(dataset);
    const { data, error } = await p;
    if (error) failures.push({ dataset, error: error.message });
    return data ?? null;
  };
  const many = async <T,>(dataset: string, p: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> => {
    attempted.push(dataset);
    const { data, error } = await p;
    if (error) failures.push({ dataset, error: error.message });
    return data ?? [];
  };

  const { data: organized } = await priv.from("court_sessions").select("id").eq("organizer_id", uid);
  const organizedSessionIds = (organized ?? []).map((s) => s.id);

  const [
    profile, sports, prefs,
    posts, comments,
    connections, follows, blocks, invitesSent,
    eventRegs, tournamentRegs, queueMembership, rankSnapshots,
    teams, listings, offers, providerApps,
    threads, notifications,
    incidentsAboutMyUploads, postReportsFiled, peopleReportsFiled, moderationOnMe, devices,
  ] = await Promise.all([
    one("profile_private", supabase.from("profile_private").select("*").eq("id", uid).maybeSingle()),
    many("player_sports", supabase.from("player_sports").select("*").eq("user_id", uid)),
    one("user_preferences", supabase.from("user_preferences").select("*").eq("user_id", uid).maybeSingle()),

    many("posts", supabase.from("posts").select("id, body, post_type, sport_key, audience, moderation_status, created_at").eq("author_id", uid)),
    many("post_comments", supabase.from("post_comments").select("id, post_id, body, created_at").eq("author_id", uid)),

    many("friendships", priv.from("friendships").select("requester_id, addressee_id, status, created_at, responded_at").or(`requester_id.eq.${uid},addressee_id.eq.${uid}`)),
    many("follows", priv.from("follows").select("follower_id, followee_id, created_at").or(`follower_id.eq.${uid},followee_id.eq.${uid}`)),
    many("blocks", priv.from("blocks").select("blocker_id, blocked_id, created_at").or(`blocker_id.eq.${uid},blocked_id.eq.${uid}`)),
    many("invite_codes", priv.from("invite_codes").select("code, note, uses, max_uses, active, created_at, last_used_at").eq("owner_id", uid)),

    many("event_rsvps", supabase.from("event_rsvps").select("event_id, status, created_at").eq("user_id", uid)),
    many("tournament_registrations", supabase.from("tournament_registrations").select("id, tournament_id, division_id, status, payment_status, created_at").eq("registrant_id", uid)),
    many("queue_team_members", priv.from("queue_team_members").select("team_id, user_id, joined_at").eq("user_id", uid)),
    many("rank_snapshots", priv.from("rank_snapshots").select("snap_date, sport_key, points, rank").eq("user_id", uid)),

    many("team_members", supabase.from("team_members").select("team_id, role, joined_at").eq("user_id", uid)),
    many("marketplace_listings", supabase.from("marketplace_listings").select("id, title, kind, mode, status, created_at").eq("listed_by", uid)),
    many("listing_offers", priv.from("listing_offers").select("id, listing_id, amount_cents, status, created_at").eq("buyer_id", uid)),
    many("provider_applications", supabase.from("provider_applications").select("id, role, status, review_note, reviewed_at, created_at").eq("user_id", uid)),

    // Metadata only: bodies are E2EE and the server holds ciphertext.
    many("conversation_reads", priv.from("conversation_reads").select("conversation_id, last_read_at").eq("user_id", uid)),
    many("notifications", supabase.from("notifications").select("id, kind, title, created_at, read_at").eq("user_id", uid)),

    // KRA-016: this was labelled `reports_i_filed`. It is not — it is incidents
    // raised about the member's OWN uploads. A member asking for the reports they
    // filed received a list of times they were the SUBJECT, which inverts the
    // meaning of the category, and the actual reports were never queried at all.
    many("incidents_about_my_uploads", priv.from("safety_incidents").select("id, kind, status, created_at").eq("uploader_id", uid)),
    many("reports_i_filed_posts", priv.from("post_reports").select("id, reason, status, created_at").eq("reporter_id", uid)),
    many("reports_i_filed_people", priv.from("reports").select("id, reason, status, created_at").eq("reporter_id", uid)),
    // Staff identity withheld, per DATA-GOVERNANCE: the member learns what was
    // done about them, not who did it.
    many("admin_actions", priv.from("admin_actions").select("action, detail, created_at").eq("target_user_id", uid)),
    // DATA-GOVERNANCE scopes devices to sessions the member ORGANIZES, so the link
    // is through court_sessions rather than a column on the device.
    many("courtside_devices", priv.from("courtside_devices").select("install_id, label, venue_name, first_seen_at, last_seen_at, retired_at, session_id").in("session_id", organizedSessionIds)),
  ]);

  // KFU-030: coverage and integrity are DIFFERENT questions and were previously
  // collapsed into one word. `query_integrity` says whether every query we ran
  // succeeded. `coverage_status` says whether we even attempted everything the
  // versioned inventory (migration 0285) declares we hold about a member — an
  // archive can have perfect query integrity and still be missing a category
  // nobody remembered to add here.
  const { data: declared, error: declaredErr } = await priv.rpc("export_declared_datasets");
  const declaredNames = (declared ?? []).map((d: { dataset_name: string }) => d.dataset_name);
  const attemptedNames = attempted;
  const missingFromArchive = declaredNames.filter((d: string) => !attemptedNames.includes(d));
  const coverageKnown = !declaredErr;

  const payload = {
    format_version: 4,
    coverage_status: !coverageKnown
      ? "unknown"
      : missingFromArchive.length === 0
        ? "complete"
        : "partial",
    missing_datasets: missingFromArchive,
    query_integrity: failures.length === 0 ? "ok" : "degraded",
    // KRA-016: the archive states its own completeness. `complete: false` with a
    // named list is a truthful partial export; a successful-looking archive with
    // a silently empty category is not.
    status: failures.length === 0 && coverageKnown && missingFromArchive.length === 0
      ? "complete"
      : "incomplete",
    incomplete_datasets: failures,
    exported_at: new Date().toISOString(),
    account: { id: uid, email: user.email, created_at: user.created_at },

    identity: { profile, sports, preferences: prefs },
    social: { connections, follows, blocks, invites_sent: invitesSent },
    content: { posts, comments },
    play: { event_registrations: eventRegs, tournament_registrations: tournamentRegs, queue_participation: queueMembership, rank_snapshots: rankSnapshots },
    teams,
    commerce: { listings, offers_made: offers, professional_status_requests: providerApps },
    communications: { threads, notifications },
    safety: {
      reports_i_filed: { posts: postReportsFiled, people: peopleReportsFiled },
      incidents_about_my_uploads: incidentsAboutMyUploads,
      actions_taken_about_me: moderationOnMe,
    },
    devices,

    coverage: {
      included: [
        "identity", "social", "content", "play", "teams",
        "commerce", "communications (metadata)", "safety", "devices",
      ],
      excluded: [
        {
          what: "Chat message bodies",
          why: "Messages are end-to-end encrypted. The server stores ciphertext and cannot decrypt it, so a server-side export cannot contain them. They are readable on your own devices, where the keys are.",
        },
        {
          what: "Uploaded media files",
          why: "Photos and documents are referenced by storage path rather than embedded. Ask support for a media bundle and we will produce one.",
        },
        {
          what: "Other participants' contributions to shared objects",
          why: "A conversation, match or team belongs to several people. This export carries your own participation, not theirs.",
        },
        {
          what: "Staff identities in moderation records",
          why: "You can see what was decided about your account; the individual reviewer is withheld.",
        },
        {
          what: "Authentication secrets",
          why: "Password hashes and TOTP seeds are never exported, to anyone, including you.",
        },
      ],
      request_anything_else: "support@klimr.com — a verified manual fulfilment covers anything this file does not.",
    },
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="klimr-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
