"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lookupZip, tzFromStateLng } from "@/lib/us-places";
import { SPORT_KEYS } from "@/lib/sports";
import type { Database, Json } from "@/lib/database.types";
import type { TournamentDraftPatch, DivisionInput, CustomFieldInput, PlanItemInput, TournamentFormatConfig, PublishedResults, Sponsor, Announcement } from "@/lib/tournament";
import { computePoolStandings, isRegistrationOpen, isSignupFormReady, poolSizes } from "@/lib/tournament";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";
import { placementPoints, bracketPlaces, ROLLING_WEEKS, ROLLING_BEST, RESERVE_FACTOR } from "@/lib/ranking";
import { notifyRegistration, notifyPayment } from "@/lib/emails/notify";
import { randomInt, randomUUID } from "node:crypto";

/** Mark any email-only waitlist entry matching this email as converted, so the
 *  person stops getting "spot opened" notifications once they've actually entered. */
async function convertEmailWaitlist(tournamentId: string, email: string | null | undefined): Promise<void> {
  if (!email) return;
  try {
    const admin = createAdminClient();
    await admin.from("tournament_waitlist").update({ status: "converted" }).eq("tournament_id", tournamentId).ilike("email", email).in("status", ["waiting", "invited"]);
  } catch {
    // best-effort; never block the signup
  }
}

/** Cryptographically unbiased Fisher–Yates shuffle (randomInt uses rejection
 *  sampling, so there's no modulo bias and no way to steer the result). */
function shuffle<T>(input: T[]): T[] {
  const a = input.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Smallest power of two >= n (min 2). */
function bracketSize(n: number): number {
  let s = 2;
  while (s < n) s *= 2;
  return s;
}

/** Standard single-elim seed order for a bracket of `size`. Returns seed numbers
 *  in bracket-position order so byes (the high seeds) spread evenly. Seats are
 *  filled with a random draw, so this only shapes the structure, not who wins. */
function seedOrder(size: number): number[] {
  let seeds = [1, 2];
  while (seeds.length < size) {
    const sum = seeds.length * 2 + 1;
    const next: number[] = [];
    for (const s of seeds) {
      next.push(s);
      next.push(sum - s);
    }
    seeds = next;
  }
  return seeds;
}

/** Build (and replace) a division's knockout matches from an ordered seed list of
 *  registration ids. Seeds fill standard bracket positions (so top seeds spread and
 *  pick up any byes), every round is created, byes auto-advance, and advancement
 *  links are set. Used for both the random single-elim draw and the merit-seeded
 *  knockout stage. */

async function buildBracketFromSeeds(supabase: Awaited<ReturnType<typeof createClient>>, tournamentId: string, divisionId: string, seeds: string[]) {
  await supabase.from("tournament_matches").delete().eq("division_id", divisionId).is("group_id", null);
  const n = seeds.length;
  if (n < 2) return { ok: false as const, error: "Need at least 2 entries to build a bracket." };
  const size = bracketSize(n);
  const order = seedOrder(size);
  const seat: (string | null)[] = order.map((s) => (s <= n ? seeds[s - 1] : null));
  const totalRounds = Math.round(Math.log2(size));

  type Cell = { a: string | null; b: string | null; status: string; winner: string | null };
  const grid: Cell[][] = [];
  const r0: Cell[] = [];
  for (let i = 0; i < size / 2; i++) {
    const a = seat[2 * i];
    const b = seat[2 * i + 1];
    let status = "pending";
    let winner: string | null = null;
    if (a && !b) {
      status = "completed";
      winner = a;
    } else if (!a && b) {
      status = "completed";
      winner = b;
    }
    r0.push({ a, b, status, winner });
  }
  grid.push(r0);
  for (let r = 1; r < totalRounds; r++) {
    const prev = grid[r - 1];
    const cur: Cell[] = [];
    for (let i = 0; i < prev.length / 2; i++) {
      cur.push({ a: prev[2 * i].winner, b: prev[2 * i + 1].winner, status: "pending", winner: null });
    }
    grid.push(cur);
  }

  const rows = grid.flatMap((round, r) =>
    round.map((c, i) => ({
      tournament_id: tournamentId,
      division_id: divisionId,
      group_id: null,
      bracket: "main",
      round: r + 1,
      slot: i,
      entry_a: c.a,
      entry_b: c.b,
      status: c.status,
      winner_id: c.winner,
      sort_order: r * 1000 + i,
    })),
  );
  const { data: inserted, error: insErr } = await supabase.from("tournament_matches").insert(rows).select("id, round, slot");
  if (insErr || !inserted) return { ok: false as const, error: insErr?.message ?? "Couldn't create the bracket." };
  const idByRC = new Map<string, string>();
  for (const m of inserted) idByRC.set(`${m.round}:${m.slot}`, m.id);
  for (let r = 0; r < grid.length - 1; r++) {
    const round = r + 1;
    const nextRound = r + 2;
    for (let i = 0; i < grid[r].length; i++) {
      const mid = idByRC.get(`${round}:${i}`);
      const nextId = idByRC.get(`${nextRound}:${Math.floor(i / 2)}`);
      if (!mid || !nextId) continue;
      await supabase.from("tournament_matches").update({ next_match_id: nextId, next_slot: i % 2 === 0 ? "a" : "b" }).eq("id", mid);
    }
  }
  return { ok: true as const };
}

// Short, URL-safe, unambiguous codes for /e/<code> (no 0/o/1/l/i to avoid confusion).
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
function makeCode(len = 6) {
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

/** Create a tournament from the full create-at-end wizard. Nothing is written
 *  until the organizer finishes setup, so abandoning the wizard leaves no row.
 *  Returns the new id (the client then routes into the workspace). */
export async function createTournamentFromWizard(
  patch: TournamentDraftPatch,
  agree: boolean,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: prof } = await supabase.from("profiles").select("verification_status").eq("id", user.id).maybeSingle();
  if (prof?.verification_status !== "verified") return { ok: false, error: "Get verified to host." };
  if (!agree) return { ok: false, error: "Please accept the organizer terms." };

  const title = (patch.title ?? "").trim();
  const sport = patch.sport_key ?? "";
  if (!title) return { ok: false, error: "Add a tournament name." };
  if (!SPORT_KEYS.includes(sport)) return { ok: false, error: "Pick a sport." };
  const entry_type = patch.entry_type === "individual" ? "individual" : "team";

  // Unique code with a few collision retries.
  let code = makeCode();
  for (let i = 0; i < 5; i++) {
    const { data: clash } = await supabase.from("tournaments").select("id").eq("code", code).maybeSingle();
    if (!clash) break;
    code = makeCode(i >= 2 ? 7 : 6);
  }

  // Build the row from the wizard patch (same whitelist as updateTournamentDraft),
  // forcing a private draft — the organizer publishes manually afterwards.
  const row: Database["public"]["Tables"]["tournaments"]["Insert"] = {
    owner_id: user.id,
    code,
    title,
    sport_key: sport,
    entry_type,
    status: "draft",
  };
  if (patch.summary !== undefined) row.summary = patch.summary;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.visibility === "public" || patch.visibility === "unlisted") row.visibility = patch.visibility;
  if (patch.starts_at !== undefined) row.starts_at = patch.starts_at;
  if (patch.ends_at !== undefined) row.ends_at = patch.ends_at;
  if (patch.timezone !== undefined) row.timezone = patch.timezone;
  if (patch.location_name !== undefined) row.location_name = patch.location_name;
  if (patch.location_address !== undefined) row.location_address = patch.location_address;
  if (patch.zip && /^\d{5}$/.test(patch.zip)) {
    row.location_zip = patch.zip;
    const z = lookupZip(patch.zip);
    if (z) {
      row.location_lat = z.lat;
      row.location_lng = z.lng;
      row.timezone = tzFromStateLng(z.state, z.lng);
    }
  }
  if (patch.weather_enabled !== undefined) row.weather_enabled = patch.weather_enabled;
  if (patch.capacity !== undefined) row.capacity = patch.capacity;
  if (patch.reserves_allowed !== undefined) row.reserves_allowed = patch.reserves_allowed;
  if (patch.min_women !== undefined) row.min_women = patch.min_women;
  if (patch.min_men !== undefined) row.min_men = patch.min_men;
  if (patch.registration_opens_at !== undefined) row.registration_opens_at = patch.registration_opens_at;
  if (patch.registration_deadline !== undefined) row.registration_deadline = patch.registration_deadline;
  if (patch.format_config !== undefined) row.format_config = patch.format_config as Json;

  const { data: created, error } = await supabase.from("tournaments").insert(row).select("id").single();
  if (error || !created) {
    console.error("[tournaments] create-from-wizard failed", error?.code, error?.message);
    return { ok: false, error: error?.message ?? "Couldn't create the event." };
  }
  return { ok: true, id: created.id };
}

/** Permanently delete a tournament (owner only). Cascades to registrations,
 *  divisions, payments, etc. Used by the event Settings page. */
export async function deleteTournament(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: t } = await supabase.from("tournaments").select("owner_id").eq("id", id).maybeSingle();
  if (!t) return { ok: false, error: "Not found." };
  if (t.owner_id !== user.id) return { ok: false, error: "Only the owner can delete this event." };

  const { error } = await supabase.from("tournaments").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Save a slice of the draft. RLS restricts writes to the owner / managers; this
 *  whitelists fields and sanitizes the enum-like ones. Returns a result so the
 *  wizard can show an inline "saved" / error state without a full navigation. */
