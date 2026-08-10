"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createHash, randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearSessionPlay, wipeSession, ensureQueueLive, sessionPatch } from "@/lib/queue-state";
import { accountActive } from "@/lib/guards";
import { SPORT_KEYS } from "@/lib/sports";
import { LEVELS, metersBetween, formationsFor, formatDistance, prefersImperial } from "@/lib/queue";
import { pickupMatchPoints } from "@/lib/ranking";
import { recomputePlayerPoints } from "@/lib/points";
import type { Database } from "@/lib/database.types";

type Admin = ReturnType<typeof createAdminClient>;
type Result = { ok?: true; error?: string };

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genCode(len = 6): string {
  // Codes are credentials — crypto-grade randomness, not Math.random.
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
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
    .select("id, organizer_id, status, win_cap, allow_guests, require_location, center_lat, center_lng, radius_m, title, event_id, event_only, require_approval, allow_full_teams, paused, paused_by, tournament_id, sport_key")
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

  let eventCourtId: string | null = null;
  if (eventId) {
    const { data: ev } = await admin.from("events").select("title, sport_key, court_id").eq("id", eventId).maybeSingle();
    if (ev) {
      if (!title) title = ev.title;
      if (!SPORT_KEYS.includes(sportKey)) sportKey = ev.sport_key;
      eventCourtId = ev.court_id ?? null;
    }
  }
  if (!SPORT_KEYS.includes(sportKey)) sportKey = "beach_volleyball";
  if (!title) title = "Pickup session";

  const winCap = Math.min(10, Math.max(1, parseInt(String(formData.get("winCap") || "1"), 10) || 1));
  const teamNameModeRaw = String(formData.get("teamNameMode") || "letters");
  const teamNameMode = teamNameModeRaw === "first_player" || teamNameModeRaw === "initials" ? teamNameModeRaw : "letters";
  const firstCourtLabel = String(formData.get("courtLabel") || "").trim().slice(0, 40) || "Court 1";
  const teamSize = Math.min(8, Math.max(1, parseInt(String(formData.get("courtSize") || "4"), 10) || 4));
  const levels = cleanLevels(formData.getAll("levels").map(String));
  const allowGuests = formData.get("allowGuests") != null;
  const requireLocation = formData.get("requireLocation") != null;
  const requireApproval = formData.get("requireApproval") != null;
  const eventOnly = formData.get("eventOnly") != null && !!eventId;
  const allowFullTeams = formData.get("allowFullTeams") != null;
  // Venue link (0148): the organizer's explicit pick wins; sessions spun up
  // from an event inherit the event's court automatically.
  const venueRaw = String(formData.get("venueCourtId") || "").trim();
  let venueCourtId: string | null = null;
  if (/^[0-9a-f-]{36}$/i.test(venueRaw)) {
    const { data: vc } = await admin.from("courts").select("id").eq("id", venueRaw).maybeSingle();
    venueCourtId = vc?.id ?? null;
  }
  const linkedCourtId = venueCourtId ?? eventCourtId;
  const centerLat = parseFloat(String(formData.get("centerLat") || ""));
  const centerLng = parseFloat(String(formData.get("centerLng") || ""));
  const hasCenter = requireLocation && Number.isFinite(centerLat) && Number.isFinite(centerLng);

  // One queue per event: if this event already has a session (any status), send
  // the organizer there instead of minting a second one — a duplicate would fork
  // the public code and quietly kill any printed QR posters from earlier weeks.
  if (eventId) {
    const { data: existing } = await admin.from("court_sessions").select("id").eq("event_id", eventId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existing) redirect(`/queue/${existing.id}`);
  }

  // unique code with a few retries
  let sessionId = "";
  for (let attempt = 0; attempt < 6 && !sessionId; attempt++) {
    const code = genCode();
    const base = { code, event_id: eventId, organizer_id: user.id, title, sport_key: sportKey, status: "live", win_cap: winCap, court_id: linkedCourtId, ...(teamNameMode !== "letters" ? { team_name_mode: teamNameMode } : {}), allow_guests: allowGuests, require_location: requireLocation, event_only: eventOnly, require_approval: requireApproval, allow_full_teams: allowFullTeams, center_lat: hasCenter ? centerLat : null, center_lng: hasCenter ? centerLng : null };
    let { data, error } = await admin
      .from("court_sessions")
      .insert({ ...base, display_code: genCode() })
      .select("id")
      .single();
    if (error && error.code !== "23505" && /display_code/.test(error.message)) {
      console.error("[queue] display_code missing — apply migration 0128. Retrying without it.");
      ({ data, error } = await admin.from("court_sessions").insert(base).select("id").single());
    }
    if (!error && data) sessionId = data.id;
    else if (error && error.code !== "23505") break; // non-uniqueness error: stop
  }
  if (!sessionId) redirect("/queue/new?error=1");

  await admin.from("queue_courts").insert({ session_id: sessionId, label: firstCourtLabel, team_size: teamSize, levels, sort: 0 });
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
  if (formData.get("courtSize") != null) {
    const wanted = Math.min(8, Math.max(1, parseInt(String(formData.get("courtSize")), 10) || 4));
    const allowed = formationsFor(guard.session!.sport_key);
    if (!allowed.includes(wanted)) return { error: "That formation isn't available for this sport." };
    patch.team_size = wanted;
  }
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
  if (s.event_id) await admin.from("events").update({ queue_enabled: true }).eq("id", s.event_id);
  else if (s.tournament_id) await admin.from("tournaments").update({ queue_enabled: true }).eq("id", s.tournament_id);
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
  // OFF is a full reset by design: play state, courts, and tuned settings clear;
  // the code survives for the printed QR. Turn on re-seeds Court 1.
  await wipeSession(admin, sessionId);
  if (s.event_id) await admin.from("events").update({ queue_enabled: false }).eq("id", s.event_id);
  else if (s.tournament_id) await admin.from("tournaments").update({ queue_enabled: false }).eq("id", s.tournament_id);
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
  if (s.paused) {
    let who = "The organizer";
    if (s.paused_by) {
      const { data: prof } = await admin.from("profiles").select("display_name").eq("id", s.paused_by).maybeSingle();
      if (prof?.display_name) who = prof.display_name;
    }
    return { error: `${who} has paused the games — joining reopens when play resumes.` };
  }
  if (!member.user_id && !s.allow_guests) return { error: "Walk-up sign-ups are turned off for this session." };

  if (s.require_location && s.center_lat != null && s.center_lng != null) {
    if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return { error: "location_required" };
    const dist = metersBetween(coords.lat as number, coords.lng as number, s.center_lat, s.center_lng);
    if (dist > s.radius_m) {
      const imp = prefersImperial((await headers()).get("accept-language"));
      return { error: `You're ${formatDistance(dist, imp)} away — you need to be within ${formatDistance(s.radius_m, imp)} to join.` };
    }
  }

  if (s.event_only) {
    if (!s.event_id) return { error: "This queue is limited to event RSVPs." };
    if (!member.user_id) return { error: "This queue is only for players who RSVP'd to the event. Sign in and RSVP to join." };
    const { data: rsvp } = await admin.from("event_rsvps").select("user_id").eq("event_id", s.event_id).eq("user_id", member.user_id).eq("status", "going").maybeSingle();
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

/** Place a member on a team at this court — ATOMIC (K2-01, migration 0176).
 *
 *  The whole read-then-write now happens inside one transaction in
 *  `public.place_on_team()`, serialized by TWO advisory locks: session+user
 *  first, then the court (0219). The court lock alone could not enforce "one
 *  team per person per session" — two taps on two courts took two different
 *  locks and both placed. The old
 *  multi-statement version raced: two joins fired at the same instant on an
 *  empty court both found "no forming team" and both opened one, stranding two
 *  players on separate half-empty teams (reproduced in a scratch Postgres
 *  cluster before the fix). `idempotencyKey` makes a retry or double-tap
 *  return the original team instead of adding the member twice. */
async function placeOnTeam(admin: Admin, court: CourtLite, member: Member, idempotencyKey?: string | null): Promise<Result> {
  const { error } = await admin.rpc("place_on_team", {
    p_court_id: court.id,
    p_user_id: member.user_id ?? null,
    p_guest_name: member.guest_name ?? null,
    p_idempotency_key: idempotencyKey ?? null,
  });
  if (error) {
    // KCDX-040: `already_in_session` is now raised by the command itself, after
    // the session+user lock — the TypeScript check above it can pass and this
    // still refuse, which is the whole point. It is a normal outcome (two taps,
    // two courts), not a failure, so it gets the message rather than the
    // generic one.
    if (error.message.includes("already_in_session")) {
      return { error: "You're already in a team this session. Leave it first to switch courts." };
    }
    console.error("[queue] place_on_team failed", error.message);
    return { error: "Couldn't join — try again." };
  }
  return { ok: true };
}

/** Validate, then either place on a team now or file a pending request (approval mode). */
async function requestOrJoin(admin: Admin, courtId: string, member: Member, coords: { lat?: number; lng?: number }): Promise<Result & { sessionId?: string; pending?: boolean }> {
  const { data: court } = await admin.from("queue_courts").select("id, session_id, team_size, closed_at").eq("id", courtId).maybeSingle();
  if (!court) return { error: "Court not found." };
  if (court.closed_at) return { error: "This court is closed.", sessionId: court.session_id };
  const s = await sessionRow(admin, court.session_id);
  if (!s) return { error: "Session not found." };

  const v = await validateJoin(admin, court, s, member, coords);
  if (v.error) return { error: v.error, sessionId: court.session_id };

  if (s.require_approval) {
    const { error } = await admin.from("queue_join_requests").insert({ session_id: court.session_id, court_id: court.id, user_id: member.user_id ?? null, guest_name: member.guest_name ?? null });
    if (error) return { error: error.code === "23505" ? "Your request is already waiting for approval." : "Couldn't send your request.", sessionId: court.session_id };
    return { ok: true, sessionId: court.session_id, pending: true };
  }

  // KCDX-040: the idempotency key was optional and never supplied, so a
  // double-tap or a retried request placed the member twice. Derived from the
  // facts of the join, not generated per call — a RETRY of the same join must
  // produce the same key, which a random uuid never would.
  const p = await placeOnTeam(admin, court, member, `join:${court.id}:${member.user_id ?? `g:${member.guest_name ?? ""}`}`);
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
  const name = String(formData.get("name") || "").trim().slice(0, 16);
  if (name.length < 2) return { error: "Enter your name." };
  const lat = parseFloat(String(formData.get("lat") || ""));
  const lng = parseFloat(String(formData.get("lng") || ""));
  const res = await requestOrJoin(admin, courtId, { guest_name: name }, { lat, lng });
  if (res.sessionId) revalidatePath(`/queue/${res.sessionId}`);
  return res.error ? { error: res.error } : { ok: true, pending: res.pending };
}

/** Drop a COMPLETE team straight into the queue (when the organizer allows it). The team's
 *  anchor is now; fairness vs. a forming team is handled by ordering on created_at. */
export async function joinCourtFullTeam(formData: FormData): Promise<Result> {
  const admin = createAdminClient();
  const courtId = String(formData.get("courtId") || "");
  const names = formData
    .getAll("names")
    .map((n) => String(n).trim().slice(0, 16))
    .filter((n) => n.length >= 1);
  const lat = parseFloat(String(formData.get("lat") || ""));
  const lng = parseFloat(String(formData.get("lng") || ""));

  const { data: court } = await admin.from("queue_courts").select("id, session_id, team_size, closed_at").eq("id", courtId).maybeSingle();
  if (!court) return { error: "Court not found." };
  if (court.closed_at) return { error: "This court is closed." };
  const s = await sessionRow(admin, court.session_id);
  if (!s) return { error: "Session not found." };
  if (!s.allow_full_teams) return { error: "Full-team sign-ups aren't enabled for this session." };
  if (names.length !== court.team_size) return { error: `A full team needs exactly ${court.team_size} player${court.team_size === 1 ? "" : "s"}.` };

  // shared on-site / session checks (status, walk-ups allowed, geofence, event-only)
  const v = await validateJoin(admin, { id: court.id, session_id: court.session_id, team_size: court.team_size }, s, { guest_name: names[0] }, { lat, lng });
  if (v.error) return { error: v.error };

  const { data: team, error: tErr } = await admin
    .from("queue_teams")
    .insert({ session_id: court.session_id, court_id: court.id, status: "queued", queued_at: new Date().toISOString(), hold_court: false })
    .select("id")
    .single();
  if (tErr || !team) return { error: "Couldn't add your team — try again." };
  const { error: mErr } = await admin.from("queue_team_members").insert(names.map((n) => ({ team_id: team.id, guest_name: n, session_id: court.session_id })));
  if (mErr) {
    await admin.from("queue_teams").delete().eq("id", team.id); // roll back the empty team
    return { error: "Couldn't add your team — try again." };
  }
  revalidatePath(`/queue/${court.session_id}`);
  return { ok: true };
}

/** Organizer toggle: allow complete teams to join the line at once. */
export async function setAllowFullTeams(formData: FormData): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in first." };
  const admin = createAdminClient();
  const sessionId = String(formData.get("sessionId") || "");
  const on = formData.get("on") === "1";
  const s = await sessionRow(admin, sessionId);
  if (!s || s.organizer_id !== userId) return { error: "Only the organizer can change this." };
  await admin.from("court_sessions").update({ allow_full_teams: on }).eq("id", sessionId);
  revalidatePath(`/queue/${sessionId}`);
  return { ok: true };
}

/** Pause or resume a live queue. Paused holds everyone in place (no joins, no new
 *  matches) without ending the session. */
export async function setPaused(formData: FormData): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in first." };
  const admin = createAdminClient();
  const sessionId = String(formData.get("sessionId") || "");
  const on = formData.get("on") === "1";
  const s = await sessionRow(admin, sessionId);
  if (!s || s.organizer_id !== userId) return { error: "Only the organizer can change this." };
  await sessionPatch(admin, sessionId, { paused: on, paused_by: on ? userId : null });
  revalidatePath(`/queue/${sessionId}`);
  return { ok: true };
}

