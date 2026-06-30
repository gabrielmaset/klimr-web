"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { accountActive } from "@/lib/guards";
import { SPORT_KEYS } from "@/lib/sports";
import { LEVELS, metersBetween } from "@/lib/queue";

type Admin = ReturnType<typeof createAdminClient>;
type Result = { ok?: true; error?: string };

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genCode(len = 6): string {
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return out;
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function sessionRow(admin: Admin, id: string) {
  const { data } = await admin
    .from("court_sessions")
    .select("id, organizer_id, status, win_cap, allow_guests, require_location, center_lat, center_lng, radius_m, title, event_id, event_only, require_approval")
    .eq("id", id)
    .maybeSingle();
  return data;
}

/** Resolve the session a court belongs to and assert the caller organizes it. */
async function organizerGuardByCourt(admin: Admin, courtId: string, userId: string) {
  const { data: court } = await admin.from("queue_courts").select("id, session_id, team_size, label").eq("id", courtId).maybeSingle();
  if (!court) return { error: "Court not found." as string };
  const s = await sessionRow(admin, court.session_id);
  if (!s) return { error: "Session not found." };
  if (s.organizer_id !== userId) return { error: "Only the organizer can do that." };
  return { court, session: s };
}

const cleanLevels = (raw: string[]) => raw.filter((l) => LEVELS.some((x) => x.key === l));

// ---------- setup ----------

export async function createSession(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/queue/new");
  if (!(await accountActive(supabase, user.id))) redirect("/");

  const admin = createAdminClient();
  const eventId = (formData.get("eventId") as string) || null;
  let sportKey = String(formData.get("sport") || "");
  let title = String(formData.get("title") || "").trim();

  if (eventId) {
    const { data: ev } = await admin.from("events").select("title, sport_key").eq("id", eventId).maybeSingle();
    if (ev) {
      if (!title) title = ev.title;
      if (!SPORT_KEYS.includes(sportKey)) sportKey = ev.sport_key;
    }
  }
  if (!SPORT_KEYS.includes(sportKey)) sportKey = "beach_volleyball";
  if (!title) title = "Pickup session";

  const winCap = Math.min(10, Math.max(1, parseInt(String(formData.get("winCap") || "1"), 10) || 1));
  const teamSize = Math.min(8, Math.max(1, parseInt(String(formData.get("courtSize") || "4"), 10) || 4));
  const levels = cleanLevels(formData.getAll("levels").map(String));
  const allowGuests = formData.get("allowGuests") != null;
  const requireLocation = formData.get("requireLocation") != null;
  const requireApproval = formData.get("requireApproval") != null;
  const eventOnly = formData.get("eventOnly") != null && !!eventId;

  // unique code with a few retries
  let sessionId = "";
  for (let attempt = 0; attempt < 6 && !sessionId; attempt++) {
    const code = genCode();
    const { data, error } = await admin
      .from("court_sessions")
      .insert({ code, event_id: eventId, organizer_id: user.id, title, sport_key: sportKey, win_cap: winCap, allow_guests: allowGuests, require_location: requireLocation, event_only: eventOnly, require_approval: requireApproval })
      .select("id")
      .single();
    if (!error && data) sessionId = data.id;
    else if (error && error.code !== "23505") break; // non-uniqueness error: stop
  }
  if (!sessionId) redirect("/queue/new?error=1");

  await admin.from("queue_courts").insert({ session_id: sessionId, label: "Court 1", team_size: teamSize, levels, sort: 0 });
  redirect(`/queue/${sessionId}`);
}

export async function addCourt(formData: FormData): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in first." };
  const admin = createAdminClient();
  const sessionId = String(formData.get("sessionId") || "");
  const s = await sessionRow(admin, sessionId);
  if (!s) return { error: "Session not found." };
  if (s.organizer_id !== userId) return { error: "Only the organizer can add courts." };

  const teamSize = Math.min(8, Math.max(1, parseInt(String(formData.get("courtSize") || "4"), 10) || 4));
  const levels = cleanLevels(formData.getAll("levels").map(String));
  const { count } = await admin.from("queue_courts").select("id", { count: "exact", head: true }).eq("session_id", sessionId);
  const n = (count ?? 0) + 1;
  const label = String(formData.get("label") || "").trim() || `Court ${n}`;
  await admin.from("queue_courts").insert({ session_id: sessionId, label, team_size: teamSize, levels, sort: n - 1 });
  revalidatePath(`/queue/${sessionId}`);
  return { ok: true };
}