export async function updateTournamentDraft(id: string, patch: TournamentDraftPatch) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const u: Database["public"]["Tables"]["tournaments"]["Update"] = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) u.title = patch.title;
  if (patch.summary !== undefined) u.summary = patch.summary;
  if (patch.description !== undefined) u.description = patch.description;
  if (patch.sport_key !== undefined && SPORT_KEYS.includes(patch.sport_key)) u.sport_key = patch.sport_key;
  if (patch.entry_type === "individual" || patch.entry_type === "team") u.entry_type = patch.entry_type;
  if (patch.visibility === "public" || patch.visibility === "unlisted") u.visibility = patch.visibility;
  if (patch.starts_at !== undefined) u.starts_at = patch.starts_at;
  if (patch.ends_at !== undefined) u.ends_at = patch.ends_at;
  if (patch.timezone !== undefined) u.timezone = patch.timezone;
  if (patch.location_name !== undefined) u.location_name = patch.location_name;
  if (patch.location_address !== undefined) u.location_address = patch.location_address;
  // A ZIP places the event for local discovery; resolve to coordinates (blank = keep existing).
  if (patch.zip && /^\d{5}$/.test(patch.zip)) {
    u.location_zip = patch.zip;
    const z = lookupZip(patch.zip);
    if (z) {
      u.location_lat = z.lat;
      u.location_lng = z.lng;
      u.timezone = tzFromStateLng(z.state, z.lng);
    }
  }
  if (patch.weather_enabled !== undefined) u.weather_enabled = patch.weather_enabled;
  if (patch.capacity !== undefined) u.capacity = patch.capacity;
  if (patch.reserves_allowed !== undefined) u.reserves_allowed = patch.reserves_allowed;
  if (patch.min_women !== undefined) u.min_women = patch.min_women;
  if (patch.min_men !== undefined) u.min_men = patch.min_men;
  if (patch.registration_opens_at !== undefined) u.registration_opens_at = patch.registration_opens_at;
  if (patch.registration_deadline !== undefined) u.registration_deadline = patch.registration_deadline;
  // Merge format_config (don't clobber): callers may patch just their slice
  // (e.g. only `legal`, or only the format fields), and we must preserve the
  // rest — schedule settings, published snapshot, court count, etc.
  if (patch.format_config !== undefined) {
    const { data: cur } = await supabase.from("tournaments").select("format_config").eq("id", id).maybeSingle();
    const base = (cur?.format_config ?? {}) as Record<string, unknown>;
    u.format_config = { ...base, ...(patch.format_config as Record<string, unknown>) } as Json;
  }

  const { error } = await supabase.from("tournaments").update(u).eq("id", id);
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

/** Publish a draft so it becomes visible at /e/<code>. */
export async function publishTournament(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: t } = await supabase.from("tournaments").select("title, format_config").eq("id", id).maybeSingle();
  if (!t) return { ok: false as const, error: "Not found." };
  if (!t.title?.trim()) return { ok: false as const, error: "Add a title before publishing." };

  const { count: fieldCount } = await supabase.from("tournament_custom_fields").select("id", { count: "exact", head: true }).eq("tournament_id", id);
  const fc = (t.format_config ?? {}) as TournamentFormatConfig;
  if (!isSignupFormReady(fc, fieldCount ?? 0)) {
    return { ok: false as const, error: "Set up your sign-up form before publishing." };
  }

  const { error } = await supabase.from("tournaments").update({ status: "published", updated_at: new Date().toISOString() }).eq("id", id);
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

