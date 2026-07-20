import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { QSessionState, QTeam, QCourtState } from "@/lib/queue";
import type { Database } from "@/lib/database.types";

type Admin = ReturnType<typeof createAdminClient>;

type TeamRow = { id: string; court_id: string; status: string; wins: number; hold_court: boolean; queued_at: string | null; created_at: string };
type MemberRow = { team_id: string; user_id: string | null; guest_name: string | null };


/** Wipe a session's play state (teams, matches, join requests) while keeping its
 *  courts, settings, geofence centre and — critically — its public code, so any
 *  printed QR / courtside link keeps working across days. The one shared reset
 *  used by the organizer reset, the event-level off switch, and restarts. */
export async function clearSessionPlay(admin: Admin, sessionId: string): Promise<void> {
  // Members cascade when their team is deleted.
  await admin.from("queue_matches").delete().eq("session_id", sessionId);
  await admin.from("queue_teams").delete().eq("session_id", sessionId);
  await admin.from("queue_join_requests").delete().eq("session_id", sessionId);
}

/** Update a session, tolerating a not-yet-applied 0124: if Postgres rejects
 *  the unknown `paused_by` column, retry once without it. The queue keeps
 *  working; only "paused by <name>" waits for the migration. Returns the final
 *  error message, or null on success. */
type SessionUpdate = Database["public"]["Tables"]["court_sessions"]["Update"];

export async function sessionPatch(
  admin: Admin,
  sessionId: string,
  patch: SessionUpdate,
): Promise<string | null> {
  const { error } = await admin.from("court_sessions").update(patch).eq("id", sessionId);
  if (!error) return null;
  if ("paused_by" in patch && /paused_by/.test(error.message)) {
    console.error("[queue] paused_by missing — apply migration 0124. Retrying without it.");
    const { paused_by: _omit, ...rest } = patch;
    void _omit;
    const { error: e2 } = await admin.from("court_sessions").update(rest).eq("id", sessionId);
    return e2 ? e2.message : null;
  }
  return error.message;
}

const SESSION_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function sessionCode(len = 6): string {
  let out = "";
  for (let i = 0; i < len; i++) out += SESSION_CODE_CHARS[Math.floor(Math.random() * SESSION_CODE_CHARS.length)];
  return out;
}

/** Full wipe — Gabriel's OFF semantics: play state, courts, and tuned settings
 *  all go; the queue "must be set up again" (Turn on re-seeds Court 1 and the
 *  organizer tunes from defaults). Only the session row, its public code, and
 *  the event link survive so printed QR posters keep working week to week. */
export async function wipeSession(admin: Admin, sessionId: string): Promise<void> {
  await clearSessionPlay(admin, sessionId);
  await admin.from("queue_courts").delete().eq("session_id", sessionId);
  await sessionPatch(admin, sessionId, { status: "ended", ended_at: new Date().toISOString(), paused: false, paused_by: null, win_cap: 1, allow_guests: true, require_location: true, require_approval: false, allow_full_teams: false });
}

/** ON semantics: one tap → playing. Creates the session on first use (seeding
 *  Court 1), re-seeds Court 1 after a wipe, clears any stale play state, and
 *  goes live unpaused. Returns the session id. */
export type QueueOwner = { eventId: string | null; tournamentId: string | null };

