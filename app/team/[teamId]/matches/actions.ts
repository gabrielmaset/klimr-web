"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { error: string };

const MANAGER_ROLES = ["owner", "manager", "staff"];

async function ctx() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

async function isManagerOf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamIds: string[],
  userId: string,
): Promise<boolean> {
  const { data } = await supabase.from("team_members").select("team_id, role").in("team_id", teamIds).eq("user_id", userId);
  return (data ?? []).some((m) => MANAGER_ROLES.includes(m.role));
}

function revalidateBoth(homeId: string, awayId: string) {
  revalidatePath(`/team/${homeId}/matches`);
  revalidatePath(`/team/${awayId}/matches`);
}

/** A manager of the home team challenges another Pro team of the same sport. */
export async function proposeTeamMatch(input: {
  homeTeamId: string;
  awayTeamId: string;
  scheduledAt: string | null;
  location: string;
  note: string;
}): Promise<Result> {
  const { supabase, user } = await ctx();
  if (!user) return { error: "Please sign in." };

  const { homeTeamId, awayTeamId } = input;
  if (!awayTeamId || awayTeamId === homeTeamId) return { error: "Pick a team to challenge." };

  if (!(await isManagerOf(supabase, [homeTeamId], user.id))) return { error: "Only team managers can send a challenge." };

  const { data: teamsData } = await supabase.from("teams").select("id, sport_key, category, deleted_at").in("id", [homeTeamId, awayTeamId]);
  const home = teamsData?.find((t) => t.id === homeTeamId);
  const away = teamsData?.find((t) => t.id === awayTeamId);
  if (!home || !away) return { error: "That team could not be found." };
  if (away.deleted_at) return { error: "That team is no longer active." };
  if (away.category !== "pro") return { error: "You can only challenge other Pro teams for now." };
  if (home.sport_key !== away.sport_key) return { error: "Both teams must play the same sport." };

  const scheduledAt = input.scheduledAt && !Number.isNaN(Date.parse(input.scheduledAt)) ? new Date(input.scheduledAt).toISOString() : null;
  const location = input.location.trim().slice(0, 160) || null;
  const note = input.note.trim().slice(0, 300) || null;

  const { error } = await supabase.from("team_matches").insert({
    sport_key: home.sport_key,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    proposed_by: user.id,
    scheduled_at: scheduledAt,
    location_text: location,
    note,
    status: "proposed",
  });
  if (error) {
    console.error("[team_matches] propose failed", error.code, error.message);
    return { error: error.code === "42501" ? "Only team managers can send a challenge." : "Couldn't send the challenge. Please try again." };
  }
  revalidateBoth(homeTeamId, awayTeamId);
  return { ok: true };
}

/** A manager of the challenged (away) team accepts or declines. */
export async function respondChallenge(matchId: string, accept: boolean): Promise<Result> {
  const { supabase, user } = await ctx();
  if (!user) return { error: "Please sign in." };

  const { data: m } = await supabase.from("team_matches").select("home_team_id, away_team_id, status").eq("id", matchId).maybeSingle();
  if (!m) return { error: "That challenge could not be found." };
  if (m.status !== "proposed") return { error: "This challenge has already been answered." };
  if (!(await isManagerOf(supabase, [m.away_team_id], user.id))) return { error: "Only the challenged team's managers can respond." };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("team_matches")
    .update({ status: accept ? "scheduled" : "declined", decided_at: now, updated_at: now })
    .eq("id", matchId);
  if (error) {
    console.error("[team_matches] respond failed", error.code, error.message);
    return { error: "Couldn't save your response. Please try again." };
  }
  revalidateBoth(m.home_team_id, m.away_team_id);
  return { ok: true };
}

/** A manager of either team records the final score. */
export async function recordResult(matchId: string, homeScore: number, awayScore: number): Promise<Result> {
  const { supabase, user } = await ctx();
  if (!user) return { error: "Please sign in." };

  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || homeScore < 0 || awayScore < 0) {
    return { error: "Enter both scores (0 or higher)." };
  }

  const { data: m } = await supabase.from("team_matches").select("home_team_id, away_team_id, status").eq("id", matchId).maybeSingle();
  if (!m) return { error: "That match could not be found." };
  if (m.status !== "scheduled" && m.status !== "completed") return { error: "You can record a result once the match is accepted." };
  if (!(await isManagerOf(supabase, [m.home_team_id, m.away_team_id], user.id))) {
    return { error: "Only a manager of one of the teams can record the result." };
  }

  const hs = Math.round(homeScore);
  const as = Math.round(awayScore);
  const winner = hs === as ? null : hs > as ? m.home_team_id : m.away_team_id;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("team_matches")
    .update({ status: "completed", home_score: hs, away_score: as, winner_team_id: winner, decided_at: now, updated_at: now })
    .eq("id", matchId);
  if (error) {
    console.error("[team_matches] record failed", error.code, error.message);
    return { error: "Couldn't save the result. Please try again." };
  }
  revalidateBoth(m.home_team_id, m.away_team_id);
  return { ok: true };
}

/** A manager of either team cancels a proposed or scheduled match. */
export async function cancelTeamMatch(matchId: string): Promise<Result> {
  const { supabase, user } = await ctx();
  if (!user) return { error: "Please sign in." };

  const { data: m } = await supabase.from("team_matches").select("home_team_id, away_team_id, status").eq("id", matchId).maybeSingle();
  if (!m) return { error: "That match could not be found." };
  if (m.status === "completed") return { error: "You can't cancel a completed match." };
  if (m.status === "declined" || m.status === "cancelled") return { error: "This match is already closed." };
  if (!(await isManagerOf(supabase, [m.home_team_id, m.away_team_id], user.id))) {
    return { error: "Only a manager of one of the teams can cancel this match." };
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("team_matches").update({ status: "cancelled", decided_at: now, updated_at: now }).eq("id", matchId);
  if (error) {
    console.error("[team_matches] cancel failed", error.code, error.message);
    return { error: "Couldn't cancel the match. Please try again." };
  }
  revalidateBoth(m.home_team_id, m.away_team_id);
  return { ok: true };
}