/** Turn the queue off and reset it: clear every team, match, and pending request,
 *  and return the session to 'setup' so the next start begins completely fresh.
 *  The session row (and its walk-up code/link) is kept, as are the courts. */
export async function resetSession(formData: FormData): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in first." };
  const admin = createAdminClient();
  const sessionId = String(formData.get("sessionId") || "");
  const s = await sessionRow(admin, sessionId);
  if (!s || s.organizer_id !== userId) return { error: "Only the organizer can do that." };
  await clearSessionPlay(admin, sessionId);
  await admin.from("court_sessions").update({ status: "setup", paused: false, ended_at: null }).eq("id", sessionId);
  revalidatePath(`/queue/${sessionId}`);
  return { ok: true };
}

/** Bring an ended (or reset) session back for a fresh day of play: same courts,
 *  same settings, same public code — just a clean slate of teams and matches.
 *  This is what "Start a new session" means; plain startSession would resurrect
 *  whatever stale play state the old day left behind. */
export async function restartSession(formData: FormData): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in first." };
  const admin = createAdminClient();
  const sessionId = String(formData.get("sessionId") || "");
  const s = await sessionRow(admin, sessionId);
  if (!s || s.organizer_id !== userId) return { error: "Only the organizer can do that." };
  if (s.event_id || s.tournament_id) {
    const revived = await ensureQueueLive(admin, { eventId: s.event_id, tournamentId: s.tournament_id }, s.organizer_id);
    if (revived.error) return { error: revived.error };
  } else {
    await clearSessionPlay(admin, sessionId);
    await sessionPatch(admin, sessionId, { status: "live", paused: false, paused_by: null, ended_at: null, activated_at: new Date().toISOString() });
  }
  revalidatePath(`/queue/${sessionId}`);
  return { ok: true };
}