export async function updateCourt(formData: FormData): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in first." };
  const admin = createAdminClient();
  const courtId = String(formData.get("courtId") || "");
  const guard = await organizerGuardByCourt(admin, courtId, userId);
  if (guard.error) return { error: guard.error };

  const patch: { label?: string; team_size?: number; levels?: string[] } = {};
  const label = String(formData.get("label") || "").trim();
  if (label) patch.label = label;
  if (formData.get("courtSize") != null) patch.team_size = Math.min(8, Math.max(1, parseInt(String(formData.get("courtSize")), 10) || 4));
  if (formData.getAll("levels").length || formData.get("levelsSet") != null) patch.levels = cleanLevels(formData.getAll("levels").map(String));
  await admin.from("queue_courts").update(patch).eq("id", courtId);
  revalidatePath(`/queue/${guard.session!.id}`);
  return { ok: true };
}

export async function removeCourt(formData: FormData): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in first." };
  const admin = createAdminClient();
  const courtId = String(formData.get("courtId") || "");
  const guard = await organizerGuardByCourt(admin, courtId, userId);
  if (guard.error) return { error: guard.error };
  await admin.from("queue_courts").delete().eq("id", courtId);
  revalidatePath(`/queue/${guard.session!.id}`);
  return { ok: true };
}

export async function startSession(formData: FormData): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in first." };
  const admin = createAdminClient();
  const sessionId = String(formData.get("sessionId") || "");
  const s = await sessionRow(admin, sessionId);
  if (!s) return { error: "Session not found." };
  if (s.organizer_id !== userId) return { error: "Only the organizer can start the session." };

  const patch: { status: string; center_lat?: number; center_lng?: number } = { status: "live" };
  const lat = parseFloat(String(formData.get("lat") || ""));
  const lng = parseFloat(String(formData.get("lng") || ""));
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    patch.center_lat = lat;
    patch.center_lng = lng;
  }
  await admin.from("court_sessions").update(patch).eq("id", sessionId);
  revalidatePath(`/queue/${sessionId}`);
  return { ok: true };
}

export async function endSession(formData: FormData): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in first." };
  const admin = createAdminClient();
  const sessionId = String(formData.get("sessionId") || "");
  const s = await sessionRow(admin, sessionId);
  if (!s) return { error: "Session not found." };
  if (s.organizer_id !== userId) return { error: "Only the organizer can end the session." };
  await admin.from("court_sessions").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", sessionId);
  revalidatePath(`/queue/${sessionId}`);
  return { ok: true };
}

export async function setLocation(formData: FormData): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in first." };
  const admin = createAdminClient();
  const sessionId = String(formData.get("sessionId") || "");
  const s = await sessionRow(admin, sessionId);
  if (!s) return { error: "Session not found." };
  if (s.organizer_id !== userId) return { error: "Only the organizer can set the location." };
  const lat = parseFloat(String(formData.get("lat") || ""));
  const lng = parseFloat(String(formData.get("lng") || ""));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { error: "Couldn't read your location." };
  await admin.from("court_sessions").update({ center_lat: lat, center_lng: lng }).eq("id", sessionId);
  revalidatePath(`/queue/${sessionId}`);
  return { ok: true };
}

// ---------- joining (validate → place or request) ----------

type CourtLite = { id: string; session_id: string; team_size: number };
type Member = { user_id?: string; guest_name?: string };
type Session = NonNullable<Awaited<ReturnType<typeof sessionRow>>>;