/** Pull a published event back to draft (hides the public page). */
export async function unpublishTournament(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { error } = await supabase.from("tournaments").update({ status: "draft", updated_at: new Date().toISOString() }).eq("id", id);
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

/** Replace the full set of divisions for a tournament (upsert + delete removed).
 *  Writes are gated to staff by RLS. Returns the canonical list so the editor can
 *  pick up new ids and ordering. */
export async function saveDivisions(tournamentId: string, divisions: DivisionInput[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: existing } = await supabase.from("tournament_divisions").select("id").eq("tournament_id", tournamentId);
  const existingIds = new Set((existing ?? []).map((d) => d.id));
  const keepIds = new Set<string>();

  for (const d of divisions) {
    const name = (d.name ?? "").trim() || "Division";
    const description = d.description?.toString().trim() || null;
    const fee_cents = Math.max(Math.round(d.fee_cents || 0), 0);
    const fee_basis = d.fee_basis === "per_player" ? "per_player" : "per_team";
    const capacity = d.capacity == null ? null : Math.max(Math.round(d.capacity), 0);
    if (d.id && existingIds.has(d.id)) {
      keepIds.add(d.id);
      await supabase.from("tournament_divisions").update({ name, description, fee_cents, fee_basis, capacity, sort_order: d.sort_order, updated_at: new Date().toISOString() }).eq("id", d.id);
    } else {
      const { data: ins } = await supabase.from("tournament_divisions").insert({ tournament_id: tournamentId, name, description, fee_cents, fee_basis, capacity, sort_order: d.sort_order }).select("id").single();
      if (ins) keepIds.add(ins.id);
    }
  }

  const toDelete = [...existingIds].filter((id) => !keepIds.has(id));
  if (toDelete.length) await supabase.from("tournament_divisions").delete().in("id", toDelete);

  const { data: fresh } = await supabase
    .from("tournament_divisions")
    .select("id, name, description, fee_cents, fee_basis, capacity, sort_order")
    .eq("tournament_id", tournamentId)
    .order("sort_order");
  return { ok: true as const, divisions: fresh ?? [] };
}

/** Replace the full set of registration questions (upsert + delete removed). */
export async function saveCustomFields(tournamentId: string, fields: CustomFieldInput[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const allowedTypes = ["short_text", "long_text", "single_select", "multi_select", "number", "date"];
  const { data: existing } = await supabase.from("tournament_custom_fields").select("id").eq("tournament_id", tournamentId);
  const existingIds = new Set((existing ?? []).map((f) => f.id));
  const keepIds = new Set<string>();

  for (const f of fields) {
    const label = (f.label ?? "").trim() || "Question";
    const description = f.description?.toString().trim() || null;
    const field_type = allowedTypes.includes(f.field_type) ? f.field_type : "short_text";
    const scope = f.scope === "per_team" ? "per_team" : "per_player";
    const required = !!f.required;
    const hasOpts = field_type === "single_select" || field_type === "multi_select";
    const options = hasOpts ? (f.options ?? []).map((o) => o.toString().trim()).filter(Boolean) : [];
    if (f.id && existingIds.has(f.id)) {
      keepIds.add(f.id);
      await supabase.from("tournament_custom_fields").update({ label, description, field_type, options, required, scope, sort_order: f.sort_order }).eq("id", f.id);
    } else {
      const { data: ins } = await supabase.from("tournament_custom_fields").insert({ tournament_id: tournamentId, label, description, field_type, options, required, scope, sort_order: f.sort_order }).select("id").single();
      if (ins) keepIds.add(ins.id);
    }
  }

  const toDelete = [...existingIds].filter((id) => !keepIds.has(id));
  if (toDelete.length) await supabase.from("tournament_custom_fields").delete().in("id", toDelete);

  // Saving the form (even with no questions) counts as a deliberate setup step,
  // which is what publishing requires — record it on the tournament.
  const { data: trow } = await supabase.from("tournaments").select("format_config").eq("id", tournamentId).maybeSingle();
  if (trow) {
    const nextFc = { ...((trow.format_config ?? {}) as Record<string, unknown>), signup_form_ready: true };
    await supabase.from("tournaments").update({ format_config: nextFc as Json, updated_at: new Date().toISOString() }).eq("id", tournamentId);
    revalidatePath(`/tournament/${tournamentId}`);
    revalidatePath(`/tournament/${tournamentId}/settings`);
  }

  const { data: fresh } = await supabase
    .from("tournament_custom_fields")
    .select("id, label, description, field_type, options, required, scope, sort_order")
    .eq("tournament_id", tournamentId)
    .order("sort_order");
  return { ok: true as const, fields: fresh ?? [] };
}

/** Save the sponsor list. Rides in format_config.sponsors (anon already reads
 *  format_config on the public page, so no extra RLS). Staff-only. */
export async function saveSponsors(tournamentId: string, sponsors: Sponsor[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: to } = await supabase.from("tournaments").select("owner_id, code, format_config").eq("id", tournamentId).maybeSingle();
  if (!to) return { ok: false as const, error: "Not found." };
  let staff = to.owner_id === user.id;
  if (!staff) {
    const { data: m } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", tournamentId).eq("user_id", user.id).maybeSingle();
    staff = !!m;
  }
  if (!staff) return { ok: false as const, error: "Not allowed." };

  const clean: Sponsor[] = (sponsors ?? []).slice(0, 40).map((s) => {
    const tier = s.tier === "premium" ? "premium" : "standard";
    const raw = s.url ? String(s.url).trim() : "";
    const url = raw ? (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).slice(0, 300) : null;
    const photos = tier === "premium" && Array.isArray(s.photos) ? s.photos.filter((p) => typeof p === "string" && p).slice(0, 1) : [];
    return {
      id: typeof s.id === "string" && s.id ? s.id.slice(0, 64) : randomUUID(),
      name: String(s.name ?? "").trim().slice(0, 120) || "Sponsor",
      url,
      tier,
      logo: s.logo ? String(s.logo).slice(0, 600) : null,
      photos,
      blurb: tier === "premium" && s.blurb ? String(s.blurb).trim().slice(0, 400) : null,
    };
  });

  const fc = { ...((to.format_config ?? {}) as Record<string, unknown>), sponsors: clean };
  const { error } = await supabase.from("tournaments").update({ format_config: fc as Json, updated_at: new Date().toISOString() }).eq("id", tournamentId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath(`/tournament/${tournamentId}/sponsors`);
  if (to.code) revalidatePath(`/e/${to.code}`);
  return { ok: true as const, sponsors: clean };
}

/** Save the announcements feed. Rides in format_config.announcements (anon reads
 *  format_config on the public page, so no extra RLS). Staff-only. */
export async function saveAnnouncements(tournamentId: string, announcements: Announcement[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: to } = await supabase.from("tournaments").select("owner_id, code, format_config").eq("id", tournamentId).maybeSingle();
  if (!to) return { ok: false as const, error: "Not found." };
  let staff = to.owner_id === user.id;
  if (!staff) {
    const { data: m } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", tournamentId).eq("user_id", user.id).maybeSingle();
    staff = !!m;
  }
  if (!staff) return { ok: false as const, error: "Not allowed." };

  const now = new Date().toISOString();
  const clean: Announcement[] = (announcements ?? [])
    .slice(0, 60)
    .map((a) => ({
      id: typeof a.id === "string" && a.id ? a.id.slice(0, 64) : randomUUID(),
      title: String(a.title ?? "").trim().slice(0, 160),
      body: String(a.body ?? "").trim().slice(0, 4000),
      pinned: !!a.pinned,
      createdAt: a.createdAt && !Number.isNaN(Date.parse(a.createdAt)) ? a.createdAt : now,
      updatedAt: now,
    }))
    .filter((a) => a.title || a.body);

  const fc = { ...((to.format_config ?? {}) as Record<string, unknown>), announcements: clean };
  const { error } = await supabase.from("tournaments").update({ format_config: fc as Json, updated_at: new Date().toISOString() }).eq("id", tournamentId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath(`/tournament/${tournamentId}/announcements`);
  if (to.code) revalidatePath(`/e/${to.code}`);
  return { ok: true as const, announcements: clean };
}

/** Replace the full run-of-show plan (upsert + delete removed). Writes gated to
 *  staff by RLS. Returns the canonical list ordered by time. */
export async function saveTournamentPlan(tournamentId: string, items: PlanItemInput[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const KINDS = ["general", "games", "food", "sponsor", "music", "setup", "ceremony", "staff"];
  const { data: existing } = await supabase.from("tournament_plan_items").select("id").eq("tournament_id", tournamentId);
  const existingIds = new Set((existing ?? []).map((r) => r.id));
  const keepIds = new Set<string>();

  for (const it of items) {
    if (!it.starts_at) continue; // an item needs a time to live on the timeline
    const title = (it.title ?? "").trim() || "Untitled";
    const kind = KINDS.includes(it.kind) ? it.kind : "general";
    const ends_at = it.ends_at || null;
    const notes = it.notes?.toString().trim() || null;
    const sort_order = Number.isFinite(it.sort_order) ? it.sort_order : 0;
    if (it.id && existingIds.has(it.id)) {
      keepIds.add(it.id);
      await supabase.from("tournament_plan_items").update({ title, kind, starts_at: it.starts_at, ends_at, notes, sort_order }).eq("id", it.id);
    } else {
      const { data: ins } = await supabase.from("tournament_plan_items").insert({ tournament_id: tournamentId, title, kind, starts_at: it.starts_at, ends_at, notes, sort_order }).select("id").single();
      if (ins) keepIds.add(ins.id);
    }
  }

  const toDelete = [...existingIds].filter((id) => !keepIds.has(id));
  if (toDelete.length) await supabase.from("tournament_plan_items").delete().in("id", toDelete);

  const { data: fresh } = await supabase
    .from("tournament_plan_items")
    .select("id, title, kind, starts_at, ends_at, notes, sort_order")
    .eq("tournament_id", tournamentId)
    .order("starts_at");
  return { ok: true as const, items: fresh ?? [] };
}

/** Open sign-ups (published → registration_open). Owner/managers only (RLS). */
export async function openRegistration(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("tournaments").update({ status: "registration_open", updated_at: new Date().toISOString() }).eq("id", id);
  revalidatePath(`/tournament/${id}`);
}

/** Close sign-ups (registration_open → registration_closed). */
export async function closeRegistration(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("tournaments").update({ status: "registration_closed", updated_at: new Date().toISOString() }).eq("id", id);
  revalidatePath(`/tournament/${id}`);
}

/** Individual entry: the signed-in player registers themselves, answering the
/** Capacity gate shared by both sign-up paths. Returns an error string if adding
 *  the entry would exceed the configured cap, else null. Mode + unit live in
 *  format_config: pooled caps the tournament total, per_division caps each
 *  division's own capacity; the unit decides whether we count teams or players. */
async function capacityBlock(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tournamentId: string,
  t: { capacity: number | null; format_config: Json | null },
  divisionId: string | null,
  add: { teams: number; persons: number },
): Promise<string | null> {
  const fc = (t.format_config ?? {}) as TournamentFormatConfig;
  const mode = fc.capacity_mode === "per_division" ? "per_division" : "pooled";
  const unit = fc.capacity_unit === "person" ? "person" : "team";
  const inc = unit === "person" ? add.persons : add.teams;

  const countUsed = async (divScope: string | null): Promise<number> => {
    if (unit === "team") {
      const base = supabase
        .from("tournament_registrations")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", tournamentId)
        .not("status", "in", "(withdrawn,declined)");
      const { count } = divScope ? await base.eq("division_id", divScope) : await base;
      return count ?? 0;
    }
    const base = supabase.from("tournament_registrations").select("id").eq("tournament_id", tournamentId).not("status", "in", "(withdrawn,declined)");
    const { data: regs } = divScope ? await base.eq("division_id", divScope) : await base;
    const ids = (regs ?? []).map((r) => r.id);
    if (!ids.length) return 0;
    const { count } = await supabase.from("tournament_registration_players").select("id", { count: "exact", head: true }).in("registration_id", ids).eq("is_reserve", false);
    return count ?? 0;
  };

  if (mode === "per_division") {
    if (!divisionId) return null;
    const { data: div } = await supabase.from("tournament_divisions").select("capacity").eq("id", divisionId).maybeSingle();
    const cap = div?.capacity ?? null;
    if (cap == null) return null;
    const used = await countUsed(divisionId);
    return used + inc > cap ? "This division is full." : null;
  }

  const cap = t.capacity ?? null;
  if (cap == null) return null;
  const used = await countUsed(null);
  return used + inc > cap ? "Registration is full — the event is at capacity." : null;
}

/** Individual entry: a player enters themselves into an optional division, answering
 *  per-player questions and accepting the waiver/rules in one step (no separate
 *  confirmation needed since they're the only participant). */
export async function signUpIndividual(
  tournamentId: string,
  input: { divisionId: string | null; answers: Record<string, string | string[]>; acceptWaiver: boolean; acceptRules: boolean },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: t } = await supabase
    .from("tournaments")
    .select("id, entry_type, status, registration_opens_at, registration_deadline, capacity, format_config")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!t) return { ok: false as const, error: "Event not found." };
  if (t.entry_type !== "individual") return { ok: false as const, error: "This event is team-based." };
  if (t.registration_deadline && new Date(t.registration_deadline).getTime() < Date.now()) return { ok: false as const, error: "Registration has closed." };
  if (!isRegistrationOpen(t)) return { ok: false as const, error: "Registration isn't open." };

  const { data: existing } = await supabase
    .from("tournament_registrations")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("registrant_id", user.id)
    .is("team_id", null)
    .not("status", "in", "(withdrawn,declined)")
    .maybeSingle();
  if (existing) return { ok: false as const, error: "You're already registered." };

  let divisionId: string | null = null;
  if (input.divisionId) {
    const { data: div } = await supabase.from("tournament_divisions").select("id").eq("id", input.divisionId).eq("tournament_id", tournamentId).maybeSingle();
    if (!div) return { ok: false as const, error: "Pick a valid division." };
    divisionId = div.id;
  }

  const full = await capacityBlock(supabase, tournamentId, t, divisionId, { teams: 1, persons: 1 });
  const status = full ? "waitlisted" : "pending";

  const { data: reg, error } = await supabase
    .from("tournament_registrations")
    .insert({ tournament_id: tournamentId, division_id: divisionId, team_id: null, registrant_id: user.id, status, payment_status: "unpaid" })
    .select("id")
    .single();
  if (error || !reg) return { ok: false as const, error: error?.message ?? "Couldn't register." };

  const now = new Date().toISOString();
  await supabase.from("tournament_registration_players").insert({
    registration_id: reg.id,
    tournament_id: tournamentId,
    user_id: user.id,
    is_reserve: false,
    waiver_accepted_at: input.acceptWaiver ? now : null,
    waiver_version: input.acceptWaiver ? "1" : null,
    rules_accepted_at: input.acceptRules ? now : null,
    rules_version: input.acceptRules ? "1" : null,
    player_answers: input.answers as Json,
    confirmed_at: now,
  });

  await convertEmailWaitlist(tournamentId, user.email);
  if (!full) await notifyRegistration(reg.id);
  return { ok: true as const, registrationId: reg.id, waitlisted: !!full };
}

/** Team entry: the team owner enters one of their squads. Validates sport, roster
 *  size against the on-court count, reserve cap, gender minimums, and double-entry.
 *  Snapshots the roster as players (unconfirmed); each member confirms separately. */
export async function signUpTeam(
  tournamentId: string,
  input: { teamId: string; divisionId: string | null; teamAnswers: Record<string, string | string[]> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: t } = await supabase
    .from("tournaments")
    .select("id, capacity, sport_key, entry_type, status, registration_opens_at, registration_deadline, reserves_allowed, min_women, min_men, format_config")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!t) return { ok: false as const, error: "Event not found." };
  if (t.entry_type !== "team") return { ok: false as const, error: "This event is for individuals." };
  if (t.registration_deadline && new Date(t.registration_deadline).getTime() < Date.now()) return { ok: false as const, error: "Registration has closed." };
  if (!isRegistrationOpen(t)) return { ok: false as const, error: "Registration isn't open." };

  const { data: team } = await supabase.from("teams").select("id, sport_key, name").eq("id", input.teamId).maybeSingle();
  if (!team) return { ok: false as const, error: "Team not found." };
  if (team.sport_key !== t.sport_key) return { ok: false as const, error: "That team plays a different sport." };

  const { data: myRole } = await supabase.from("team_members").select("role").eq("team_id", team.id).eq("user_id", user.id).maybeSingle();
  if (!myRole || (myRole.role !== "owner" && myRole.role !== "manager")) return { ok: false as const, error: "Only the team owner can enter this team." };

  const { data: memberRows } = await supabase.from("team_members").select("user_id, designation").eq("team_id", team.id);
  const roster = memberRows ?? [];
  const main = roster.filter((m) => m.designation !== "sub");
  const reserves = roster.filter((m) => m.designation === "sub");
  const fc = (t.format_config ?? {}) as TournamentFormatConfig;
  const rosterSize = fc.roster_size ?? 2;
  if (main.length !== rosterSize) return { ok: false as const, error: `This event needs exactly ${rosterSize} main player${rosterSize === 1 ? "" : "s"} per team — ${team.name} has ${main.length}.` };
  const reserveCap = Math.min(t.reserves_allowed ?? 0, t.sport_key === "beach_volleyball" ? 2 : 4);
  if (reserves.length > reserveCap) return { ok: false as const, error: `Too many reserves — the max here is ${reserveCap}.` };

  if ((t.min_women ?? 0) > 0 || (t.min_men ?? 0) > 0) {
    const mainIds = main.map((m) => m.user_id);
    const { data: profs } = await supabase.from("profiles").select("id, gender").in("id", mainIds);
    const women = (profs ?? []).filter((p) => p.gender === "woman").length;
    const men = (profs ?? []).filter((p) => p.gender === "man").length;
    if (women < (t.min_women ?? 0) || men < (t.min_men ?? 0)) return { ok: false as const, error: "This team doesn't meet the event's gender requirements." };
  }

  const { data: dupTeam } = await supabase.from("tournament_registrations").select("id").eq("tournament_id", tournamentId).eq("team_id", team.id).not("status", "in", "(withdrawn,declined)").maybeSingle();
  if (dupTeam) return { ok: false as const, error: "This team is already entered." };

  // Double-entry guard: no member may already be on another active entry here.
  const memberIds = roster.map((m) => m.user_id);
  const { data: activeRegs } = await supabase.from("tournament_registrations").select("id").eq("tournament_id", tournamentId).not("status", "in", "(withdrawn,declined)");
  const activeIds = (activeRegs ?? []).map((r) => r.id);
  if (activeIds.length && memberIds.length) {
    const { data: clash } = await supabase.from("tournament_registration_players").select("user_id").in("registration_id", activeIds).in("user_id", memberIds);
    if (clash && clash.length) return { ok: false as const, error: "One or more players are already entered in this tournament on another team." };
  }

  let divisionId: string | null = null;
  if (input.divisionId) {
    const { data: div } = await supabase.from("tournament_divisions").select("id").eq("id", input.divisionId).eq("tournament_id", tournamentId).maybeSingle();
    if (!div) return { ok: false as const, error: "Pick a valid division." };
    divisionId = div.id;
  }

  const full = await capacityBlock(supabase, tournamentId, t, divisionId, { teams: 1, persons: main.length });
  const status = full ? "waitlisted" : "pending";

  const { data: reg, error } = await supabase
    .from("tournament_registrations")
    .insert({ tournament_id: tournamentId, division_id: divisionId, team_id: team.id, registrant_id: user.id, status, payment_status: "unpaid", team_answers: input.teamAnswers as Json })
    .select("id")
    .single();
  if (error || !reg) return { ok: false as const, error: error?.message ?? "Couldn't enter the team." };

  const playerRows = roster.map((m) => ({
    registration_id: reg.id,
    tournament_id: tournamentId,
    user_id: m.user_id,
    is_reserve: m.designation === "sub",
  }));
  await supabase.from("tournament_registration_players").insert(playerRows);

  await convertEmailWaitlist(tournamentId, user.email);
  if (!full) await notifyRegistration(reg.id);
  return { ok: true as const, registrationId: reg.id, waitlisted: !!full };
}

/** A rostered player confirms their own spot: accepts the waiver/rules and answers
 *  their per-player questions. Updates only their own player row (RLS-enforced). */
export async function confirmMembership(
  tournamentId: string,
  input: { answers: Record<string, string | string[]>; acceptWaiver: boolean; acceptRules: boolean },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: t } = await supabase.from("tournaments").select("id, status").eq("id", tournamentId).maybeSingle();
  if (!t) return { ok: false as const, error: "Event not found." };
  if (t.status === "completed" || t.status === "cancelled" || t.status === "archived") return { ok: false as const, error: "This event is closed." };

  const { data: prs } = await supabase
    .from("tournament_registration_players")
    .select("id, registration_id, confirmed_at")
    .eq("tournament_id", tournamentId)
    .eq("user_id", user.id);
  if (!prs || prs.length === 0) return { ok: false as const, error: "You're not on a roster for this event." };

  const regIds = prs.map((p) => p.registration_id);
  const { data: regs } = await supabase.from("tournament_registrations").select("id").in("id", regIds).not("status", "in", "(withdrawn,declined)");
  const activeRegId = regs && regs.length ? regs[0].id : null;
  if (!activeRegId) return { ok: false as const, error: "Your entry is no longer active." };
  const pr = prs.find((p) => p.registration_id === activeRegId);
  if (!pr) return { ok: false as const, error: "We couldn't find your player record." };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("tournament_registration_players")
    .update({
      confirmed_at: now,
      waiver_accepted_at: input.acceptWaiver ? now : null,
      waiver_version: input.acceptWaiver ? "1" : null,
      rules_accepted_at: input.acceptRules ? now : null,
      rules_version: input.acceptRules ? "1" : null,
      player_answers: input.answers as Json,
    })
    .eq("id", pr.id);
  if (error) return { ok: false as const, error: error.message };

  return { ok: true as const };
}

/** Records a payment proof the registrant uploaded to the private bucket, computes
 *  the amount owed from the division, and flips the entry to "proof submitted". */
export async function submitPaymentProof(registrationId: string, proofPath: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const allowed = await rateLimit(`payproof:${user.id}`, 20, 600); // 20 / 10 min
  if (!allowed) return { ok: false as const, error: "Too many upload attempts. Please wait a few minutes and try again." };

  const { data: reg } = await supabase
    .from("tournament_registrations")
    .select("id, tournament_id, registrant_id, division_id, team_id")
    .eq("id", registrationId)
    .maybeSingle();
  if (!reg) return { ok: false as const, error: "Entry not found." };
  if (reg.registrant_id !== user.id) return { ok: false as const, error: "Only the registrant can submit payment." };

  let amount: number | null = null;
  if (reg.division_id) {
    const { data: div } = await supabase.from("tournament_divisions").select("fee_cents, fee_basis").eq("id", reg.division_id).maybeSingle();
    if (div) {
      if (div.fee_basis === "per_team") {
        amount = div.fee_cents ?? 0;
      } else {
        const { count } = await supabase
          .from("tournament_registration_players")
          .select("id", { count: "exact", head: true })
          .eq("registration_id", reg.id)
          .eq("is_reserve", false);
        amount = (div.fee_cents ?? 0) * (count ?? 1);
      }
    }
  }

  const { error: insErr } = await supabase.from("tournament_payments").insert({
    registration_id: reg.id,
    tournament_id: reg.tournament_id,
    submitted_by: user.id,
    proof_path: proofPath,
    amount_cents: amount,
    status: "submitted",
  });
  if (insErr) return { ok: false as const, error: insErr.message };

  await supabase.from("tournament_registrations").update({ payment_status: "proof_submitted" }).eq("id", reg.id);
  return { ok: true as const };
}

/** Organizer confirms a registration's payment. Staff-only. */
export async function confirmPayment(registrationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: reg } = await supabase.from("tournament_registrations").select("id, tournament_id").eq("id", registrationId).maybeSingle();
  if (!reg) return { ok: false as const, error: "Entry not found." };

  const { data: to } = await supabase.from("tournaments").select("owner_id").eq("id", reg.tournament_id).maybeSingle();
  let staff = to?.owner_id === user.id;
  if (!staff) {
    const { data: m } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", reg.tournament_id).eq("user_id", user.id).maybeSingle();
    staff = !!m;
  }
  if (!staff) return { ok: false as const, error: "Not allowed." };

  const now = new Date().toISOString();
  const { data: pay } = await supabase.from("tournament_payments").select("id").eq("registration_id", registrationId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (pay) await supabase.from("tournament_payments").update({ status: "confirmed", deny_reason: null, reviewed_by: user.id, reviewed_at: now }).eq("id", pay.id);
  await supabase.from("tournament_registrations").update({ payment_status: "confirmed" }).eq("id", registrationId);
  await notifyPayment(registrationId, "confirmed");
  revalidatePath(`/tournament/${reg.tournament_id}/payments`);
  return { ok: true as const };
}

/** Organizer declines a payment with a reason the entrant will see. Staff-only. */
export async function denyPayment(registrationId: string, reason: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: reg } = await supabase.from("tournament_registrations").select("id, tournament_id").eq("id", registrationId).maybeSingle();
  if (!reg) return { ok: false as const, error: "Entry not found." };

  const { data: to } = await supabase.from("tournaments").select("owner_id").eq("id", reg.tournament_id).maybeSingle();
  let staff = to?.owner_id === user.id;
  if (!staff) {
    const { data: m } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", reg.tournament_id).eq("user_id", user.id).maybeSingle();
    staff = !!m;
  }
  if (!staff) return { ok: false as const, error: "Not allowed." };

  const now = new Date().toISOString();
  const { data: pay } = await supabase.from("tournament_payments").select("id").eq("registration_id", registrationId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (pay) await supabase.from("tournament_payments").update({ status: "denied", deny_reason: reason.trim() || null, reviewed_by: user.id, reviewed_at: now }).eq("id", pay.id);
  await supabase.from("tournament_registrations").update({ payment_status: "denied" }).eq("id", registrationId);
  await notifyPayment(registrationId, "denied", reason);
  revalidatePath(`/tournament/${reg.tournament_id}/payments`);
  return { ok: true as const };
}

/** Snake-seed a division's active entries into N pools. Regenerating clears the
 *  division's existing pools and any pool matches first. Staff-only. */
export async function generateGroups(tournamentId: string, divisionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: to } = await supabase.from("tournaments").select("owner_id").eq("id", tournamentId).maybeSingle();
  let staff = to?.owner_id === user.id;
  if (!staff) {
    const { data: m } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", tournamentId).eq("user_id", user.id).maybeSingle();
    staff = !!m;
  }
  if (!staff) return { ok: false as const, error: "Not allowed." };

  // Pool layout comes from the division's saved structure so the draw matches
  // exactly what the planner previewed — including any uneven (remainder) pools.
  const { data: div } = await supabase
    .from("tournament_divisions")
    .select("group_count, group_size, group_extra, group_extra_mode")
    .eq("id", divisionId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  const groups = Math.max(1, Math.min(16, Math.floor(div?.group_count ?? 1) || 1));
  const per = Math.max(1, Math.min(64, Math.floor(div?.group_size ?? 1) || 1));
  const extra = Math.max(0, Math.floor(div?.group_extra ?? 0) || 0);
  const mode: "grow" | "pool" = div?.group_extra_mode === "pool" ? "pool" : "grow";
  const sizes = poolSizes(groups, per, extra, mode);
  const pools = sizes.length;

  const { data: entries } = await supabase
    .from("tournament_registrations")
    .select("id, created_at")
    .eq("tournament_id", tournamentId)
    .eq("division_id", divisionId)
    .not("status", "in", "(withdrawn,declined)")
    .order("created_at");
  const ids = (entries ?? []).map((e) => e.id);
  if (ids.length === 0) return { ok: false as const, error: "No entries in this division yet." };

  // clear existing pool groups + pool matches for this division
  await supabase.from("tournament_matches").delete().eq("division_id", divisionId).not("group_id", "is", null);
  await supabase.from("tournament_groups").delete().eq("division_id", divisionId);

  const groupRows = Array.from({ length: pools }, (_, i) => ({
    tournament_id: tournamentId,
    division_id: divisionId,
    name: `Pool ${String.fromCharCode(65 + i)}`,
    sort_order: i,
  }));
  const { data: created, error: gErr } = await supabase.from("tournament_groups").insert(groupRows).select("id, sort_order");
  if (gErr || !created) return { ok: false as const, error: gErr?.message ?? "Couldn't create pools." };
  const groupBySort = new Map(created.map((g) => [g.sort_order, g.id]));

  // Completely random draw — cryptographically shuffled, then dealt to fill each
  // pool toward its planned size (so uneven layouts are honored). Pools under
  // their target take entries first, most-room-first, which keeps the fill
  // balanced; any overflow beyond the planned capacity lands in the least-loaded
  // pool so no entry is ever dropped. There's no manual seeding, so the draw
  // can't be steered to favor anyone.
  const draw = shuffle(ids);
  const counts = new Array(pools).fill(0) as number[];
  const geRows = draw.map((regId) => {
    let best = 0;
    let bestScore = -Infinity;
    for (let p = 0; p < pools; p++) {
      const room = sizes[p] - counts[p];
      const score = room > 0 ? 1_000_000 + room * 1000 - p : -counts[p] * 1000 - p;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    const pos = counts[best];
    counts[best] += 1;
    return {
      group_id: groupBySort.get(best) as string,
      tournament_id: tournamentId,
      division_id: divisionId,
      registration_id: regId,
      seed: pos + 1,
      sort_order: pos,
    };
  });
  const { error: geErr } = await supabase.from("tournament_group_entries").insert(geRows);
  if (geErr) return { ok: false as const, error: geErr.message };

  // Round-robin schedule within each pool (everyone plays everyone).
  const byGroup = new Map<string, string[]>();
  for (const r of geRows) {
    const arr = byGroup.get(r.group_id) ?? [];
    arr.push(r.registration_id);
    byGroup.set(r.group_id, arr);
  }
  const matchRows: { tournament_id: string; division_id: string; group_id: string; round: number; slot: number; entry_a: string; entry_b: string; status: string; sort_order: number }[] = [];
  let so = 0;
  for (const [groupId, regs] of byGroup) {
    for (let a = 0; a < regs.length; a++) {
      for (let b = a + 1; b < regs.length; b++) {
        matchRows.push({ tournament_id: tournamentId, division_id: divisionId, group_id: groupId, round: 0, slot: 0, entry_a: regs[a], entry_b: regs[b], status: "pending", sort_order: so });
        so++;
      }
    }
  }
  if (matchRows.length) await supabase.from("tournament_matches").insert(matchRows);

  // Append to the draw log — original is #1, each redraw increments. Keeps the
  // full, tamper-evident history so a redraw is always disclosed.
  const { count: priorDraws } = await supabase.from("tournament_draws").select("id", { count: "exact", head: true }).eq("division_id", divisionId);
  await supabase.from("tournament_draws").insert({ tournament_id: tournamentId, division_id: divisionId, draw_number: (priorDraws ?? 0) + 1, drawn_by: user.id });

  await republishResultsIfAuto(tournamentId);
  revalidatePath(`/tournament/${tournamentId}/brackets`);
  return { ok: true as const };
}

/** Build the match schedule: stamp every un-played match with a court (Court 1..N)
 *  and, in timed mode, a clock time derived from the matches start time + slot
 *  length. Matches are dealt round-robin across courts so all courts run in
 *  parallel; each court then advances one slot at a time. Settings ride in
 *  format_config (no migration). Already-completed matches (byes / finished
 *  games) keep their place and don't burn a slot. Staff-only. */
export async function buildSchedule(
  tournamentId: string,
  opts: { startAt: string | null; mode: "timed" | "ordered"; matchLengthMin: number; courtCount: number },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: to } = await supabase.from("tournaments").select("owner_id, format_config").eq("id", tournamentId).maybeSingle();
  if (!to) return { ok: false as const, error: "Not found." };
  let staff = to.owner_id === user.id;
  if (!staff) {
    const { data: m } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", tournamentId).eq("user_id", user.id).maybeSingle();
    staff = !!m;
  }
  if (!staff) return { ok: false as const, error: "Not allowed." };

  const fcCur = (to.format_config ?? {}) as Record<string, unknown>;
  const configuredCourts = Array.isArray(fcCur.courts)
    ? (fcCur.courts as unknown[]).map((c) => String(c).trim()).filter(Boolean)
    : [];
  const courtLabels = configuredCourts.length
    ? configuredCourts
    : Array.from({ length: Math.max(1, Math.min(50, Math.floor(opts.courtCount) || 1)) }, (_, i) => `Court ${i + 1}`);
  const courts = courtLabels.length;
  const mode = opts.mode === "ordered" ? "ordered" : "timed";
  const lengthMin = Math.max(5, Math.min(240, Math.floor(opts.matchLengthMin) || 30));
  const startAt = opts.startAt ? new Date(opts.startAt) : null;
  if (mode === "timed" && (!startAt || Number.isNaN(startAt.getTime()))) {
    return { ok: false as const, error: "Set a matches start time for timed slots." };
  }

  const { data: divs } = await supabase.from("tournament_divisions").select("id, sort_order").eq("tournament_id", tournamentId);
  const divOrder = new Map((divs ?? []).map((d) => [d.id, d.sort_order ?? 0]));

  const { data: matches } = await supabase
    .from("tournament_matches")
    .select("id, division_id, group_id, sort_order, status")
    .eq("tournament_id", tournamentId);
  const playable = (matches ?? []).filter((m) => m.status !== "completed");
  if (playable.length === 0) return { ok: false as const, error: "No matches to schedule yet. Draw the pools or bracket first." };

  // Order: division order, pool matches before bracket matches, then existing order.
  const ordered = playable.slice().sort((a, b) => {
    const da = divOrder.get(a.division_id ?? "") ?? 0;
    const db = divOrder.get(b.division_id ?? "") ?? 0;
    if (da !== db) return da - db;
    const pa = a.group_id ? 0 : 1;
    const pb = b.group_id ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });

  const perCourt = new Array(courts).fill(0) as number[];
  const startMs = startAt ? startAt.getTime() : 0;
  const now = new Date().toISOString();
  for (let i = 0; i < ordered.length; i++) {
    const courtIdx = i % courts;
    const slot = perCourt[courtIdx]++;
    const court = courtLabels[courtIdx];
    const scheduled_at = mode === "timed" ? new Date(startMs + slot * lengthMin * 60000).toISOString() : null;
    const status = mode === "timed" ? "scheduled" : "pending";
    await supabase
      .from("tournament_matches")
      .update({ court, scheduled_at, status, sort_order: i, updated_at: now })
      .eq("id", ordered[i].id);
  }

  const fc = {
    ...((to.format_config ?? {}) as Record<string, unknown>),
    court_count: courts,
    matches_start_at: startAt ? startAt.toISOString() : null,
    schedule_mode: mode,
    match_length_min: lengthMin,
    schedule_built_at: now,
  };
  await supabase.from("tournaments").update({ format_config: fc as Json, updated_at: now }).eq("id", tournamentId);

  revalidatePath(`/tournament/${tournamentId}/schedule`);
  return { ok: true as const, count: ordered.length };
}

/* ---- Public results (pools + brackets) publishing ----------------------- */

function snapshotRoundLabel(roundIndex: number, total: number): string {
  const fromEnd = total - roundIndex; // roundIndex is 1-based
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semifinals";
  if (fromEnd === 2) return "Quarterfinals";
  return `Round ${roundIndex}`;
}

/** Build a public snapshot of every division's pool standings + bracket, read
 *  with the caller's (staff) client so RLS allows the underlying tables. Anon
 *  reads it back from format_config on the public page — no extra RLS needed. */
async function buildResultsSnapshot(tournamentId: string): Promise<PublishedResults> {
  const supabase = await createClient();

  const { data: t } = await supabase.from("tournaments").select("format_config").eq("id", tournamentId).maybeSingle();
  const fc = (t?.format_config ?? {}) as TournamentFormatConfig;
  const formatType = fc.format_type ?? "pools_knockout";

  const { data: regs } = await supabase.from("tournament_registrations").select("id, team_id, registrant_id").eq("tournament_id", tournamentId).not("status", "in", "(withdrawn,declined)");
  const list = regs ?? [];
  const teamIds = [...new Set(list.filter((r) => r.team_id).map((r) => r.team_id as string))];
  const teamName = new Map<string, string>();
  if (teamIds.length) {
    const { data } = await supabase.from("teams").select("id, name").in("id", teamIds);
    for (const x of data ?? []) teamName.set(x.id, x.name);
  }
  const profIds = [...new Set(list.filter((r) => !r.team_id).map((r) => r.registrant_id))];
  const profName = new Map<string, string>();
  if (profIds.length) {
    const { data } = await supabase.from("profiles").select("id, display_name").in("id", profIds);
    for (const x of data ?? []) profName.set(x.id, x.display_name ?? "Player");
  }
  const nameByReg = new Map(list.map((r) => [r.id, r.team_id ? teamName.get(r.team_id) ?? "Team" : profName.get(r.registrant_id) ?? "Player"]));
  const nm = (regId: string | null) => (regId ? nameByReg.get(regId) ?? "TBD" : "TBD");

  const { data: divisions } = await supabase.from("tournament_divisions").select("id, name, sort_order").eq("tournament_id", tournamentId).order("sort_order");
  const divs = divisions ?? [];

  const { data: matches } = await supabase
    .from("tournament_matches")
    .select("id, division_id, group_id, round, slot, entry_a, entry_b, score_a, score_b, status, sort_order")
    .eq("tournament_id", tournamentId);
  const allMatches = matches ?? [];

  let allGroups: { id: string; division_id: string; name: string; sort_order: number }[] = [];
  let allGe: { group_id: string; division_id: string; registration_id: string; seed: number | null }[] = [];
  if (formatType !== "single_elim") {
    const { data: groups } = await supabase.from("tournament_groups").select("id, division_id, name, sort_order").eq("tournament_id", tournamentId).order("sort_order");
    const { data: ge } = await supabase.from("tournament_group_entries").select("group_id, division_id, registration_id, seed").eq("tournament_id", tournamentId);
    allGroups = groups ?? [];
    allGe = ge ?? [];
  }

  const divisionsOut = divs.map((d) => {
    const dGroups = allGroups.filter((g) => g.division_id === d.id);
    const pools = dGroups.map((g) => {
      const entries = allGe.filter((e) => e.group_id === g.id).map((e) => ({ regId: e.registration_id, name: nm(e.registration_id) }));
      const ms = allMatches.filter((m) => m.group_id === g.id).map((m) => ({ entryA: m.entry_a, entryB: m.entry_b, scoreA: m.score_a, scoreB: m.score_b, status: m.status }));
      const rows = computePoolStandings(entries, ms).map((r, i) => ({ rank: i + 1, team: r.name, w: r.wins, l: r.losses, d: r.draws, diff: r.diff }));
      return { name: g.name, rows };
    });

    const knockout = allMatches.filter((m) => m.division_id === d.id && m.group_id === null);
    const maxRound = knockout.reduce((mx, m) => Math.max(mx, m.round), 0);
    const rounds: PublishedResults["divisions"][number]["rounds"] = [];
    for (let r = 1; r <= maxRound; r++) {
      const ms = knockout
        .filter((m) => m.round === r)
        .sort((a, b) => a.slot - b.slot)
        .map((m) => ({ a: nm(m.entry_a), b: nm(m.entry_b), sa: m.score_a, sb: m.score_b, done: m.status === "completed" }));
      rounds.push({ label: snapshotRoundLabel(r, maxRound), matches: ms });
    }

    return { name: d.name, pools, rounds };
  });

  return { builtAt: new Date().toISOString(), format: formatType, divisions: divisionsOut };
}

/** When auto-publish is on (and results are published), re-snapshot so the public
 *  page tracks live results. Called at the end of every result-mutating action. */
async function republishResultsIfAuto(tournamentId: string) {
  const supabase = await createClient();
  const { data: to } = await supabase.from("tournaments").select("code, format_config").eq("id", tournamentId).maybeSingle();
  if (!to) return;
  const fc = (to.format_config ?? {}) as TournamentFormatConfig;
  if (!fc.results_auto_publish || !fc.results_published) return;
  const published_results = await buildResultsSnapshot(tournamentId);
  const next = { ...((to.format_config ?? {}) as Record<string, unknown>), published_results };
  await supabase.from("tournaments").update({ format_config: next as Json, updated_at: new Date().toISOString() }).eq("id", tournamentId);
  if (to.code) revalidatePath(`/e/${to.code}`);
}

/** Publish (or refresh) the competition view — every division's pools and
 *  brackets — to the public event page. Staff-only. */
export async function publishResults(tournamentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: to } = await supabase.from("tournaments").select("owner_id, code, format_config").eq("id", tournamentId).maybeSingle();
  if (!to) return { ok: false as const, error: "Not found." };
  let staff = to.owner_id === user.id;
  if (!staff) {
    const { data: m } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", tournamentId).eq("user_id", user.id).maybeSingle();
    staff = !!m;
  }
  if (!staff) return { ok: false as const, error: "Not allowed." };

  const published_results = await buildResultsSnapshot(tournamentId);
  if (published_results.divisions.length === 0) return { ok: false as const, error: "Nothing to publish yet." };

  const fc = { ...((to.format_config ?? {}) as Record<string, unknown>), results_published: true, published_results };
  const { error } = await supabase.from("tournaments").update({ format_config: fc as Json, updated_at: new Date().toISOString() }).eq("id", tournamentId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath(`/tournament/${tournamentId}/brackets`);
  if (to.code) revalidatePath(`/e/${to.code}`);
  return { ok: true as const };
}

/** Take the competition view down from the public page (also turns auto-publish
 *  off). The snapshot is left in place so re-publishing is instant. Staff-only. */
export async function unpublishResults(tournamentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: to } = await supabase.from("tournaments").select("owner_id, code, format_config").eq("id", tournamentId).maybeSingle();
  if (!to) return { ok: false as const, error: "Not found." };
  let staff = to.owner_id === user.id;
  if (!staff) {
    const { data: m } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", tournamentId).eq("user_id", user.id).maybeSingle();
    staff = !!m;
  }
  if (!staff) return { ok: false as const, error: "Not allowed." };

  const fc = { ...((to.format_config ?? {}) as Record<string, unknown>), results_published: false, results_auto_publish: false };
  const { error } = await supabase.from("tournaments").update({ format_config: fc as Json, updated_at: new Date().toISOString() }).eq("id", tournamentId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath(`/tournament/${tournamentId}/brackets`);
  if (to.code) revalidatePath(`/e/${to.code}`);
  return { ok: true as const };
}

/** Toggle auto-publish. Turning it on ensures results are published with a fresh
 *  snapshot so the public page immediately reflects live results. Staff-only. */
export async function setResultsAutoPublish(tournamentId: string, on: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: to } = await supabase.from("tournaments").select("owner_id, code, format_config").eq("id", tournamentId).maybeSingle();
  if (!to) return { ok: false as const, error: "Not found." };
  let staff = to.owner_id === user.id;
  if (!staff) {
    const { data: m } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", tournamentId).eq("user_id", user.id).maybeSingle();
    staff = !!m;
  }
  if (!staff) return { ok: false as const, error: "Not allowed." };

  const base: Record<string, unknown> = { ...((to.format_config ?? {}) as Record<string, unknown>), results_auto_publish: on };
  if (on) {
    base.results_published = true;
    base.published_results = await buildResultsSnapshot(tournamentId);
  }
  const { error } = await supabase.from("tournaments").update({ format_config: base as Json, updated_at: new Date().toISOString() }).eq("id", tournamentId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath(`/tournament/${tournamentId}/brackets`);
  if (to.code) revalidatePath(`/e/${to.code}`);
  return { ok: true as const };
}

/** Publish the built schedule to the public event page. The client passes the
 *  fully-resolved rows (court, wall-clock time, names) it already rendered, so
 *  times stay in the event's local timezone for every viewer. We snapshot them
 *  into format_config.published_schedule — anon already reads format_config, so
 *  no extra RLS is needed. Staff-only. */
export async function publishSchedule(
  tournamentId: string,
  snapshot: { mode: string; rows: { court: string; time: string | null; division: string; pool: string | null; a: string; b: string }[] },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: to } = await supabase.from("tournaments").select("owner_id, code, format_config").eq("id", tournamentId).maybeSingle();
  if (!to) return { ok: false as const, error: "Not found." };
  let staff = to.owner_id === user.id;
  if (!staff) {
    const { data: m } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", tournamentId).eq("user_id", user.id).maybeSingle();
    staff = !!m;
  }
  if (!staff) return { ok: false as const, error: "Not allowed." };

  const rows = (snapshot.rows ?? []).slice(0, 2000).map((r) => ({
    court: String(r.court ?? "").slice(0, 40),
    time: r.time ? String(r.time).slice(0, 40) : null,
    division: String(r.division ?? "").slice(0, 120),
    pool: r.pool ? String(r.pool).slice(0, 60) : null,
    a: String(r.a ?? "").slice(0, 120),
    b: String(r.b ?? "").slice(0, 120),
  }));
  if (rows.length === 0) return { ok: false as const, error: "Build the schedule before publishing." };

  const published_schedule = { builtAt: new Date().toISOString(), mode: snapshot.mode === "ordered" ? "ordered" : "timed", rows };
  const fc = { ...((to.format_config ?? {}) as Record<string, unknown>), schedule_published: true, published_schedule };
  const { error } = await supabase.from("tournaments").update({ format_config: fc as Json, updated_at: new Date().toISOString() }).eq("id", tournamentId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath(`/tournament/${tournamentId}/schedule`);
  if (to.code) revalidatePath(`/e/${to.code}`);
  return { ok: true as const };
}

/** Take the schedule down from the public event page (keeps the snapshot so it
 *  can be re-published instantly). Staff-only. */
export async function unpublishSchedule(tournamentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: to } = await supabase.from("tournaments").select("owner_id, code, format_config").eq("id", tournamentId).maybeSingle();
  if (!to) return { ok: false as const, error: "Not found." };
  let staff = to.owner_id === user.id;
  if (!staff) {
    const { data: m } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", tournamentId).eq("user_id", user.id).maybeSingle();
    staff = !!m;
  }
  if (!staff) return { ok: false as const, error: "Not allowed." };

  const fc = { ...((to.format_config ?? {}) as Record<string, unknown>), schedule_published: false };
  const { error } = await supabase.from("tournaments").update({ format_config: fc as Json, updated_at: new Date().toISOString() }).eq("id", tournamentId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath(`/tournament/${tournamentId}/schedule`);
  if (to.code) revalidatePath(`/e/${to.code}`);
  return { ok: true as const };
}

/** Remove a division's pools (and any pool matches). Staff-only. */
export async function clearGroups(tournamentId: string, divisionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: to } = await supabase.from("tournaments").select("owner_id").eq("id", tournamentId).maybeSingle();
  let staff = to?.owner_id === user.id;
  if (!staff) {
    const { data: m } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", tournamentId).eq("user_id", user.id).maybeSingle();
    staff = !!m;
  }
  if (!staff) return { ok: false as const, error: "Not allowed." };

  await supabase.from("tournament_matches").delete().eq("division_id", divisionId).not("group_id", "is", null);
  await supabase.from("tournament_groups").delete().eq("division_id", divisionId);
  await republishResultsIfAuto(tournamentId);
  revalidatePath(`/tournament/${tournamentId}/brackets`);
  return { ok: true as const };
}