/** Update session-level settings post-creation. Only the fields present in the
 *  form are touched, so each control can save just its own slice. */
/** Rotate BOTH credentials — the public join code and the courtside display
 *  code. Printed QRs die, and every open courtside screen self-ejects to its
 *  setup screen on the next poll (the display compares the code it was entered
 *  with against the session's current one). For when a code leaks. */
export async function resetSessionCodes(formData: FormData): Promise<{ ok?: true; error?: string }> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in first." };
  const admin = createAdminClient();
  const sessionId = String(formData.get("sessionId") || "");
  const s = await sessionRow(admin, sessionId);
  if (!s) return { error: "Session not found." };
  if (s.organizer_id !== userId) return { error: "Only the organizer can reset codes." };

  for (let attempt = 0; attempt < 6; attempt++) {
    let { error } = await admin.from("court_sessions").update({ code: genCode(), display_code: genCode() }).eq("id", sessionId);
    if (error && error.code !== "23505" && /display_code/.test(error.message)) {
      ({ error } = await admin.from("court_sessions").update({ code: genCode() }).eq("id", sessionId));
    }
    if (!error) {
      revalidatePath(`/queue/${sessionId}`);
      if (s.event_id) revalidatePath(`/events/${s.event_id}`);
      if (s.tournament_id) revalidatePath(`/tournament/${s.tournament_id}`);
      return { ok: true };
    }
    if (error.code !== "23505") return { error: error.message };
  }
  return { error: "Couldn't allocate fresh codes — try again." };
}