/** Every gate that must pass before a person may join or request to join. */
async function validateJoin(admin: Admin, court: CourtLite, s: Session, member: Member, coords: { lat?: number; lng?: number }): Promise<Result> {
  if (s.status !== "live") return { error: "This session hasn't opened the queue yet." };
  if (!member.user_id && !s.allow_guests) return { error: "Walk-up sign-ups are turned off for this session." };

  if (s.require_location && s.center_lat != null && s.center_lng != null) {
    if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return { error: "location_required" };
    const dist = metersBetween(coords.lat as number, coords.lng as number, s.center_lat, s.center_lng);
    if (dist > s.radius_m) return { error: `You're ${Math.round(dist)}m away — you need to be within ${s.radius_m}m to join.` };
  }

  if (s.event_only) {
    if (!s.event_id) return { error: "This queue is limited to event RSVPs." };
    if (!member.user_id) return { error: "This queue is only for players who RSVP'd to the event. Sign in and RSVP to join." };
    const { data: rsvp } = await admin.from("event_rsvps").select("user_id").eq("event_id", s.event_id).eq("user_id", member.user_id).maybeSingle();
    if (!rsvp) return { error: "RSVP to the event first, then you can join this queue." };
  }

  if (member.user_id) {
    const { data: active } = await admin.from("queue_teams").select("id").eq("session_id", court.session_id).neq("status", "done");
    const ids = (active ?? []).map((t) => t.id);
    if (ids.length) {
      const { data: existing } = await admin.from("queue_team_members").select("id").eq("user_id", member.user_id).in("team_id", ids).maybeSingle();
      if (existing) return { error: "You're already in a team this session. Leave it first to switch courts." };
    }
    const { data: pend } = await admin.from("queue_join_requests").select("id").eq("session_id", court.session_id).eq("user_id", member.user_id).eq("status", "pending").maybeSingle();
    if (pend) return { error: "Your join request is already waiting for approval." };
  }
  return { ok: true };
}

/** Find an open forming team (oldest with a free slot) or open a new one, then add the member. */
async function placeOnTeam(admin: Admin, court: CourtLite, member: Member): Promise<Result> {
  const { data: forming } = await admin.from("queue_teams").select("id, created_at").eq("court_id", court.id).eq("status", "forming").order("created_at");
  let targetId = "";
  let currentCount = 0;
  if ((forming ?? []).length) {
    const fIds = (forming ?? []).map((t) => t.id);
    const { data: fm } = await admin.from("queue_team_members").select("team_id").in("team_id", fIds);
    const counts = new Map<string, number>();
    for (const m of fm ?? []) counts.set(m.team_id, (counts.get(m.team_id) ?? 0) + 1);
    for (const t of forming ?? []) {
      if ((counts.get(t.id) ?? 0) < court.team_size) {
        targetId = t.id;
        currentCount = counts.get(t.id) ?? 0;
        break;
      }
    }
  }
  if (!targetId) {
    const { data: created, error } = await admin.from("queue_teams").insert({ session_id: court.session_id, court_id: court.id, status: "forming" }).select("id").single();
    if (error || !created) return { error: "Couldn't open a team." };
    targetId = created.id;
    currentCount = 0;
  }

  const { error: memErr } = await admin.from("queue_team_members").insert({ team_id: targetId, user_id: member.user_id ?? null, guest_name: member.guest_name ?? null, session_id: court.session_id });
  if (memErr) return { error: "Couldn't join — try again." };

  if (currentCount + 1 >= court.team_size) {
    await admin.from("queue_teams").update({ status: "queued", queued_at: new Date().toISOString(), hold_court: false }).eq("id", targetId);
  }
  return { ok: true };
}