/** Record a match result. Winner is the higher score (equal = draw, no winner).
 *  Staff-only. */
export async function recordMatchScore(matchId: string, scoreA: number, scoreB: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: m } = await supabase.from("tournament_matches").select("id, tournament_id, entry_a, entry_b, next_match_id, next_slot").eq("id", matchId).maybeSingle();
  if (!m) return { ok: false as const, error: "Match not found." };

  const { data: to } = await supabase.from("tournaments").select("owner_id").eq("id", m.tournament_id).maybeSingle();
  let staff = to?.owner_id === user.id;
  if (!staff) {
    const { data: mm } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", m.tournament_id).eq("user_id", user.id).maybeSingle();
    staff = !!mm;
  }
  if (!staff) return { ok: false as const, error: "Not allowed." };

  if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) return { ok: false as const, error: "Enter valid scores." };
  const a = Math.max(0, Math.round(scoreA));
  const b = Math.max(0, Math.round(scoreB));
  const winner = a > b ? m.entry_a : b > a ? m.entry_b : null;

  const { error } = await supabase
    .from("tournament_matches")
    .update({ score_a: a, score_b: b, winner_id: winner, status: "completed", updated_at: new Date().toISOString() })
    .eq("id", matchId);
  if (error) return { ok: false as const, error: error.message };

  // Bracket advancement: push the winner into the next match's slot.
  if (m.next_match_id) {
    if (m.next_slot === "b") await supabase.from("tournament_matches").update({ entry_b: winner }).eq("id", m.next_match_id);
    else await supabase.from("tournament_matches").update({ entry_a: winner }).eq("id", m.next_match_id);
  }

  await republishResultsIfAuto(m.tournament_id);
  revalidatePath(`/tournament/${m.tournament_id}/schedule`);
  revalidatePath(`/tournament/${m.tournament_id}/brackets`);
  return { ok: true as const };
}