export async function updateSessionSettings(formData: FormData): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in first." };
  const admin = createAdminClient();
  const sessionId = String(formData.get("sessionId") || "");
  const s = await sessionRow(admin, sessionId);
  if (!s) return { error: "Session not found." };
  if (s.organizer_id !== userId) return { error: "Only the organizer can change settings." };

  const patch: Database["public"]["Tables"]["court_sessions"]["Update"] = {};

  if (formData.has("title")) {
    const t = String(formData.get("title") || "").trim();
    if (t.length < 2) return { error: "Give the session a name." };
    patch.title = t.slice(0, 80);
  }
  if (formData.has("winCap")) {
    const wc = parseInt(String(formData.get("winCap") || "1"), 10);
    patch.win_cap = Math.max(1, Math.min(10, Number.isFinite(wc) ? wc : 1));
  }
  if (formData.has("teamNameMode")) {
    const v = String(formData.get("teamNameMode"));
    if (v === "letters" || v === "first_player" || v === "initials") patch.team_name_mode = v;
  }
  if (formData.has("allowGuests")) patch.allow_guests = formData.get("allowGuests") === "1";
  if (formData.has("requireApproval")) patch.require_approval = formData.get("requireApproval") === "1";
  if (formData.has("allowFullTeams")) patch.allow_full_teams = formData.get("allowFullTeams") === "1";
  if (formData.has("eventOnly")) patch.event_only = formData.get("eventOnly") === "1";
  if (formData.has("requireLocation")) {
    const on = formData.get("requireLocation") === "1";
    patch.require_location = on;
    if (on) {
      const lat = parseFloat(String(formData.get("centerLat") || ""));
      const lng = parseFloat(String(formData.get("centerLng") || ""));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return { error: "Allow location access to turn on the on-site check, then try again." };
      }
      patch.center_lat = lat;
      patch.center_lng = lng;
    }
  }

  if (Object.keys(patch).length === 0) return { ok: true };
  await admin.from("court_sessions").update(patch).eq("id", sessionId);
  revalidatePath(`/queue/${sessionId}`);
  return { ok: true };
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sessionIdByCode(admin: Admin, code: string): Promise<string | null> {
  const { data } = await admin.from("court_sessions").select("id").eq("code", code.toUpperCase()).maybeSingle();
  return data?.id ?? null;
}

