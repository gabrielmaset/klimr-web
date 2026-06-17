"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { accountActive } from "@/lib/guards";

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
