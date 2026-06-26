"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { accountActive } from "@/lib/guards";
import { SPORT_KEYS, type SportKey } from "@/lib/sports";

export async function rsvp(formData: FormData) {
  const id = String(formData.get("eventId"));
  if (!id) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/events/${id}`);
  if (!(await accountActive(supabase, user.id))) return;

  const { data: ev } = await supabase.from("events").select("id, status, starts_at, capacity").eq("id", id).maybeSingle();
  if (!ev || ev.status !== "active") return;
  if (new Date(ev.starts_at).getTime() < Date.now()) return; // event already started

  if (ev.capacity != null) {
    const { count } = await supabase.from("event_rsvps").select("*", { count: "exact", head: true }).eq("event_id", id);
    if ((count ?? 0) >= ev.capacity) return; // full
  }

  await supabase.from("event_rsvps").insert({ event_id: id, user_id: user.id });
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

async function eventCreatorGuard(eventId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: ev } = await supabase.from("events").select("id, created_by, cover_path").eq("id", eventId).maybeSingle();
  if (!ev) return { ok: false as const, error: "Event not found." };
  if (ev.created_by !== user.id) return { ok: false as const, error: "Only the event's host can change its photo." };
  return { ok: true as const, ev };
}

/** Mint a single-use signed upload URL for an event cover. Creator-only; path is built server-side. */
export async function createEventCoverUploadUrl(eventId: string, contentType: string) {
  if (!COVER_TYPES.has(contentType)) return { ok: false as const, error: "Use a JPG, PNG, or WebP image." };
  const guard = await eventCreatorGuard(eventId);
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
  const guard = await eventCreatorGuard(eventId);
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

/** Remove the event cover and delete the underlying object. Creator-only. */
export async function removeEventCover(eventId: string) {
  const guard = await eventCreatorGuard(eventId);
  if (!guard.ok) return { ok: false as const, error: guard.error };
  const admin = createAdminClient();
  const { error } = await admin.from("events").update({ cover_path: null }).eq("id", eventId);
  if (error) return { ok: false as const, error: error.message };
  if (guard.ev.cover_path) await admin.storage.from(COVER_BUCKET).remove([guard.ev.cover_path]);
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
};

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
  return {
    row: {
      title: title.slice(0, 140),
      sport_key: input.sport_key,
      kind,
      description: (input.description ?? "").trim().slice(0, 2000) || null,
      location_text: (input.location_text ?? "").trim().slice(0, 200) || null,
      starts_at: starts.toISOString(),
      ends_at: endsIso,
      capacity: cap,
      cost_text: (input.cost_text ?? "").trim().slice(0, 60) || null,
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Please sign in." };

  const { data: ev } = await supabase.from("events").select("created_by").eq("id", eventId).maybeSingle();
  if (!ev) return { ok: false as const, error: "Event not found." };
  if (ev.created_by !== user.id) return { ok: false as const, error: "Only the host can edit this event." };

  const norm = normalizeEvent(input);
  if ("error" in norm) return { ok: false as const, error: norm.error };

  const { error } = await supabase.from("events").update(norm.row).eq("id", eventId);
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