type MatchRow = { id: string; session_id: string; team_a: string; team_b: string; status: string };

/** Core result-recording logic (winner stays under the win cap, otherwise re-forms). No auth here. */
async function applyGameOver(admin: Admin, match: MatchRow, winCap: number, winnerId: string): Promise<Result> {
  if (match.status !== "live") return { error: "That match is already finished." };
  if (winnerId !== match.team_a && winnerId !== match.team_b) return { error: "Pick one of the two teams." };
  const loserId = winnerId === match.team_a ? match.team_b : match.team_a;
  const nowIso = new Date().toISOString();

  // KCDX-041: this was eight separate writes — finalize, retire the loser, read
  // and rewrite the winner's win count, award the ledger, read-modify-write each
  // player's counters, recompute rankings, stamp the timestamp.
  //
  // The CAS on the first write looked protective and was the opposite: if the
  // invocation died after it, the match was FINAL and the other seven never
  // happened — and because the CAS then fails, no retry could ever repair it.
  // The winner never advanced, nobody got their points, and nothing recorded
  // that any of it was owed. Step five was separately wrong even when nothing
  // failed: read-modify-write on `matches_played`, so two courts finishing at
  // once with a shared player lost an increment.
  //
  // One transaction now. Either the match is finished and everyone has their
  // points, or nothing happened and this can safely be retried.
  void nowIso;
  void loserId;
  void winCap;
  const { data: res, error: finishErr } = await admin.rpc("queue_finish_match", {
    p_match: match.id,
    p_winner: winnerId,
  });
  const out = res as { ok?: boolean; error?: string; already_final?: boolean } | null;
  if (finishErr || !out?.ok) {
    return { error: out?.error === "winner_not_in_match" ? "Pick one of the two teams." : "Couldn\u2019t record that result — try again." };
  }

  revalidatePath(`/queue/${match.session_id}`);
  return { ok: true };
}

