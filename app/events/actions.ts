"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { wipeSession, ensureQueueLive, sessionPatch } from "@/lib/queue-state";
import { accountActive } from "@/lib/guards";
import { SPORT_KEYS, type SportKey } from "@/lib/sports";
import { sanitizeRichText } from "@/lib/rich-text";
import { ALL_EVENT_KIND_VALUES } from "@/lib/event-kinds";
import { withinRecoverWindow } from "@/lib/recover";
import { rsvpCycleStartISO } from "@/lib/event-schedule";

export async function rsvp(formData: FormData) {
  const id = String(formData.get("eventId"));
  if (!id) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/events/${id}`);
  if (!(await accountActive(supabase, user.id))) return;

  const { data: ev } = await supabase.from("events").select("id, status, starts_at, capacity, created_by, join_policy, recurrence, recurrence_days").eq("id", id).maybeSingle();
  if (!ev || ev.status !== "active") return;
  // Block only one-time events that have already started. Recurring events keep accepting
  // RSVPs for the next occurrence even though their original starts_at is in the past.
  if ((ev.recurrence ?? "none") === "none" && new Date(ev.starts_at).getTime() < Date.now()) return;

  // Owner/admins are always confirmed; otherwise approval-required events hold the join as pending.
  let isAdmin = ev.created_by === user.id;
  if (!isAdmin) {
    const { data: m } = await supabase.from("event_managers").select("user_id").eq("event_id", id).eq("user_id", user.id).maybeSingle();
    isAdmin = !!m;
  }
  const status = ev.join_policy === "approval" && !isAdmin ? "pending" : "going";

  if (status === "going" && ev.capacity != null) {
    // Only count RSVPs from the current cycle toward capacity (stale ones don't fill seats).
    const cycleStartISO = rsvpCycleStartISO(ev.starts_at, ev.recurrence, ev.recurrence_days ?? []);
    let q = supabase.from("event_rsvps").select("*", { count: "exact", head: true }).eq("event_id", id).eq("status", "going");
    if (cycleStartISO) q = q.gt("created_at", cycleStartISO);
    const { count } = await q;
    if ((count ?? 0) >= ev.capacity) return; // full
  }

  // Refresh created_at so a re-RSVP after a reset counts for the new cycle.
  await supabase.from("event_rsvps").upsert({ event_id: id, user_id: user.id, status, created_at: new Date().toISOString() }, { onConflict: "event_id,user_id" });

  // Organizers hear about their own event filling up (not about themselves).
  if (ev.created_by && ev.created_by !== user.id) {
    const [{ data: me }, { data: evRow }] = await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
      supabase.from("events").select("title").eq("id", id).maybeSingle(),
    ]);
    await createNotification({
      userId: ev.created_by,
      kind: "system",
      title:
        status === "pending"
          ? `Join request \u2014 ${evRow?.title ?? "your event"}`
          : `${me?.display_name || "A player"} is going \u2014 ${evRow?.title ?? "your event"}`,
      body: status === "pending" ? `${me?.display_name || "A player"} is waiting on your approval.` : undefined,
      linkUrl: `/events/${id}`,
    });
  }

  revalidatePath(`/events/${id}`);
  revalidatePath("/events");
}

export async function cancelRsvp(formData: FormData) {
  const id = String(formData.get("eventId"));
  if (!id) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("event_rsvps").delete().eq("event_id", id).eq("user_id", user.id);
  revalidatePath(`/events/${id}`);
  revalidatePath("/events");
}

/* ---------- creator-uploaded event cover photo (bucket: tournament-gallery) ---------- */

const COVER_BUCKET = "tournament-gallery";
const COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function eventAdminGuard(eventId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: ev } = await supabase.from("events").select("id, created_by, cover_path, thumb_path").eq("id", eventId).maybeSingle();
  if (!ev) return { ok: false as const, error: "Event not found." };
  let admin = ev.created_by === user.id;
  if (!admin) {
    const { data: m } = await supabase.from("event_managers").select("user_id").eq("event_id", eventId).eq("user_id", user.id).maybeSingle();
    admin = !!m;
  }
  if (!admin) return { ok: false as const, error: "Only an event admin can do that." };
  return { ok: true as const, ev, user, isOwner: ev.created_by === user.id };
}

/** Mint a single-use signed upload URL for an event cover. Creator-only; path is built server-side. */
export async function createEventCoverUploadUrl(eventId: string, contentType: string) {
  if (!COVER_TYPES.has(contentType)) return { ok: false as const, error: "Use a JPG, PNG, or WebP image." };
  const guard = await eventAdminGuard(eventId);
  if (!guard.ok) return { ok: false as const, error: guard.error };
  const ext = contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
  const path = `event-cover/${eventId}/${randomUUID()}.${ext}`;
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(COVER_BUCKET).createSignedUploadUrl(path);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, path, token: data.token };
}

/** Point the event at a freshly uploaded cover; clean up the prior object. Creator-only. */
export async function setEventCover(eventId: string, path: string) {
  const guard = await eventAdminGuard(eventId);
  if (!guard.ok) return { ok: false as const, error: guard.error };
  if (!path.startsWith(`event-cover/${eventId}/`)) return { ok: false as const, error: "Invalid path." };
  const admin = createAdminClient();
  const { error } = await admin.from("events").update({ cover_path: path }).eq("id", eventId);
  if (error) return { ok: false as const, error: error.message };
  const prev = guard.ev.cover_path;
  if (prev && prev !== path) await admin.storage.from(COVER_BUCKET).remove([prev]);
  const { data: pub } = admin.storage.from(COVER_BUCKET).getPublicUrl(path);
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  return { ok: true as const, url: pub.publicUrl, path };
}

/** Remove the event cover and delete the underlying object. Admin-only. */
export async function removeEventCover(eventId: string) {
  const guard = await eventAdminGuard(eventId);
  if (!guard.ok) return { ok: false as const, error: guard.error };
  const admin = createAdminClient();
  const { error } = await admin.from("events").update({ cover_path: null }).eq("id", eventId);
  if (error) return { ok: false as const, error: error.message };
  if (guard.ev.cover_path) await admin.storage.from(COVER_BUCKET).remove([guard.ev.cover_path]);
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  return { ok: true as const };
}

/* ---------- square card thumbnail (bucket: tournament-gallery) ---------- */

export async function createEventThumbUploadUrl(eventId: string, contentType: string) {
  if (!COVER_TYPES.has(contentType)) return { ok: false as const, error: "Use a JPG, PNG, or WebP image." };
  const guard = await eventAdminGuard(eventId);
  if (!guard.ok) return { ok: false as const, error: guard.error };
  const ext = contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
  const path = `event-thumb/${eventId}/${randomUUID()}.${ext}`;
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(COVER_BUCKET).createSignedUploadUrl(path);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, path, token: data.token };
}

export async function setEventThumb(eventId: string, path: string) {
  const guard = await eventAdminGuard(eventId);
  if (!guard.ok) return { ok: false as const, error: guard.error };
  if (!path.startsWith(`event-thumb/${eventId}/`)) return { ok: false as const, error: "Invalid path." };
  const admin = createAdminClient();
  const { error } = await admin.from("events").update({ thumb_path: path }).eq("id", eventId);
  if (error) return { ok: false as const, error: error.message };
  const prev = guard.ev.thumb_path;
  if (prev && prev !== path) await admin.storage.from(COVER_BUCKET).remove([prev]);
  const { data: pub } = admin.storage.from(COVER_BUCKET).getPublicUrl(path);
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  return { ok: true as const, url: pub.publicUrl, path };
}

export async function removeEventThumb(eventId: string) {
  const guard = await eventAdminGuard(eventId);
  if (!guard.ok) return { ok: false as const, error: guard.error };
  const admin = createAdminClient();
  const { error } = await admin.from("events").update({ thumb_path: null }).eq("id", eventId);
  if (error) return { ok: false as const, error: error.message };
  if (guard.ev.thumb_path) await admin.storage.from(COVER_BUCKET).remove([guard.ev.thumb_path]);
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  return { ok: true as const };
}

/* ---------- event authoring (create / edit / cancel — host owns the row) ---------- */

/** Hosting ladder: approved Organizer status unlocks paid/large/all-kind events;
 *  every verified member can host bounded community events (free · social or
 *  open play · up to 12 · max 2 upcoming). */
const COMMUNITY_KINDS = new Set(["open_play", "social"]);
const looksFree = (c: string | null) => !c || /free|^\$?0(\.0{1,2})?$/i.test(c.trim());
async function isOrganizer(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<boolean> {
  const { data } = await supabase.from("class_providers").select("roles, status").eq("user_id", userId).maybeSingle();
  return data?.status === "approved" && Array.isArray(data.roles) && data.roles.includes("organizer");
}


type EventInput = {
  title: string;
  sport_key: string;
  kind: string;
  description?: string | null;
  location_text?: string | null;
  starts_at: string;
  ends_at?: string | null;
  capacity?: number | null;
  cost_text?: string | null;
  whatsapp_url?: string | null;
  location_url?: string | null;
  join_policy?: string;
  recurrence?: string;
  recurrence_days?: string[];
  queue_enabled?: boolean;
  host_ack?: boolean;
  location_reveal?: string;
};

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const RECURRENCES = ["daily", "weekly", "biweekly", "monthly"];

function cleanUrl(v?: string | null): string | null {
  const raw = (v ?? "").trim();
  if (!raw) return null;
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return url.slice(0, 500);
}
const cleanWhatsApp = cleanUrl;
const cleanMapsUrl = cleanUrl;
function cleanDays(days: string[] | undefined, recurrence: string): string[] {
  if (recurrence !== "weekly" && recurrence !== "biweekly") return [];
  const set = new Set((days ?? []).filter((d) => WEEKDAYS.includes(d)));
  return WEEKDAYS.filter((d) => set.has(d)); // keep canonical order
}

function normalizeEvent(input: EventInput) {
  const title = (input.title ?? "").trim();
  if (!title) return { error: "Add a title for your event." as const };
  if (!SPORT_KEYS.includes(input.sport_key as SportKey)) return { error: "Pick a sport." as const };
  const kind = ALL_EVENT_KIND_VALUES.includes(input.kind) ? input.kind : "open_play";
  const starts = new Date(input.starts_at);
  if (isNaN(starts.getTime())) return { error: "Add a valid date and time." as const };
  if (starts.getTime() < Date.now() - 60_000) return { error: "Pick a date and time in the future." as const };
  let endsIso: string | null = null;
  if (input.ends_at) {
    const ends = new Date(input.ends_at);
    if (!isNaN(ends.getTime())) {
      if (ends.getTime() <= starts.getTime()) return { error: "The end time must be after the start." as const };
      endsIso = ends.toISOString();
    }
  }
  const cap = input.capacity != null && Number.isFinite(input.capacity) && input.capacity > 0 ? Math.min(10000, Math.floor(input.capacity)) : null;
  const recurrence = RECURRENCES.includes(input.recurrence ?? "") ? (input.recurrence as string) : "none";
  return {
    row: {
      title: title.slice(0, 140),
      sport_key: input.sport_key,
      kind,
      description: sanitizeRichText(input.description) || null,
      location_text: (input.location_text ?? "").trim().slice(0, 200) || null,
      location_url: cleanMapsUrl(input.location_url),
      location_reveal: input.location_reveal === "rsvp" ? "rsvp" : "public",
      starts_at: starts.toISOString(),
      ends_at: endsIso,
      capacity: cap,
      cost_text: (input.cost_text ?? "").trim().slice(0, 60) || null,
      whatsapp_url: cleanWhatsApp(input.whatsapp_url),
      join_policy: input.join_policy === "approval" ? "approval" : "open",
      recurrence,
      recurrence_days: cleanDays(input.recurrence_days, recurrence),
      queue_enabled: !!input.queue_enabled,
    },
  };
}

export async function createEvent(input: EventInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Please sign in." };
  if (!(await accountActive(supabase, user.id))) return { ok: false as const, error: "Your account can't create events right now." };

  const norm = normalizeEvent(input);
  if ("error" in norm) return { ok: false as const, error: norm.error };

  if (!input.host_ack) {
    return { ok: false as const, error: "Please confirm the host acknowledgment to publish your event." };
  }

  // Community-event bounds for members without Organizer status.
  if (!(await isOrganizer(supabase, user.id))) {
    if (!COMMUNITY_KINDS.has(norm.row.kind)) {
      return { ok: false as const, error: "Community events can be open play or social. Ladder nights, clinics, and tournaments need Organizer status — apply under Settings → Professional & hosting." };
    }
    if (!looksFree(norm.row.cost_text)) {
      return { ok: false as const, error: "Community events are free to attend. Hosting paid events needs Organizer status — apply under Settings → Professional & hosting." };
    }
    const { count } = await supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("created_by", user.id)
      .eq("status", "active")
      .gte("starts_at", new Date().toISOString());
    if ((count ?? 0) >= 2) {
      return { ok: false as const, error: "You can have two upcoming community events at a time. Wrap one up first, or apply for Organizer status under Settings → Professional & hosting." };
    }
  }

  const { data, error } = await supabase
    .from("events")
    .insert({ ...norm.row, created_by: user.id, status: "active", host_ack_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error || !data) return { ok: false as const, error: error?.message ?? "Couldn't create the event." };
  revalidatePath("/events");
  return { ok: true as const, id: data.id };
}

export async function updateEvent(eventId: string, input: EventInput) {
  const guard = await eventAdminGuard(eventId);
  if (!guard.ok) return { ok: false as const, error: guard.error };

  const norm = normalizeEvent(input);
  if ("error" in norm) return { ok: false as const, error: norm.error };

  const admin = createAdminClient();
  const { error } = await admin.from("events").update(norm.row).eq("id", eventId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  return { ok: true as const, id: eventId };
}

export async function cancelEvent(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: ev } = await supabase.from("events").select("created_by").eq("id", eventId).maybeSingle();
  if (!ev || ev.created_by !== user.id) return;
  await supabase.from("events").update({ status: "cancelled" }).eq("id", eventId);
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
}

// How long a cancelled event/tournament/team stays recoverable before it's archived read-only.

/** Soft-cancel: keeps all data, turns off any live queue, recoverable for 90 days. */
export async function cancelEventById(eventId: string): Promise<{ error?: string } | void> {
  if (!eventId) return { error: "Missing event." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };
  const { data: ev } = await supabase.from("events").select("created_by").eq("id", eventId).maybeSingle();
  if (!ev) return { error: "Event not found." };
  if (ev.created_by !== user.id) return { error: "Only the organizer can cancel this event." };
  await supabase.from("events").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", eventId);
  // Turn off any live queue for this event — the session and its history are preserved.
  const admin = createAdminClient();
  await admin.from("court_sessions").update({ status: "ended", ended_at: new Date().toISOString() }).eq("event_id", eventId).eq("status", "live");
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
}

/** Recover a cancelled event within the 90-day window. Void form action. */
export async function reopenEvent(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: ev } = await supabase.from("events").select("created_by, cancelled_at, status").eq("id", eventId).maybeSingle();
  if (!ev || ev.created_by !== user.id || ev.status !== "cancelled") return;
  if (!withinRecoverWindow(ev.cancelled_at)) return; // archived — past the recovery window
  await supabase.from("events").update({ status: "active", cancelled_at: null }).eq("id", eventId);
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
}

/* ---------- membership approval, co-admins, and the live-queue toggle ---------- */

export async function approveMember(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!eventId || !userId) return;
  const guard = await eventAdminGuard(eventId);
  if (!guard.ok) return;
  const admin = createAdminClient();
  await admin.from("event_rsvps").update({ status: "going" }).eq("event_id", eventId).eq("user_id", userId).eq("status", "pending");
  revalidatePath(`/events/${eventId}`);
}

export async function denyMember(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!eventId || !userId) return;
  const guard = await eventAdminGuard(eventId);
  if (!guard.ok) return;
  const admin = createAdminClient();
  await admin.from("event_rsvps").delete().eq("event_id", eventId).eq("user_id", userId).eq("status", "pending");
  revalidatePath(`/events/${eventId}`);
}

export async function addAdmin(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!eventId || !userId) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: ev } = await supabase.from("events").select("created_by").eq("id", eventId).maybeSingle();
  if (!ev) return;
  if (ev.created_by !== user.id) return; // organizer-only
  if (userId === ev.created_by) return; // already an admin

  const admin = createAdminClient();
  // only people who've joined can be made admins
  const { data: member } = await admin.from("event_rsvps").select("user_id").eq("event_id", eventId).eq("user_id", userId).eq("status", "going").maybeSingle();
  if (!member) return;
  await admin.from("event_managers").upsert({ event_id: eventId, user_id: userId, added_by: user.id }, { onConflict: "event_id,user_id" });
  revalidatePath(`/events/${eventId}`);
}

export async function removeAdmin(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!eventId || !userId) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: ev } = await supabase.from("events").select("created_by").eq("id", eventId).maybeSingle();
  if (!ev) return;
  // the owner can remove anyone; anyone can step down themselves
  if (ev.created_by !== user.id && userId !== user.id) return;

  const admin = createAdminClient();
  await admin.from("event_managers").delete().eq("event_id", eventId).eq("user_id", userId);
  revalidatePath(`/events/${eventId}`);
}

type AdminCandidate = { id: string; name: string; avatarUrl: string | null; hue: number; city: string | null };

/** Organizer-only search for any active member to add as an event admin, excluding the
 *  organizer and anyone who is already an admin. Wildcards are stripped from the query. */
export async function searchEventAdminCandidates(eventId: string, qRaw: string): Promise<AdminCandidate[]> {
  const q = (qRaw ?? "").trim();
  if (!eventId || q.length < 2) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: ev } = await supabase.from("events").select("created_by").eq("id", eventId).maybeSingle();
  if (!ev || ev.created_by !== user.id) return []; // owner-only

  const admin = createAdminClient();
  const { data: mgrs } = await admin.from("event_managers").select("user_id").eq("event_id", eventId);
  const exclude = new Set<string>([ev.created_by ?? "", ...((mgrs ?? []).map((m) => m.user_id))]);
  const like = `%${q.replace(/[%_\\]/g, "")}%`;
  const { data: profs } = await admin
    .from("profiles")
    .select("id, display_name, avatar_hue, avatar_path, city, account_status")
    .ilike("display_name", like)
    .eq("account_status", "active")
    .limit(10);
  return ((profs ?? []) as { id: string; display_name: string; avatar_hue: number; avatar_path: string | null; city: string | null }[])
    .filter((p) => !exclude.has(p.id))
    .slice(0, 6)
    .map((p) => ({
      id: p.id,
      name: p.display_name,
      avatarUrl: p.avatar_path ? admin.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null,
      hue: p.avatar_hue,
      city: p.city,
    }));
}

/** Organizer-only: promote any active member to admin (they need not be attending). */
export async function setEventAdmin(eventId: string, userId: string): Promise<{ ok?: true; error?: string }> {
  if (!eventId || !userId) return { error: "Missing info." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };
  const { data: ev } = await supabase.from("events").select("created_by").eq("id", eventId).maybeSingle();
  if (!ev) return { error: "Event not found." };
  if (ev.created_by !== user.id) return { error: "Only the organizer manages admins." };
  if (userId === ev.created_by) return { ok: true };

  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("id, account_status").eq("id", userId).maybeSingle();
  if (!prof || prof.account_status !== "active") return { error: "That person isn't an active member." };
  await admin.from("event_managers").upsert({ event_id: eventId, user_id: userId, added_by: user.id }, { onConflict: "event_id,user_id" });
  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

/** Remove an admin. The organizer can remove anyone; an admin can step themselves down. */
export async function unsetEventAdmin(eventId: string, userId: string): Promise<{ ok?: true; error?: string }> {
  if (!eventId || !userId) return { error: "Missing info." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };
  const { data: ev } = await supabase.from("events").select("created_by").eq("id", eventId).maybeSingle();
  if (!ev) return { error: "Event not found." };
  if (ev.created_by !== user.id && userId !== user.id) return { error: "Not allowed." };

  const admin = createAdminClient();
  await admin.from("event_managers").delete().eq("event_id", eventId).eq("user_id", userId);
  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

export async function setQueueEnabled(formData: FormData): Promise<{ error: string | null }> {
  try {
    return await setQueueEnabledInner(formData);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[queue] setQueueEnabled threw:", msg);
    return { error: msg };
  }
}

async function setQueueEnabledInner(formData: FormData): Promise<{ error: string | null }> {
  const eventId = String(formData.get("eventId") ?? "");
  const enabled = formData.get("enabled") != null;
  if (!eventId) return { error: "Missing event." };
  const guard = await eventAdminGuard(eventId);
  if (!guard.ok) return { error: guard.error ?? "Not allowed." };
  const admin = createAdminClient();
  if (enabled) {
    // ON means PLAYING: create-or-revive the session, go live unpaused.
    const res = await ensureQueueLive(admin, { eventId, tournamentId: null }, guard.user.id);
    if (res.error) {
      console.error("[queue] turn-on failed for event", eventId, res.error);
      return { error: res.error };
    }
  } else {
    // OFF means BLANK SLATE: play state, courts and tuned settings all clear;
    // only the session row + its public code survive for printed QR posters.
    const { data: s } = await admin.from("court_sessions").select("id").eq("event_id", eventId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (s) {
      await wipeSession(admin, s.id);
      revalidatePath(`/queue/${s.id}`);
    }
    await admin.from("events").update({ queue_enabled: false }).eq("id", eventId);
  }
  revalidatePath(`/events/${eventId}`);
  return { error: null };
}

/** Pause / resume from the event panel: the match on court can finish, the
 *  next one waits, and every surface names who paused. */
/** Close or reopen a single court from the event panel (event-admin scoped;
 *  the queue page's own controls remain organizer-scoped). Closing waits for
 *  the match on that court to finish. */
export async function setEventCourtClosed(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const courtId = String(formData.get("courtId") ?? "");
  const closed = formData.get("closed") === "1";
  if (!eventId || !courtId) return;
  const guard = await eventAdminGuard(eventId);
  if (!guard.ok) return;
  const admin = createAdminClient();
  const { data: court } = await admin.from("queue_courts").select("id, session_id").eq("id", courtId).maybeSingle();
  if (!court) return;
  const { data: s } = await admin.from("court_sessions").select("event_id").eq("id", court.session_id).maybeSingle();
  if (s?.event_id !== eventId) return;
  if (closed) {
    const { data: live } = await admin.from("queue_matches").select("id").eq("court_id", courtId).eq("status", "live").maybeSingle();
    if (live) return;
  }
  await admin.from("queue_courts").update({ closed_at: closed ? new Date().toISOString() : null }).eq("id", courtId);
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/queue/${court.session_id}`);
}

export async function setEventQueuePaused(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const on = formData.get("on") === "1";
  if (!eventId) return;
  const guard = await eventAdminGuard(eventId);
  if (!guard.ok) return;
  const admin = createAdminClient();
  const { data: s } = await admin.from("court_sessions").select("id, status").eq("event_id", eventId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!s || s.status !== "live") return;
  await sessionPatch(admin, s.id, { paused: on, paused_by: on ? guard.user.id : null });
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/queue/${s.id}`);
}