export async function ensureQueueLive(
  admin: Admin,
  owner: QueueOwner,
  organizerId: string,
): Promise<{ id: string | null; error: string | null }> {
  const ownerCol = owner.eventId ? "event_id" : "tournament_id";
  const ownerId = owner.eventId ?? owner.tournamentId;
  if (!ownerId) return { id: null, error: "Missing owner." };
  const mintFresh = async (): Promise<{ id: string | null; error: string | null }> => {
    const { data: ev } = await admin.from(owner.eventId ? "events" : "tournaments").select("title, sport_key").eq("id", ownerId).maybeSingle();
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await admin
        .from("court_sessions")
        .insert({ code: sessionCode(), event_id: owner.eventId, organizer_id: organizerId, title: ev?.title ?? "Live queue", sport_key: ev?.sport_key ?? "tennis", status: "live", ...(owner.tournamentId ? { tournament_id: owner.tournamentId } : {}) })
        .select("id")
        .maybeSingle();
      if (data?.id) return { id: data.id, error: null };
      if (error && error.code !== "23505") {
        console.error("[queue] session insert failed:", error.message);
        return { id: null, error: error.message };
      }
    }
    return { id: null, error: "Couldn't allocate a session code." };
  };

  const { data: existing } = await admin
    .from("court_sessions")
    .select("id, status")
    .eq(ownerCol, ownerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let sessionId = existing?.id ?? null;
  if (!sessionId) {
    const minted = await mintFresh();
    if (!minted.id) return minted;
    sessionId = minted.id;
  } else {
    // Revive the existing session — then VERIFY the revival actually took.
    // Legacy sessions from earlier lifecycles can be unrevivable in ways no
    // single write reports (triggers, constraint drift, half-applied schema).
    // If the row won't verifiably read back as live, retire it and mint fresh:
    // Turn on must work on every event, not just clean ones. (The old walk-up
    // code retires with it — nothing playable was attached to it anyway.)
    if (existing!.status === "ended") await clearSessionPlay(admin, sessionId);
    const err = await sessionPatch(admin, sessionId, { status: "live", paused: false, paused_by: null, ended_at: null });
    const { data: check } = await admin.from("court_sessions").select("status").eq("id", sessionId).maybeSingle();
    if (err || check?.status !== "live") {
      console.error("[queue] legacy session unrevivable — minting fresh", { sessionId, err, readBack: check?.status ?? null });
      await sessionPatch(admin, sessionId, { status: "ended", ended_at: new Date().toISOString() });
      const minted = await mintFresh();
      if (!minted.id) return { id: null, error: minted.error ?? err ?? "Couldn't revive or replace the session." };
      sessionId = minted.id;
    }
  }

  // No auto-seeded court: after Turn on the organizer sets up as many courts
  // as needed, named their way (Court 1, Court A, Green Court…).
  const { error: flagErr } = owner.eventId
    ? await admin.from("events").update({ queue_enabled: true }).eq("id", ownerId)
    : await admin.from("tournaments").update({ queue_enabled: true }).eq("id", ownerId);
  if (flagErr) {
    console.error("[queue] flag write failed:", flagErr.message);
    return { id: sessionId, error: `Queue is live but the event flag failed: ${flagErr.message}` };
  }
  return { id: sessionId, error: null };
}

const IDLE_RETIRE_MS = 12 * 60 * 60 * 1000;

/** Lazy auto-retire: a live session idle for 6+ hours ends itself the next time
 *  anyone reads it ("activity" = session created, a team formed, a match started
 *  or finished). Any in-flight match is finalised (no winner) so an ended session
 *  can never carry a zombie "live" match into a restart. Runs on every read path —
 *  the polling API, SSR queue pages, AND the event page — so a stale session can
 *  never look "on" anywhere. Returns true if it retired the session just now. */