/** Clear a recorded result back to pending. Staff-only. */
export async function clearMatchScore(matchId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: m } = await supabase.from("tournament_matches").select("id, tournament_id, next_match_id, next_slot").eq("id", matchId).maybeSingle();
  if (!m) return { ok: false as const, error: "Match not found." };

  const { data: to } = await supabase.from("tournaments").select("owner_id").eq("id", m.tournament_id).maybeSingle();
  let staff = to?.owner_id === user.id;
  if (!staff) {
    const { data: mm } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", m.tournament_id).eq("user_id", user.id).maybeSingle();
    staff = !!mm;
  }
  if (!staff) return { ok: false as const, error: "Not allowed." };

  const { error } = await supabase
    .from("tournament_matches")
    .update({ score_a: null, score_b: null, winner_id: null, status: "pending", updated_at: new Date().toISOString() })
    .eq("id", matchId);
  if (error) return { ok: false as const, error: error.message };

  // Retract the advanced winner from the next match's slot.
  if (m.next_match_id) {
    if (m.next_slot === "b") await supabase.from("tournament_matches").update({ entry_b: null }).eq("id", m.next_match_id);
    else await supabase.from("tournament_matches").update({ entry_a: null }).eq("id", m.next_match_id);
  }

  await republishResultsIfAuto(m.tournament_id);
  revalidatePath(`/tournament/${m.tournament_id}/schedule`);
  revalidatePath(`/tournament/${m.tournament_id}/brackets`);
  return { ok: true as const };
}