/** Validate, then either place on a team now or file a pending request (approval mode). */
async function requestOrJoin(admin: Admin, courtId: string, member: Member, coords: { lat?: number; lng?: number }): Promise<Result & { sessionId?: string; pending?: boolean }> {
  const { data: court } = await admin.from("queue_courts").select("id, session_id, team_size").eq("id", courtId).maybeSingle();
  if (!court) return { error: "Court not found." };
  const s = await sessionRow(admin, court.session_id);
  if (!s) return { error: "Session not found." };

  const v = await validateJoin(admin, court, s, member, coords);
  if (v.error) return { error: v.error, sessionId: court.session_id };

  if (s.require_approval) {
    const { error } = await admin.from("queue_join_requests").insert({ session_id: court.session_id, court_id: court.id, user_id: member.user_id ?? null, guest_name: member.guest_name ?? null });
    if (error) return { error: error.code === "23505" ? "Your request is already waiting for approval." : "Couldn't send your request.", sessionId: court.session_id };
    return { ok: true, sessionId: court.session_id, pending: true };
  }

  const p = await placeOnTeam(admin, court, member);
  return p.error ? { error: p.error, sessionId: court.session_id } : { ok: true, sessionId: court.session_id };
}

export async function joinCourt(formData: FormData): Promise<Result & { pending?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };
  if (!(await accountActive(supabase, user.id))) return { error: "Your account isn't active." };

  const admin = createAdminClient();
  const courtId = String(formData.get("courtId") || "");
  const lat = parseFloat(String(formData.get("lat") || ""));
  const lng = parseFloat(String(formData.get("lng") || ""));
  const res = await requestOrJoin(admin, courtId, { user_id: user.id }, { lat, lng });
  if (res.sessionId) revalidatePath(`/queue/${res.sessionId}`);
  return res.error ? { error: res.error } : { ok: true, pending: res.pending };
}

export async function joinCourtGuest(formData: FormData): Promise<Result & { pending?: boolean }> {
  const admin = createAdminClient();
  const courtId = String(formData.get("courtId") || "");
  const name = String(formData.get("name") || "").trim().slice(0, 40);
  if (name.length < 2) return { error: "Enter your name." };
  const lat = parseFloat(String(formData.get("lat") || ""));
  const lng = parseFloat(String(formData.get("lng") || ""));
  const res = await requestOrJoin(admin, courtId, { guest_name: name }, { lat, lng });
  if (res.sessionId) revalidatePath(`/queue/${res.sessionId}`);
  return res.error ? { error: res.error } : { ok: true, pending: res.pending };
}

// ---------- leaving / management ----------

async function settleTeamAfterRemoval(admin: Admin, teamId: string, teamSize: number, status: string) {
  const { count } = await admin.from("queue_team_members").select("id", { count: "exact", head: true }).eq("team_id", teamId);
  const n = count ?? 0;
  if (n === 0) {
    await admin.from("queue_teams").delete().eq("id", teamId);
  } else if (status === "queued" && n < teamSize) {
    await admin.from("queue_teams").update({ status: "forming", queued_at: null, hold_court: false }).eq("id", teamId);
  }
}

export async function leaveTeam(formData: FormData): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in first." };
  const admin = createAdminClient();
  const teamId = String(formData.get("teamId") || "");
  const { data: team } = await admin.from("queue_teams").select("id, session_id, court_id, status").eq("id", teamId).maybeSingle();
  if (!team) return { error: "Team not found." };
  if (team.status === "playing") return { error: "You can't leave during a live match." };
  const { data: mem } = await admin.from("queue_team_members").select("id").eq("team_id", teamId).eq("user_id", userId).maybeSingle();
  if (!mem) return { error: "You're not on this team." };
  await admin.from("queue_team_members").delete().eq("id", mem.id);
  const { data: court } = await admin.from("queue_courts").select("team_size").eq("id", team.court_id).maybeSingle();
  await settleTeamAfterRemoval(admin, teamId, court?.team_size ?? 99, team.status);
  revalidatePath(`/queue/${team.session_id}`);
  return { ok: true };
}