export async function retireSessionIfStale(
  admin: Admin,
  s: { id: string; status: string; created_at: string },
): Promise<boolean> {
  if (s.status !== "live") return false;
  const [{ data: lastMatchRows }, { data: lastTeamRows }] = await Promise.all([
    admin.from("queue_matches").select("started_at, ended_at").eq("session_id", s.id).order("started_at", { ascending: false }).limit(1),
    admin.from("queue_teams").select("created_at").eq("session_id", s.id).order("created_at", { ascending: false }).limit(1),
  ]);
  const times: number[] = [new Date(s.created_at).getTime()];
  const lm = (lastMatchRows ?? [])[0] as { started_at: string | null; ended_at: string | null } | undefined;
  if (lm?.started_at) times.push(new Date(lm.started_at).getTime());
  if (lm?.ended_at) times.push(new Date(lm.ended_at).getTime());
  const lt = (lastTeamRows ?? [])[0] as { created_at: string | null } | undefined;
  if (lt?.created_at) times.push(new Date(lt.created_at).getTime());
  if (Date.now() - Math.max(...times) <= IDLE_RETIRE_MS) return false;
  // 12h idle = the automatic OFF: identical to the organizer's own Turn off —
  // full wipe (play state, courts, tuned settings), code survives.
  await wipeSession(admin, s.id);
  // One-switch rule: for event-linked sessions the event's queue toggle mirrors
  // the session. The day ending — by idle retire or by hand — reads as OFF on
  // the event page; "Turn on" next week goes straight back to live.
  const { data: sess } = await admin.from("court_sessions").select("event_id, tournament_id").eq("id", s.id).maybeSingle();
  if (sess?.event_id) {
    await admin.from("events").update({ queue_enabled: false }).eq("id", sess.event_id);
  } else if (sess?.tournament_id) {
    await admin.from("tournaments").update({ queue_enabled: false }).eq("id", sess.tournament_id);
  }
  return true;
}

/**
 * Assemble the full live state for a session: every court with its current match,
 * ordered queue, and forming (open) teams — plus the requesting user's place in line.
 * Reads with the service-role client; safe to call from the polling route and SSR.
 */