/** Draw a random single-elimination bracket for a division: cryptographically
 *  shuffled entries dropped into standard seed positions (so byes spread), with
 *  every round's matches created and linked for advancement. Byes auto-advance.
 *  Logged in the draw log like the pool draw. Staff-only. */
export async function generateBracket(tournamentId: string, divisionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: to } = await supabase.from("tournaments").select("owner_id").eq("id", tournamentId).maybeSingle();
  let staff = to?.owner_id === user.id;
  if (!staff) {
    const { data: m } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", tournamentId).eq("user_id", user.id).maybeSingle();
    staff = !!m;
  }
  if (!staff) return { ok: false as const, error: "Not allowed." };

  const { data: entries } = await supabase
    .from("tournament_registrations")
    .select("id, created_at")
    .eq("tournament_id", tournamentId)
    .eq("division_id", divisionId)
    .not("status", "in", "(withdrawn,declined)")
    .order("created_at");
  const ids = (entries ?? []).map((e) => e.id);
  if (ids.length < 2) return { ok: false as const, error: "Need at least 2 entries to draw a bracket." };

  const res = await buildBracketFromSeeds(supabase, tournamentId, divisionId, shuffle(ids));
  if (!res.ok) return res;

  const { count: priorDraws } = await supabase.from("tournament_draws").select("id", { count: "exact", head: true }).eq("division_id", divisionId);
  await supabase.from("tournament_draws").insert({ tournament_id: tournamentId, division_id: divisionId, draw_number: (priorDraws ?? 0) + 1, drawn_by: user.id });

  await republishResultsIfAuto(tournamentId);
  revalidatePath(`/tournament/${tournamentId}/brackets`);
  return { ok: true as const };
}