export async function removeTeam(formData: FormData): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in first." };
  const admin = createAdminClient();
  const teamId = String(formData.get("teamId") || "");
  const { data: team } = await admin.from("queue_teams").select("id, session_id, status").eq("id", teamId).maybeSingle();
  if (!team) return { error: "Team not found." };
  const s = await sessionRow(admin, team.session_id);
  if (!s || s.organizer_id !== userId) return { error: "Only the organizer can remove teams." };
  if (team.status === "playing") return { error: "End the live match before removing this team." };
  await admin.from("queue_teams").delete().eq("id", teamId);
  revalidatePath(`/queue/${team.session_id}`);
  return { ok: true };
}

export async function removeMember(formData: FormData): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in first." };
  const admin = createAdminClient();
  const memberId = String(formData.get("memberId") || "");
  const { data: mem } = await admin.from("queue_team_members").select("id, team_id").eq("id", memberId).maybeSingle();
  if (!mem) return { error: "Member not found." };
  const { data: team } = await admin.from("queue_teams").select("id, session_id, court_id, status").eq("id", mem.team_id).maybeSingle();
  if (!team) return { error: "Team not found." };
  const s = await sessionRow(admin, team.session_id);
  if (!s || s.organizer_id !== userId) return { error: "Only the organizer can edit teams." };
  if (team.status === "playing") return { error: "End the live match before editing this team." };
  await admin.from("queue_team_members").delete().eq("id", memberId);
  const { data: court } = await admin.from("queue_courts").select("team_size").eq("id", team.court_id).maybeSingle();
  await settleTeamAfterRemoval(admin, team.id, court?.team_size ?? 99, team.status);
  revalidatePath(`/queue/${team.session_id}`);
  return { ok: true };
}

// ---------- the king-of-the-court engine ----------

export async function gameOver(formData: FormData): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in first." };
  const admin = createAdminClient();
  const matchId = String(formData.get("matchId") || "");
  const winnerId = String(formData.get("winnerTeamId") || "");
  const { data: match } = await admin.from("queue_matches").select("id, session_id, team_a, team_b, status").eq("id", matchId).maybeSingle();
  if (!match) return { error: "Match not found." };
  if (match.status !== "live") return { error: "That match is already finished." };
  const s = await sessionRow(admin, match.session_id);
  if (!s || s.organizer_id !== userId) return { error: "Only the organizer can record results." };
  if (winnerId !== match.team_a && winnerId !== match.team_b) return { error: "Pick one of the two teams." };

  const loserId = winnerId === match.team_a ? match.team_b : match.team_a;
  await admin.from("queue_matches").update({ status: "final", winner_team: winnerId, ended_at: new Date().toISOString() }).eq("id", matchId);
  await admin.from("queue_teams").update({ status: "done" }).eq("id", loserId);

  const { data: winner } = await admin.from("queue_teams").select("wins").eq("id", winnerId).maybeSingle();
  const newWins = (winner?.wins ?? 0) + 1;
  if (newWins >= s.win_cap) {
    await admin.from("queue_teams").update({ status: "done", wins: newWins }).eq("id", winnerId);
  } else {
    await admin.from("queue_teams").update({ status: "queued", wins: newWins, hold_court: true, queued_at: new Date().toISOString() }).eq("id", winnerId);
  }
  revalidatePath(`/queue/${match.session_id}`);
  return { ok: true };
}

export async function startNextMatch(formData: FormData): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in first." };
  const admin = createAdminClient();
  const courtId = String(formData.get("courtId") || "");
  const guard = await organizerGuardByCourt(admin, courtId, userId);
  if (guard.error) return { error: guard.error };
  const sessionId = guard.session!.id;

  const { data: liveExisting } = await admin.from("queue_matches").select("id").eq("court_id", courtId).eq("status", "live").maybeSingle();
  if (liveExisting) return { error: "A match is already live on this court." };

  const { data: queued } = await admin.from("queue_teams").select("id, hold_court, queued_at").eq("court_id", courtId).eq("status", "queued");
  const sorted = (queued ?? []).sort((a, b) => {
    if (a.hold_court !== b.hold_court) return a.hold_court ? -1 : 1;
    return (a.queued_at ?? "").localeCompare(b.queued_at ?? "");
  });
  if (sorted.length < 2) return { error: "Need at least two teams in the queue to start a match." };

  const teamA = sorted[0].id;
  const teamB = sorted[1].id;
  const { error: insErr } = await admin.from("queue_matches").insert({ session_id: sessionId, court_id: courtId, team_a: teamA, team_b: teamB, status: "live" });
  if (insErr) return { error: "Couldn't start the match — refresh and try again." };
  await admin.from("queue_teams").update({ status: "playing", hold_court: false }).in("id", [teamA, teamB]);
  revalidatePath(`/queue/${sessionId}`);
  return { ok: true };
}