export async function loadSessionState(admin: Admin, sessionId: string, meId?: string | null): Promise<QSessionState | null> {
  const { data: s } = await admin
    .from("court_sessions")
    .select("id, event_id, code, title, sport_key, status, win_cap, allow_guests, require_location, event_only, require_approval, allow_full_teams, paused, paused_by, tournament_id, team_name_mode, center_lat, center_lng, radius_m, organizer_id, created_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (!s) return null;

  if (await retireSessionIfStale(admin, s)) s.status = "ended";

  const [{ data: courts }, { data: teams }, { data: matches }, { data: requests }] = await Promise.all([
    admin.from("queue_courts").select("id, label, team_size, levels, sort, created_at, closed_at").eq("session_id", sessionId).order("sort").order("created_at"),
    admin.from("queue_teams").select("id, court_id, status, wins, hold_court, queued_at, created_at").eq("session_id", sessionId).neq("status", "done"),
    admin.from("queue_matches").select("id, court_id, team_a, team_b, started_at").eq("session_id", sessionId).eq("status", "live"),
    admin.from("queue_join_requests").select("id, court_id, user_id, guest_name, created_at").eq("session_id", sessionId).eq("status", "pending").order("created_at"),
  ]);

  const reqRows = (requests ?? []) as { id: string; court_id: string; user_id: string | null; guest_name: string | null }[];

  const teamRows = (teams ?? []) as TeamRow[];
  const teamIds = teamRows.map((t) => t.id);

  let members: MemberRow[] = [];
  if (teamIds.length) {
    const { data: mem } = await admin.from("queue_team_members").select("team_id, user_id, guest_name, joined_at").in("team_id", teamIds).order("joined_at");
    members = (mem ?? []) as MemberRow[];
  }
  const userIds = [...new Set([...members.map((m) => m.user_id), ...reqRows.map((r) => r.user_id)].filter(Boolean) as string[])];
  let profById = new Map<string, string>();
  if (s.paused_by && !userIds.includes(s.paused_by)) userIds.push(s.paused_by);
  if (userIds.length) {
    const { data: profs } = await admin.from("profiles").select("id, display_name").in("id", userIds);
    profById = new Map((profs ?? []).map((p) => [p.id, p.display_name || "Player"]));
  }

  const membersByTeam = new Map<string, MemberRow[]>();
  for (const m of members) {
    const arr = membersByTeam.get(m.team_id) ?? [];
    arr.push(m);
    membersByTeam.set(m.team_id, arr);
  }

  const buildTeam = (t: TeamRow, size: number): QTeam => {
    const mem = (membersByTeam.get(t.id) ?? []).map((m) => ({
      name: m.user_id ? profById.get(m.user_id) ?? "Player" : m.guest_name ?? "Guest",
      isGuest: !m.user_id,
      you: !!meId && m.user_id === meId,
    }));
    return { id: t.id, members: mem, wins: t.wins, hold: t.hold_court, size, count: mem.length, queuedAt: t.created_at };
  };

  const teamById = new Map(teamRows.map((t) => [t.id, t]));
  const liveByCourt = new Map((matches ?? []).map((m) => [m.court_id, m]));

  const courtStates: QCourtState[] = (courts ?? []).map((c) => {
    const size = c.team_size;
    const courtTeams = teamRows.filter((t) => t.court_id === c.id);

    const live = liveByCourt.get(c.id);
    let current: QCourtState["current"] = null;
    if (live) {
      const a = teamById.get(live.team_a);
      const b = teamById.get(live.team_b);
      if (a && b) current = { matchId: live.id, startedAt: live.started_at, a: buildTeam(a, size), b: buildTeam(b, size) };
    }

    const queued = courtTeams
      .filter((t) => t.status === "queued")
      .sort((a, b) => {
        if (a.hold_court !== b.hold_court) return a.hold_court ? -1 : 1; // a staying winner is next
        return (a.created_at ?? "").localeCompare(b.created_at ?? ""); // fair: anchor on when the team's first player joined
      });
    const forming = courtTeams.filter((t) => t.status === "forming").sort((a, b) => a.created_at.localeCompare(b.created_at));

    return {
      id: c.id,
      label: c.label,
      teamSize: size,
      levels: c.levels ?? [],
      current,
      queue: queued.map((t) => buildTeam(t, size)),
      forming: forming.map((t) => buildTeam(t, size)),
      closed: !!c.closed_at,
    };
  });

  // requesting user's spot
  let me: QSessionState["me"] = null;
  if (meId) {
    const myMember = members.find((m) => m.user_id === meId);
    if (myMember) {
      const t = teamById.get(myMember.team_id);
      if (t) {
        let place: number | null = null;
        if (t.status === "queued") {
          const courtState = courtStates.find((c) => c.id === t.court_id);
          const idx = courtState ? courtState.queue.findIndex((q) => q.id === t.id) : -1;
          place = idx >= 0 ? idx + 1 : null;
        }
        me = { teamId: t.id, courtId: t.court_id, status: t.status, place };
      }
    }
  }

  const pending = reqRows.map((r) => ({
    id: r.id,
    courtId: r.court_id,
    name: r.user_id ? profById.get(r.user_id) ?? "Player" : r.guest_name ?? "Guest",
    isGuest: !r.user_id,
  }));
  let myPending: QSessionState["myPending"] = null;
  if (meId) {
    const mine = reqRows.find((r) => r.user_id === meId);
    if (mine) myPending = { id: mine.id, courtId: mine.court_id };
  }

  return {
    session: {
      id: s.id,
      eventId: s.event_id,
      tournamentId: s.tournament_id,
      teamNameMode: (s.team_name_mode === "first_player" || s.team_name_mode === "initials" ? s.team_name_mode : "letters") as "letters" | "first_player" | "initials",
      code: s.code,
      title: s.title,
      sportKey: s.sport_key,
      status: s.status,
      winCap: s.win_cap,
      allowGuests: s.allow_guests,
      requireLocation: s.require_location,
      eventOnly: s.event_only,
      requireApproval: s.require_approval,
      allowFullTeams: s.allow_full_teams,
      paused: s.paused,
      pausedByName: s.paused && s.paused_by ? (profById.get(s.paused_by) ?? null) : null,
      centerLat: s.center_lat,
      centerLng: s.center_lng,
      radiusM: s.radius_m,
      organizerId: s.organizer_id,
    },
    courts: courtStates,
    pending,
    me,
    myPending,
  };
}