/** Remove a division's bracket matches. Staff-only. */
export async function clearBracket(tournamentId: string, divisionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: to } = await supabase.from("tournaments").select("owner_id").eq("id", tournamentId).maybeSingle();
  let staff = to?.owner_id === user.id;
  if (!staff) {
    const { data: m } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", tournamentId).eq("user_id", user.id).maybeSingle();
    staff = !!m;
  }
  if (!staff) return { ok: false as const, error: "Not allowed." };
  await supabase.from("tournament_matches").delete().eq("division_id", divisionId).is("group_id", null);
  await republishResultsIfAuto(tournamentId);
  revalidatePath(`/tournament/${tournamentId}/brackets`);
  return { ok: true as const };
}

/** Generate the knockout stage from pool results: take the top N from each pool
 *  by standings, order them by finish (winners are top seeds) with a crypto random
 *  tiebreak for exact ties, then build a seeded bracket. Earned from results, not
 *  chosen — no manual placement. Staff-only. */
export async function generateKnockout(tournamentId: string, divisionId: string, advancersPerPool: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: to } = await supabase.from("tournaments").select("owner_id").eq("id", tournamentId).maybeSingle();
  let staff = to?.owner_id === user.id;
  if (!staff) {
    const { data: m } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", tournamentId).eq("user_id", user.id).maybeSingle();
    staff = !!m;
  }
  if (!staff) return { ok: false as const, error: "Not allowed." };

  const { data: groups } = await supabase.from("tournament_groups").select("id, sort_order").eq("division_id", divisionId).order("sort_order");
  if (!groups || groups.length === 0) return { ok: false as const, error: "Draw the pools first." };

  const { data: ge } = await supabase.from("tournament_group_entries").select("group_id, registration_id").eq("division_id", divisionId);
  const { data: pmatches } = await supabase
    .from("tournament_matches")
    .select("group_id, entry_a, entry_b, score_a, score_b, status")
    .eq("division_id", divisionId)
    .not("group_id", "is", null);

  const adv = Math.max(1, Math.min(8, Math.floor(advancersPerPool) || 1));
  const qualifiers: { regId: string; finish: number; diff: number; pf: number; rand: number }[] = [];
  for (const g of groups) {
    const entries = (ge ?? []).filter((e) => e.group_id === g.id).map((e) => ({ regId: e.registration_id, name: "" }));
    const ms = (pmatches ?? [])
      .filter((m) => m.group_id === g.id)
      .map((m) => ({ entryA: m.entry_a, entryB: m.entry_b, scoreA: m.score_a, scoreB: m.score_b, status: m.status }));
    const standings = computePoolStandings(entries, ms);
    standings.slice(0, adv).forEach((s, idx) => {
      qualifiers.push({ regId: s.regId, finish: idx + 1, diff: s.diff, pf: s.pf, rand: randomInt(1_000_000) });
    });
  }
  if (qualifiers.length < 2) return { ok: false as const, error: "Not enough qualifiers yet — play more pool matches first." };

  qualifiers.sort((a, b) => a.finish - b.finish || b.diff - a.diff || b.pf - a.pf || a.rand - b.rand);
  const res = await buildBracketFromSeeds(supabase, tournamentId, divisionId, qualifiers.map((q) => q.regId));
  if (!res.ok) return res;

  await republishResultsIfAuto(tournamentId);
  revalidatePath(`/tournament/${tournamentId}/brackets`);
  return { ok: true as const };
}

/** Assign (or clear) a match's time and court. Setting a time marks an un-played
 *  match "scheduled"; clearing it returns to "pending". Completed stays completed.
 *  Staff-only. */
export async function setMatchSchedule(matchId: string, scheduledAt: string | null, court: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: m } = await supabase.from("tournament_matches").select("id, tournament_id, status").eq("id", matchId).maybeSingle();
  if (!m) return { ok: false as const, error: "Match not found." };

  const { data: to } = await supabase.from("tournaments").select("owner_id").eq("id", m.tournament_id).maybeSingle();
  let staff = to?.owner_id === user.id;
  if (!staff) {
    const { data: mm } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", m.tournament_id).eq("user_id", user.id).maybeSingle();
    staff = !!mm;
  }
  if (!staff) return { ok: false as const, error: "Not allowed." };

  const court_ = court && court.trim() ? court.trim().slice(0, 60) : null;
  const status = m.status === "completed" ? "completed" : scheduledAt ? "scheduled" : "pending";

  const { error } = await supabase
    .from("tournament_matches")
    .update({ scheduled_at: scheduledAt, court: court_, status, updated_at: new Date().toISOString() })
    .eq("id", matchId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath(`/tournament/${m.tournament_id}/planner`);
  return { ok: true as const };
}

/** Award community ranking points for a finished tournament. Computes each division's
 *  final placements from results (knockout bracket and/or pool standings), converts
 *  place + field size into points (lib/ranking — no organizer multipliers), writes the
 *  points ledger, then recomputes every affected player's per-sport points as a rolling
 *  best-N over the last year. Safe to re-run as more results come in. Staff-only. */
