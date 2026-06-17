"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { accountActive } from "@/lib/guards";
import { createNotification } from "@/lib/notify";
import { sportMeta } from "@/lib/sports";

async function ctx() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function joinMatch(formData: FormData) {
  const id = String(formData.get("matchId"));
  const { supabase, user } = await ctx();
  if (!user) redirect(`/login?next=/play/${id}`);
  if (!(await accountActive(supabase, user.id))) {
    revalidatePath(`/play/${id}`);
    return;
  }

  const { data: match } = await supabase
    .from("matches")
    .select("id, total_slots, status, organizer_id, sport_key")
    .eq("id", id)
    .single();
  if (match && match.status === "open") {
    const { count } = await supabase
      .from("match_participants")
      .select("*", { count: "exact", head: true })
      .eq("match_id", id);
    const filled = count ?? 0;
    if (filled < match.total_slots) {
      await supabase.from("match_participants").insert({
        match_id: id,
        user_id: user.id,
        slot: filled + 1,
        is_organizer: false,
        confirmed: false,
      });

      // Let the organizer know someone joined their match.
      if (match.organizer_id && match.organizer_id !== user.id) {
        const { data: me } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
        const name = me?.display_name || "A player";
        await createNotification({
          userId: match.organizer_id,
          kind: "match_join",
          title: `${name} joined your match`,
          body: `${sportMeta(match.sport_key).name} · they're on your roster.`,
          linkUrl: `/play/${id}`,
        });
      }
    }
  }
  revalidatePath(`/play/${id}`);
}

export async function leaveMatch(formData: FormData) {
  const id = String(formData.get("matchId"));
  const { supabase, user } = await ctx();
  if (!user) redirect(`/login?next=/play/${id}`);
  await supabase.from("match_participants").delete().eq("match_id", id).eq("user_id", user.id);
  revalidatePath(`/play/${id}`);
}

export async function confirmSpot(formData: FormData) {
  const id = String(formData.get("matchId"));
  const { supabase, user } = await ctx();
  if (!user) redirect(`/login?next=/play/${id}`);
  await supabase.from("match_participants").update({ confirmed: true }).eq("match_id", id).eq("user_id", user.id);
  revalidatePath(`/play/${id}`);
}

export async function joinWaitlist(formData: FormData) {
  const id = String(formData.get("matchId"));
  const { supabase, user } = await ctx();
  if (!user) redirect(`/login?next=/play/${id}`);
  if (!(await accountActive(supabase, user.id))) {
    revalidatePath(`/play/${id}`);
    return;
  }
  const { count } = await supabase
    .from("join_requests")
    .select("*", { count: "exact", head: true })
    .eq("match_id", id)
    .eq("status", "waitlisted");
  await supabase.from("join_requests").insert({
    match_id: id,
    requester_id: user.id,
    status: "waitlisted",
    waitlist_position: (count ?? 0) + 1,
  });
  revalidatePath(`/play/${id}`);
}

export async function leaveWaitlist(formData: FormData) {
  const id = String(formData.get("matchId"));
  const { supabase, user } = await ctx();
  if (!user) redirect(`/login?next=/play/${id}`);
  await supabase.from("join_requests").delete().eq("match_id", id).eq("requester_id", user.id);
  revalidatePath(`/play/${id}`);
}

export async function cancelMatch(formData: FormData) {
  const id = String(formData.get("matchId"));
  const { supabase, user } = await ctx();
  if (!user) redirect(`/login?next=/play/${id}`);
  await supabase.from("matches").delete().eq("id", id).eq("organizer_id", user.id);
  redirect("/play");
}
