import { createClient } from "@/lib/supabase/server";

type DB = Awaited<ReturnType<typeof createClient>>;

/**
 * A Klimr court review can only come from a verified player who has actually
 * been at the court — either checked in here, or played a match linked to it.
 * This is what keeps reviews real: no drive-by stars from people who never showed.
 */
export async function courtReviewEligibility(supabase: DB, userId: string, courtId: string) {
  const [{ data: prof }, { count: ciCount }, { data: parts }] = await Promise.all([
    supabase.from("profiles").select("verification_status").eq("id", userId).maybeSingle(),
    supabase.from("court_checkins").select("id", { count: "exact", head: true }).eq("court_id", courtId).eq("user_id", userId),
    supabase.from("match_participants").select("match_id").eq("user_id", userId),
  ]);

  const verified = prof?.verification_status === "verified";
  const checkedIn = (ciCount ?? 0) > 0;

  let playedHere = false;
  const matchIds = ((parts as { match_id: string }[] | null) ?? []).map((p) => p.match_id);
  if (matchIds.length) {
    const { count } = await supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("court_id", courtId)
      .in("id", matchIds);
    playedHere = (count ?? 0) > 0;
  }

  const beenHere = checkedIn || playedHere;
  return { verified, checkedIn, playedHere, beenHere, eligible: verified && beenHere };
}
