"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notify";
import { expandWeekly, takesSeat } from "@/lib/classes";

async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** True when the signed-in user is an approved class provider. */
export async function isApprovedProvider(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from("class_providers").select("status").eq("user_id", userId).maybeSingle();
  return data?.status === "approved";
}

// ── Provider: create a class (+ its sessions) ────────────────────────────────
export async function createClass(formData: FormData) {
  const { supabase, user } = await currentUser();
  if (!user) redirect("/login?next=/classes/new");
  if (!(await isApprovedProvider(user.id))) redirect("/classes");

  const s = (k: string) => (formData.get(k) as string | null)?.trim() || "";
  const title = s("title");
  const sport_key = s("sport_key");
  const firstISO = s("first_start_iso");
  if (!title || !sport_key || !firstISO) redirect("/classes/new?error=missing");

  const capacityRaw = parseInt(s("capacity"), 10);
  const capacity = Number.isFinite(capacityRaw) && capacityRaw > 0 ? capacityRaw : null;
  const isPaid = formData.get("paid") === "on";
  const priceDollars = parseFloat(s("price"));
  const price_cents = isPaid && Number.isFinite(priceDollars) && priceDollars > 0 ? Math.round(priceDollars * 100) : 0;
  const price_basis = s("price_basis") === "per_series" ? "per_series" : "per_session";
  const recurrence = s("recurrence") === "recurring" ? "recurring" : "one_off";
  const oneOf = (v: string, allowed: string[], def: string) => (allowed.includes(v) ? v : def);
  const class_format = oneOf(s("class_format"), ["group_class", "clinic", "private_lesson", "workshop", "camp", "open_play"], "group_class");
  const level_label = oneOf(s("level_label"), ["all", "beginner", "intermediate", "advanced", "pro"], "all");
  const age_group = oneOf(s("age_group"), ["all_ages", "adults", "youth", "seniors"], "all_ages");
  const gender_pref = oneOf(s("gender_pref"), ["all", "women", "men"], "all");
  const durationMin = (() => {
    const d = parseInt(s("duration_min"), 10);
    return Number.isFinite(d) && d > 0 ? d : 60;
  })();
  const weeks = recurrence === "recurring" ? parseInt(s("weeks"), 10) || 1 : 1;
  const publish = formData.get("publish") === "on";

  const { data: cls, error } = await supabase
    .from("classes")
    .insert({
      provider_id: user.id,
      sport_key,
      title,
      summary: s("summary") || null,
      description: s("description") || null,
      status: publish ? "published" : "draft",
      capacity,
      is_paid: isPaid,
      price_cents,
      price_basis,
      recurrence,
      location_name: s("location_name") || null,
      location_address: s("location_address") || null,
      location_zip: /^[0-9]{5}$/.test(s("location_zip")) ? s("location_zip") : null,
      class_format,
      level_label,
      age_group,
      gender_pref,
      what_to_bring: s("what_to_bring") || null,
      prerequisites: s("prerequisites") || null,
      cancellation_policy: s("cancellation_policy") || null,
    })
    .select("id")
    .single();
  if (error || !cls) redirect("/classes/new?error=save");

  const starts = expandWeekly(firstISO, weeks);
  const rows = starts.map((startISO) => {
    const end = new Date(new Date(startISO).getTime() + durationMin * 60000);
    return { class_id: cls.id, starts_at: startISO, ends_at: end.toISOString() };
  });
  if (rows.length) await supabase.from("class_sessions").insert(rows);

  revalidatePath("/classes");
  redirect(`/classes/${cls.id}`);
}

async function ownsClass(classId: string, userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from("classes").select("provider_id").eq("id", classId).maybeSingle();
  return data?.provider_id === userId;
}

export async function publishClass(formData: FormData) {
  const { supabase, user } = await currentUser();
  const classId = (formData.get("classId") as string) || "";
  if (!user || !classId || !(await ownsClass(classId, user.id))) return;
  await supabase.from("classes").update({ status: "published", updated_at: new Date().toISOString() }).eq("id", classId);
  revalidatePath(`/classes/${classId}`);
  revalidatePath("/classes");
}

export async function cancelClass(formData: FormData) {
  const { supabase, user } = await currentUser();
  const classId = (formData.get("classId") as string) || "";
  if (!user || !classId || !(await ownsClass(classId, user.id))) return;
  await supabase.from("classes").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", classId);
  await supabase.from("class_sessions").update({ status: "cancelled" }).eq("class_id", classId).eq("status", "scheduled");
  await notifyEnrollees(classId, null, "Class cancelled", "An organizer cancelled a class you were enrolled in.");
  revalidatePath(`/classes/${classId}`);
  revalidatePath("/classes");
}

export async function cancelSession(formData: FormData) {
  const { supabase, user } = await currentUser();
  const sessionId = (formData.get("sessionId") as string) || "";
  const classId = (formData.get("classId") as string) || "";
  if (!user || !sessionId || !classId || !(await ownsClass(classId, user.id))) return;
  await supabase.from("class_sessions").update({ status: "cancelled" }).eq("id", sessionId);
  await notifyEnrollees(classId, sessionId, "Session cancelled", "An organizer cancelled a class session you signed up for.");
  revalidatePath(`/classes/${classId}`);
}