/** REMOVED (KCDX-041). `awardQueueMatchPoints` did the ledger upsert, the
 *  per-player read-modify-write of `matches_played`/`wins`, the ranking recompute
 *  and the timestamp — as four separate round trips after the match had already
 *  been finalized. All of it is inside `queue_finish_match` (0218) now, in the
 *  same transaction as the result it records. Deleted rather than left unused:
 *  a dead helper that still works is an invitation to call it again. */


/** Core next-match logic (holder first, then earliest queued). No auth here. */
async function applyStartNext(admin: Admin, courtId: string, sessionId: string): Promise<Result> {
  const { data: sess } = await admin.from("court_sessions").select("paused, status").eq("id", sessionId).maybeSingle();
  // The courtside screen operates by public code — the session state is the only
  // real gate, so it must be enforced here, not just hidden in the UI.
  if (!sess) return { error: "Session not found." };
  if (sess.status === "ended") return { error: "This session has ended." };
  if (sess.status !== "live") return { error: "The queue hasn't started yet." };
  if (sess.paused) {
    let who = "The organizer";
    const { data: full } = await admin.from("court_sessions").select("paused_by").eq("id", sessionId).maybeSingle();
    if (full?.paused_by) {
      const { data: prof } = await admin.from("profiles").select("display_name").eq("id", full.paused_by).maybeSingle();
      if (prof?.display_name) who = prof.display_name;
    }
    return { error: `${who} has paused the games — the current match can finish, but the next one waits.` };
  }

  const { data: liveExisting } = await admin.from("queue_matches").select("id").eq("court_id", courtId).eq("status", "live").maybeSingle();
  if (liveExisting) return { error: "A match is already live on this court." };

  const { data: queued } = await admin.from("queue_teams").select("id, hold_court, created_at").eq("court_id", courtId).eq("status", "queued");
  const sorted = (queued ?? []).sort((a, b) => {
    if (a.hold_court !== b.hold_court) return a.hold_court ? -1 : 1;
    return (a.created_at ?? "").localeCompare(b.created_at ?? ""); // fair: order by when each team's first player joined
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

export async function gameOver(formData: FormData): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in first." };
  const admin = createAdminClient();
  const matchId = String(formData.get("matchId") || "");
  const winnerId = String(formData.get("winnerTeamId") || "");
  const { data: match } = await admin.from("queue_matches").select("id, session_id, team_a, team_b, status").eq("id", matchId).maybeSingle();
  if (!match) return { error: "Match not found." };
  const s = await sessionRow(admin, match.session_id);
  if (!s || s.organizer_id !== userId) return { error: "Only the organizer can record results." };
  return applyGameOver(admin, match as MatchRow, s.win_cap, winnerId);
}

export async function startNextMatch(formData: FormData): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in first." };
  const admin = createAdminClient();
  const courtId = String(formData.get("courtId") || "");
  const guard = await organizerGuardByCourt(admin, courtId, userId);
  if (guard.error) return { error: guard.error };
  return applyStartNext(admin, courtId, guard.session!.id);
}

/* ---------- Courtside (kiosk) result-recording ----------------------------
 * KCDX-007. These used to be authorized by the session code alone: anyone who
 * could read a poster — or read the code out of a queue payload, which every
 * member could — was able to invoke the same service-role match mutations as
 * the venue's own display. Falsifying real-world results is the one thing that
 * would make Klimr's rankings worthless, so a printed string cannot be the
 * credential.
 *
 * The kiosk already registers per install and holds a server-minted token
 * (0180/0184). Every command below now proves that capability first: bound to
 * this session, unrevoked, and seen within ten minutes. The code still selects
 * WHICH session; it no longer grants permission to change it.
 */

/** Verify the caller holds a live Courtside capability for this session. */
async function operatorGuard(admin: Admin, formData: FormData, sessionId: string): Promise<string | null> {
  const installId = String(formData.get("installId") || "");
  const token = String(formData.get("deviceToken") || "");
  if (!UUID_RE.test(installId) || token.length < 20) return "This display isn't registered. Re-enter the code to set it up.";
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await admin.rpc("courtside_authorize", {
    p_install_id: installId,
    p_token_hash: tokenHash,
    p_session_id: sessionId,
  });
  if (error || data !== true) return "This display isn't authorized for this session. Re-enter the code to set it up.";
  return null;
}

export async function gameOverByCode(formData: FormData): Promise<Result> {
  const admin = createAdminClient();
  const code = String(formData.get("code") || "");
  const matchId = String(formData.get("matchId") || "");
  const winnerId = String(formData.get("winnerTeamId") || "");
  const sid = await sessionIdByCode(admin, code);
  if (!sid) return { error: "Session not found." };
  const denied = await operatorGuard(admin, formData, sid);
  if (denied) return { error: denied };
  const { data: match } = await admin.from("queue_matches").select("id, session_id, team_a, team_b, status").eq("id", matchId).maybeSingle();
  if (!match || match.session_id !== sid) return { error: "Match not found." };
  const s = await sessionRow(admin, sid);
  if (!s) return { error: "Session not found." };
  return applyGameOver(admin, match as MatchRow, s.win_cap, winnerId);
}

export async function startNextByCode(formData: FormData): Promise<Result> {
  const admin = createAdminClient();
  const code = String(formData.get("code") || "");
  const courtId = String(formData.get("courtId") || "");
  const sid = await sessionIdByCode(admin, code);
  if (!sid) return { error: "Session not found." };
  const denied = await operatorGuard(admin, formData, sid);
  if (denied) return { error: denied };
  const { data: court } = await admin.from("queue_courts").select("id, session_id").eq("id", courtId).maybeSingle();
  if (!court || court.session_id !== sid) return { error: "Court not found." };
  return applyStartNext(admin, courtId, sid);
}

/** A staying winner bows out: mark them done, then call the next two in line on. No auth here. */
async function applyWinnerStepDown(admin: Admin, teamId: string): Promise<Result> {
  {
    const { data: t } = await admin.from("queue_teams").select("session_id").eq("id", teamId).maybeSingle();
    if (t) {
      const { data: sess } = await admin.from("court_sessions").select("status").eq("id", t.session_id).maybeSingle();
      if (sess && sess.status !== "live") return { error: "This session isn't live." };
    }
  }
  const { data: t } = await admin.from("queue_teams").select("id, session_id, court_id, status").eq("id", teamId).maybeSingle();
  if (!t) return { error: "Team not found." };
  if (t.status === "playing") return { error: "That team is currently playing." };
  await admin.from("queue_teams").update({ status: "done", hold_court: false }).eq("id", teamId);
  // bring the next two in line on, if there are enough (ignore "need two teams" — stepping down still succeeded)
  await applyStartNext(admin, t.court_id, t.session_id);
  revalidatePath(`/queue/${t.session_id}`);
  return { ok: true };
}

export async function stepDownTeam(formData: FormData): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in first." };
  const admin = createAdminClient();
  const teamId = String(formData.get("teamId") || "");
  const { data: t } = await admin.from("queue_teams").select("id, session_id, status").eq("id", teamId).maybeSingle();
  if (!t) return { error: "Team not found." };
  const s = await sessionRow(admin, t.session_id);
  if (!s || s.organizer_id !== userId) return { error: "Only the organizer can do that." };
  return applyWinnerStepDown(admin, teamId);
}