// ---------- approval queue ----------

export async function approveRequest(formData: FormData): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in first." };
  const admin = createAdminClient();
  const requestId = String(formData.get("requestId") || "");
  const { data: req } = await admin.from("queue_join_requests").select("id, session_id, court_id, user_id, guest_name, status").eq("id", requestId).maybeSingle();
  if (!req) return { error: "Request not found." };
  const s = await sessionRow(admin, req.session_id);
  if (!s || s.organizer_id !== userId) return { error: "Only the organizer can approve players." };
  if (req.status !== "pending") return { error: "That request was already handled." };

  const { data: court } = await admin.from("queue_courts").select("id, session_id, team_size").eq("id", req.court_id).maybeSingle();
  if (!court) {
    await admin.from("queue_join_requests").update({ status: "denied", decided_at: new Date().toISOString() }).eq("id", requestId);
    revalidatePath(`/queue/${req.session_id}`);
    return { error: "That court was removed." };
  }

  // if the account already landed on a team meanwhile, just close the request
  if (req.user_id) {
    const { data: active } = await admin.from("queue_teams").select("id").eq("session_id", req.session_id).neq("status", "done");
    const ids = (active ?? []).map((t) => t.id);
    if (ids.length) {
      const { data: ex } = await admin.from("queue_team_members").select("id").eq("user_id", req.user_id).in("team_id", ids).maybeSingle();
      if (ex) {
        await admin.from("queue_join_requests").update({ status: "approved", decided_at: new Date().toISOString() }).eq("id", requestId);
        revalidatePath(`/queue/${req.session_id}`);
        return { ok: true };
      }
    }
  }

  const p = await placeOnTeam(admin, court, { user_id: req.user_id ?? undefined, guest_name: req.guest_name ?? undefined });
  if (p.error) return { error: p.error };
  await admin.from("queue_join_requests").update({ status: "approved", decided_at: new Date().toISOString() }).eq("id", requestId);
  revalidatePath(`/queue/${req.session_id}`);
  return { ok: true };
}

export async function denyRequest(formData: FormData): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in first." };
  const admin = createAdminClient();
  const requestId = String(formData.get("requestId") || "");
  const { data: req } = await admin.from("queue_join_requests").select("id, session_id, status").eq("id", requestId).maybeSingle();
  if (!req) return { error: "Request not found." };
  const s = await sessionRow(admin, req.session_id);
  if (!s || s.organizer_id !== userId) return { error: "Only the organizer can decline players." };
  if (req.status === "pending") {
    await admin.from("queue_join_requests").update({ status: "denied", decided_at: new Date().toISOString() }).eq("id", requestId);
  }
  revalidatePath(`/queue/${req.session_id}`);
  return { ok: true };
}

export async function cancelRequest(formData: FormData): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in first." };
  const admin = createAdminClient();
  const requestId = String(formData.get("requestId") || "");
  const { data: req } = await admin.from("queue_join_requests").select("id, session_id, user_id").eq("id", requestId).maybeSingle();
  if (!req) return { error: "Request not found." };
  if (req.user_id !== userId) return { error: "That isn't your request." };
  await admin.from("queue_join_requests").delete().eq("id", requestId);
  revalidatePath(`/queue/${req.session_id}`);
  return { ok: true };
}
