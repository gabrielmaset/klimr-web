import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { QSessionState, QTeam, QCourtState } from "@/lib/queue";

type Admin = ReturnType<typeof createAdminClient>;

type TeamRow = { id: string; court_id: string; status: string; wins: number; hold_court: boolean; queued_at: string | null; created_at: string };
type MemberRow = { team_id: string; user_id: string | null; guest_name: string | null };

/**
 * Assemble the full live state for a session: every court with its current match,
 * ordered queue, and forming (open) teams — plus the requesting user's place in line.
 * Reads with the service-role client; safe to call from the polling route and SSR.
 */
export async function loadSessionState(admin: Admin, sessionId: string, meId?: string | null): Promise<QSessionState | null> {
  const { data: s } = await admin
    .from("court_sessions")
    .select("id, event_id, code, title, sport_key, status, win_cap, allow_guests, require_location, event_only, require_approval, allow_full_teams, center_lat, center_lng, radius_m, organizer_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!s) return null;

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