export async function stepDownByCode(formData: FormData): Promise<Result> {
  const admin = createAdminClient();
  const code = String(formData.get("code") || "");
  const teamId = String(formData.get("teamId") || "");
  const sid = await sessionIdByCode(admin, code);
  if (!sid) return { error: "Session not found." };
  const denied = await operatorGuard(admin, formData, sid);
  if (denied) return { error: denied };
  const { data: t } = await admin.from("queue_teams").select("id, session_id, status").eq("id", teamId).maybeSingle();
  if (!t || t.session_id !== sid) return { error: "Team not found." };
  return applyWinnerStepDown(admin, teamId);
}

// ---------- end-of-day: close / reopen a court ----------

export async function closeCourt(formData: FormData): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in first." };
  const admin = createAdminClient();
  const courtId = String(formData.get("courtId") || "");
  const guard = await organizerGuardByCourt(admin, courtId, userId);
  if (guard.error) return { error: guard.error };
  const { data: live } = await admin.from("queue_matches").select("id").eq("court_id", courtId).eq("status", "live").maybeSingle();
  if (live) return { error: "Finish the current match before closing this court." };
  await admin.from("queue_courts").update({ closed_at: new Date().toISOString() }).eq("id", courtId);
  // clear anyone still waiting/forming so they don't linger in a closed line
  await admin.from("queue_teams").update({ status: "done", hold_court: false }).eq("court_id", courtId).neq("status", "done");
  revalidatePath(`/queue/${guard.session!.id}`);
  return { ok: true };
}