export async function awardTournamentPoints(tournamentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: to } = await supabase.from("tournaments").select("owner_id, sport_key, format_config").eq("id", tournamentId).maybeSingle();
  if (!to) return { ok: false as const, error: "Tournament not found." };
  let staff = to.owner_id === user.id;
  if (!staff) {
    const { data: m } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", tournamentId).eq("user_id", user.id).maybeSingle();
    staff = !!m;
  }
  if (!staff) return { ok: false as const, error: "Not allowed." };

  const admin = createAdminClient();
  const sport = to.sport_key;
  const fc = (to.format_config ?? {}) as TournamentFormatConfig;
  const formatType = fc.format_type ?? "pools_knockout";

  const { data: divisions } = await admin.from("tournament_divisions").select("id").eq("tournament_id", tournamentId);
  const divs = divisions ?? [];
  if (divs.length === 0) return { ok: false as const, error: "No divisions to award." };

  const { data: regs } = await admin.from("tournament_registrations").select("id, division_id, registrant_id").eq("tournament_id", tournamentId).not("status", "in", "(withdrawn,declined)");
  const regList = regs ?? [];
  const { data: players } = await admin.from("tournament_registration_players").select("registration_id, user_id, is_reserve, played").eq("tournament_id", tournamentId);
  const playerList = players ?? [];
  const { data: matches } = await admin
    .from("tournament_matches")
    .select("id, division_id, group_id, round, entry_a, entry_b, winner_id, status, score_a, score_b")
    .eq("tournament_id", tournamentId);
  const matchList = matches ?? [];
  // Gate: ranking points can only be awarded once every match has a result.
  if (matchList.length === 0 || matchList.some((m) => m.status !== "completed")) {
    return { ok: false as const, error: "Award ranking points once all results are in." };
  }
  const { data: ge } = await admin.from("tournament_group_entries").select("division_id, group_id, registration_id").eq("tournament_id", tournamentId);
  const geList = ge ?? [];

  type LedgerRow = { user_id: string; sport_key: string; tournament_id: string; division_id: string; registration_id: string; points: number; place: number; field_size: number; played: boolean };
  const ledgerRows: LedgerRow[] = [];

  for (const d of divs) {
    const dRegs = regList.filter((r) => r.division_id === d.id);
    if (dRegs.length === 0) continue;
    const N = dRegs.length;
    const placeByReg = new Map<string, number>();
    const knockout = matchList.filter((m) => m.division_id === d.id && m.group_id === null);

    if (formatType === "single_elim") {
      bracketPlaces(knockout.map((m) => ({ round: m.round, entryA: m.entry_a, entryB: m.entry_b, winnerId: m.winner_id, status: m.status }))).forEach((p, reg) => placeByReg.set(reg, p));
    } else {
      const groupsForDiv = [...new Set(geList.filter((e) => e.division_id === d.id).map((e) => e.group_id))];
      const poolOrder: { reg: string; finish: number; diff: number; pf: number }[] = [];
      for (const gid of groupsForDiv) {
        const entries = geList.filter((e) => e.group_id === gid).map((e) => ({ regId: e.registration_id, name: "" }));
        const ms = matchList.filter((m) => m.group_id === gid).map((m) => ({ entryA: m.entry_a, entryB: m.entry_b, scoreA: m.score_a, scoreB: m.score_b, status: m.status }));
        computePoolStandings(entries, ms).forEach((s, idx) => poolOrder.push({ reg: s.regId, finish: idx + 1, diff: s.diff, pf: s.pf }));
      }
      if (formatType === "pools_knockout" && knockout.length > 0) {
        bracketPlaces(knockout.map((m) => ({ round: m.round, entryA: m.entry_a, entryB: m.entry_b, winnerId: m.winner_id, status: m.status }))).forEach((p, reg) => placeByReg.set(reg, p));
        const knockoutCount = placeByReg.size;
        poolOrder
          .filter((q) => !placeByReg.has(q.reg))
          .sort((a, b) => a.finish - b.finish || b.diff - a.diff || b.pf - a.pf)
          .forEach((q, i) => placeByReg.set(q.reg, knockoutCount + 1 + i));
      } else {
        poolOrder.sort((a, b) => a.finish - b.finish || b.diff - a.diff || b.pf - a.pf).forEach((q, i) => placeByReg.set(q.reg, i + 1));
      }
    }

    for (const r of dRegs) {
      const place = placeByReg.get(r.id);
      if (!place) continue;
      const entryPts = placementPoints(place, N);
      let ps = playerList.filter((p) => p.registration_id === r.id);
      if (ps.length === 0) ps = [{ registration_id: r.id, user_id: r.registrant_id, is_reserve: false, played: true }];
      for (const p of ps) {
        const effectivePlayed = p.played ?? !p.is_reserve;
        ledgerRows.push({
          user_id: p.user_id,
          sport_key: sport,
          tournament_id: tournamentId,
          division_id: d.id,
          registration_id: r.id,
          points: Math.round(entryPts * (effectivePlayed ? 1 : RESERVE_FACTOR)),
          place,
          field_size: N,
          played: effectivePlayed,
        });
      }
    }
  }

  if (ledgerRows.length === 0) return { ok: false as const, error: "No completed results yet — enter scores first, then award points." };

  const { error: upErr } = await admin.from("tournament_points").upsert(ledgerRows, { onConflict: "division_id,user_id" });
  if (upErr) return { ok: false as const, error: upErr.message };

  const userIds = [...new Set(ledgerRows.map((r) => r.user_id))];
  const cutoff = new Date(Date.now() - ROLLING_WEEKS * 7 * 24 * 3600 * 1000).toISOString();
  for (const uid of userIds) {
    const { data: led } = await admin.from("tournament_points").select("points").eq("user_id", uid).eq("sport_key", sport).gte("earned_at", cutoff).order("points", { ascending: false }).limit(ROLLING_BEST);
    const total = (led ?? []).reduce((s, x) => s + (x.points ?? 0), 0);
    await admin.from("player_sports").upsert({ user_id: uid, sport_key: sport, points: total, updated_at: new Date().toISOString() }, { onConflict: "user_id,sport_key" });
  }

  revalidatePath(`/tournament/${tournamentId}/brackets`);
  revalidatePath("/rankings");
  return { ok: true as const, awarded: userIds.length };
}

/* ---------- public event photo gallery (bucket: tournament-gallery) ---------- */

const GALLERY_BUCKET = "tournament-gallery";
const GALLERY_TYPES = new Set(["image/webp", "image/jpeg", "image/png"]);
const GALLERY_MAX = 5;

async function galleryStaffGuard(tournamentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: to } = await supabase.from("tournaments").select("owner_id, code, format_config").eq("id", tournamentId).maybeSingle();
  if (!to) return { ok: false as const, error: "Not found." };
  let staff = to.owner_id === user.id;
  if (!staff) {
    const { data: m } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", tournamentId).eq("user_id", user.id).maybeSingle();
    staff = !!m;
  }
  if (!staff) return { ok: false as const, error: "Not allowed." };
  return { ok: true as const, to };
}

/** Mint a single-use signed upload URL for an event gallery photo. Staff-only;
 *  the path is built server-side and the upload runs through the service role. */
export async function createGalleryUploadUrl(tournamentId: string, contentType: string) {
  if (!GALLERY_TYPES.has(contentType)) return { ok: false as const, error: "Use a JPG, PNG, or WebP image." };
  const guard = await galleryStaffGuard(tournamentId);
  if (!guard.ok) return { ok: false as const, error: guard.error };
  const ext = contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
  const path = `${tournamentId}/${randomUUID()}.${ext}`;
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(GALLERY_BUCKET).createSignedUploadUrl(path);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, path, token: data.token };
}

/** Append a freshly uploaded photo's public URL to the event gallery. Staff-only. */
export async function commitGalleryPhoto(tournamentId: string, path: string) {
  const guard = await galleryStaffGuard(tournamentId);
  if (!guard.ok) return { ok: false as const, error: guard.error };
  if (!path.startsWith(`${tournamentId}/`)) return { ok: false as const, error: "Invalid path." };
  const admin = createAdminClient();
  const { data: pub } = admin.storage.from(GALLERY_BUCKET).getPublicUrl(path);
  const url = pub.publicUrl;
  const fc = (guard.to.format_config ?? {}) as Record<string, unknown>;
  const current = Array.isArray(fc.gallery) ? (fc.gallery as unknown[]).map(String) : [];
  if (current.length >= GALLERY_MAX) return { ok: false as const, error: `You can add up to ${GALLERY_MAX} photos.` };
  const gallery = [...current, url];
  const supabase = await createClient();
  const { error } = await supabase.from("tournaments").update({ format_config: { ...fc, gallery } as Json, updated_at: new Date().toISOString() }).eq("id", tournamentId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/tournament/${tournamentId}/settings`);
  if (guard.to.code) revalidatePath(`/e/${guard.to.code}`);
  return { ok: true as const, url };
}

/** Remove a photo from the gallery and delete the underlying object. Staff-only. */
export async function removeGalleryPhoto(tournamentId: string, url: string) {
  const guard = await galleryStaffGuard(tournamentId);
  if (!guard.ok) return { ok: false as const, error: guard.error };
  const fc = (guard.to.format_config ?? {}) as Record<string, unknown>;
  const current = Array.isArray(fc.gallery) ? (fc.gallery as unknown[]).map(String) : [];
  const gallery = current.filter((u) => u !== url);
  const supabase = await createClient();
  const { error } = await supabase.from("tournaments").update({ format_config: { ...fc, gallery } as Json, updated_at: new Date().toISOString() }).eq("id", tournamentId);
  if (error) return { ok: false as const, error: error.message };
  const marker = `/${GALLERY_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx !== -1) {
    const admin = createAdminClient();
    await admin.storage.from(GALLERY_BUCKET).remove([url.slice(idx + marker.length)]);
  }
  revalidatePath(`/tournament/${tournamentId}/settings`);
  if (guard.to.code) revalidatePath(`/e/${guard.to.code}`);
  return { ok: true as const };
}

/** A registrant withdraws their own entry (or leaves the waitlist). Frees the
 *  spot so the organizer can notify the waitlist that room has opened. */
export async function withdrawRegistration(registrationId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const admin = createAdminClient();
  const { data: reg } = await admin.from("tournament_registrations").select("id, registrant_id, tournament_id, status").eq("id", registrationId).maybeSingle();
  if (!reg) return { ok: false, error: "Entry not found." };
  if (reg.registrant_id !== user.id) return { ok: false, error: "You can only withdraw your own entry." };
  if (reg.status === "withdrawn") return { ok: true };
  await admin.from("tournament_registrations").update({ status: "withdrawn" }).eq("id", reg.id);
  revalidatePath("/tournaments");
  revalidatePath(`/tournament/${reg.tournament_id}/registrations`);
  return { ok: true };
}

/** Per-division pool structure (groups × per-group). Derives + stores the division's
 *  capacity and switches the event to per-division caps, so each division is sized
 *  independently — no equal split of a shared total. Staff only. */
// Save the group structure for EVERY division at once, plus the tournament-wide
// capacity ceiling. Each division's groups × size becomes its registration cap;
// the combined total is bounded by `max`. The client rebalances live so the sum
// never exceeds `max`, and this action enforces the same invariant defensively.
export async function saveDivisionStructures(
  tournamentId: string,
  max: number | null,
  items: { divisionId: string; groups: number; per: number; extra?: number; mode?: "grow" | "pool" }[],
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: to } = await supabase.from("tournaments").select("owner_id, format_config").eq("id", tournamentId).maybeSingle();
  if (!to) return { ok: false as const, error: "Event not found." };
  let staff = to.owner_id === user.id;
  if (!staff) {
    const { data: m } = await supabase.from("tournament_managers").select("user_id").eq("tournament_id", tournamentId).eq("user_id", user.id).maybeSingle();
    staff = !!m;
  }
  if (!staff) return { ok: false as const, error: "Not allowed." };

  const ceiling = max != null && Number.isFinite(max) && max > 0 ? Math.floor(max) : null;
  const clean = items.map((it) => {
    const g = Math.max(1, Math.min(16, Math.floor(it.groups) || 1));
    const p = Math.max(1, Math.min(64, Math.floor(it.per) || 1));
    const extra = Math.max(0, Math.min(64, Math.floor(it.extra ?? 0) || 0));
    const mode: "grow" | "pool" = it.mode === "pool" ? "pool" : "grow";
    return { divisionId: it.divisionId, groups: g, per: p, extra, mode, capacity: g * p + extra };
  });

  // Defensive: the combined allocation must never exceed the tournament cap.
  if (ceiling != null) {
    const total = clean.reduce((a, c) => a + c.capacity, 0);
    if (total > ceiling) return { ok: false as const, error: "Allocations exceed the tournament capacity." };
  }

  for (const c of clean) {
    const { error } = await supabase
      .from("tournament_divisions")
      .update({ group_count: c.groups, group_size: c.per, group_extra: c.extra, group_extra_mode: c.mode, capacity: c.capacity, updated_at: new Date().toISOString() })
      .eq("id", c.divisionId)
      .eq("tournament_id", tournamentId);
    if (error) return { ok: false as const, error: error.message };
  }

  // The shared cap and capacity mode are owned by Settings → Format & eligibility.
  // This action only persists each division's pool structure; it never writes the
  // tournament-level capacity, so the two pages can't fight over it.
  revalidatePath(`/tournament/${tournamentId}/brackets`);
  return { ok: true as const };
}
