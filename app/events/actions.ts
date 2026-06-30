"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { accountActive } from "@/lib/guards";
import { SPORT_KEYS, type SportKey } from "@/lib/sports";
import { sanitizeRichText } from "@/lib/rich-text";

export async function rsvp(formData: FormData) {
  const id = String(formData.get("eventId"));
  if (!id) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/events/${id}`);
  if (!(await accountActive(supabase, user.id))) return;

  const { data: ev } = await supabase.from("events").select("id, status, starts_at, capacity, created_by, join_policy").eq("id", id).maybeSingle();
  if (!ev || ev.status !== "active") return;
  if (new Date(ev.starts_at).getTime() < Date.now()) return; // event already started

  // Owner/admins are always confirmed; otherwise approval-required events hold the join as pending.
  let isAdmin = ev.created_by === user.id;
  if (!isAdmin) {
    const { data: m } = await supabase.from("event_managers").select("user_id").eq("event_id", id).eq("user_id", user.id).maybeSingle();
    isAdmin = !!m;
  }
  const status = ev.join_policy === "approval" && !isAdmin ? "pending" : "going";

  if (status === "going" && ev.capacity != null) {
    const { count } = await supabase.from("event_rsvps").select("*", { count: "exact", head: true }).eq("event_id", id).eq("status", "going");
    if ((count ?? 0) >= ev.capacity) return; // full
  }

  await supabase.from("event_rsvps").upsert({ event_id: id, user_id: user.id, status }, { onConflict: "event_id,user_id" });
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

const EVENT_KINDS = ["open_play", "ladder", "clinic", "tournament", "social"];

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
  const kind = EVENT_KINDS.includes(input.kind) ? input.kind : "open_play";
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

  const { data, error } = await supabase
    .from("events")
    .insert({ ...norm.row, created_by: user.id, status: "active" })
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

export async function setQueueEnabled(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const enabled = formData.get("enabled") != null;
  if (!eventId) return;
  const guard = await eventAdminGuard(eventId);
  if (!guard.ok) return;
  const admin = createAdminClient();
  await admin.from("events").update({ queue_enabled: enabled }).eq("id", eventId);
  revalidatePath(`/events/${eventId}`);
}