export async function reopenCourt(formData: FormData): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in first." };
  const admin = createAdminClient();
  const courtId = String(formData.get("courtId") || "");
  const guard = await organizerGuardByCourt(admin, courtId, userId);
  if (guard.error) return { error: guard.error };
  await admin.from("queue_courts").update({ closed_at: null }).eq("id", courtId);
  revalidatePath(`/queue/${guard.session!.id}`);
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

  // Keyed on the REQUEST, so approving the same request twice — two staff, two
  // taps — places once.
  const p = await placeOnTeam(admin, court, { user_id: req.user_id ?? undefined, guest_name: req.guest_name ?? undefined }, `approve:${req.id}`);
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

/** Venue-court search for the session setup picker — links the courtside app
 *  to a real court so the Courts map shows the queue LIVE. */
export async function searchVenueCourts(q: string): Promise<{ id: string; name: string; area: string | null }[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const term = q.trim();
  if (term.length < 2) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("courts")
    .select("id, name, neighborhood, city")
    .or(`name.ilike.%${term.replace(/[%,()]/g, "")}%,city.ilike.%${term.replace(/[%,()]/g, "")}%`)
    .order("name")
    .limit(8);
  return ((data ?? []) as { id: string; name: string; neighborhood: string | null; city: string | null }[]).map((c) => ({
    id: c.id,
    name: c.name,
    area: c.neighborhood ?? c.city,
  }));
}