// ── Player: sign up / confirm / cancel ───────────────────────────────────────
export async function enrollInSession(formData: FormData) {
  const { supabase, user } = await currentUser();
  const sessionId = (formData.get("sessionId") as string) || "";
  if (!user) redirect("/login");
  if (!sessionId) return;

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("class_sessions")
    .select("id, class_id, capacity, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.status !== "scheduled") return;

  const { data: cls } = await admin
    .from("classes")
    .select("id, title, provider_id, status, capacity, is_paid")
    .eq("id", session.class_id)
    .maybeSingle();
  if (!cls || cls.status !== "published") return;

  // Already have a (non-cancelled) enrollment? Re-activate a cancelled one; otherwise no-op.
  const { data: existing } = await admin
    .from("class_enrollments")
    .select("id, status")
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  // Seat math against active enrollments.
  const { data: active } = await admin.from("class_enrollments").select("status").eq("session_id", sessionId);
  const taken = (active ?? []).filter((e) => takesSeat(e.status)).length;
  const cap = session.capacity ?? cls.capacity;
  const full = cap != null && taken >= cap;
  const status = full ? "waitlisted" : "enrolled";
  const payment_status = cls.is_paid ? "pending" : "not_required";

  if (existing) {
    if (existing.status === "cancelled") {
      await supabase.from("class_enrollments").update({ status, payment_status, updated_at: new Date().toISOString() }).eq("id", existing.id);
    }
  } else {
    await supabase.from("class_enrollments").insert({ session_id: sessionId, class_id: cls.id, user_id: user.id, status, payment_status });
  }

  await createNotification({
    userId: cls.provider_id,
    kind: "marketplace",
    title: full ? `Waitlist sign-up · ${cls.title}` : `New sign-up · ${cls.title}`,
    body: full ? "A player joined the waitlist for a session." : "A player signed up for a session.",
    linkUrl: `/classes/${cls.id}`,
  });
  revalidatePath(`/classes/${cls.id}`);
}

export async function confirmAttendance(formData: FormData) {
  const { supabase, user } = await currentUser();
  const enrollmentId = (formData.get("enrollmentId") as string) || "";
  const classId = (formData.get("classId") as string) || "";
  if (!user || !enrollmentId) return;
  await supabase
    .from("class_enrollments")
    .update({ confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", enrollmentId)
    .eq("user_id", user.id);
  if (classId) revalidatePath(`/classes/${classId}`);
}

export async function cancelEnrollment(formData: FormData) {
  const { supabase, user } = await currentUser();
  const enrollmentId = (formData.get("enrollmentId") as string) || "";
  const classId = (formData.get("classId") as string) || "";
  if (!user || !enrollmentId) return;
  await supabase
    .from("class_enrollments")
    .update({ status: "cancelled", confirmed_at: null, updated_at: new Date().toISOString() })
    .eq("id", enrollmentId)
    .eq("user_id", user.id);
  if (classId) {
    const admin = createAdminClient();
    const { data: cls } = await admin.from("classes").select("provider_id, title").eq("id", classId).maybeSingle();
    if (cls) {
      await createNotification({
        userId: cls.provider_id,
        kind: "marketplace",
        title: `Cancellation · ${cls.title}`,
        body: "A player cancelled their spot in a session.",
        linkUrl: `/classes/${classId}`,
      });
    }
    revalidatePath(`/classes/${classId}`);
  }
}

// ── Provider: roster management ──────────────────────────────────────────────
export async function markAttendance(formData: FormData) {
  const { supabase, user } = await currentUser();
  const enrollmentId = (formData.get("enrollmentId") as string) || "";
  const classId = (formData.get("classId") as string) || "";
  const value = (formData.get("value") as string) || "";
  if (!user || !enrollmentId || !classId || !["attended", "no_show", "enrolled"].includes(value)) return;
  if (!(await ownsClass(classId, user.id))) return;
  await supabase.from("class_enrollments").update({ status: value, updated_at: new Date().toISOString() }).eq("id", enrollmentId);
  revalidatePath(`/classes/${classId}`);
}

export async function markPaid(formData: FormData) {
  const { supabase, user } = await currentUser();
  const enrollmentId = (formData.get("enrollmentId") as string) || "";
  const classId = (formData.get("classId") as string) || "";
  const value = (formData.get("value") as string) === "pending" ? "pending" : "paid";
  if (!user || !enrollmentId || !classId || !(await ownsClass(classId, user.id))) return;
  await supabase.from("class_enrollments").update({ payment_status: value, updated_at: new Date().toISOString() }).eq("id", enrollmentId);
  revalidatePath(`/classes/${classId}`);
}

/** Notify everyone with an active enrollment in a class (or one session of it). */
async function notifyEnrollees(classId: string, sessionId: string | null, title: string, body: string) {
  const admin = createAdminClient();
  let q = admin.from("class_enrollments").select("user_id, status, session_id").eq("class_id", classId);
  if (sessionId) q = q.eq("session_id", sessionId);
  const { data } = await q;
  const targets = (data ?? []).filter((e) => takesSeat(e.status) || e.status === "waitlisted");
  await Promise.all(
    targets.map((e) => createNotification({ userId: e.user_id, kind: "marketplace", title, body, linkUrl: `/classes/${classId}` })),
  );
}
