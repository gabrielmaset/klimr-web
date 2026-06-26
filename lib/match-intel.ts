import "server-only";
import { createClient } from "@/lib/supabase/server";

type SB = Awaited<ReturnType<typeof createClient>>;
type Avail = { day: string; start: string; end: string };

export type Suggestion = {
  userId: string;
  displayName: string;
  avatarHue: number;
  avatarPath: string | null;
  neighborhood: string | null;
  city: string | null;
  skillLevel: string | null;
  score: number; // 0–100 compatibility
  reasons: string[];
};

const toMin = (t: string) => {
  const [h, m] = String(t).split(":").map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
};
const overlapDay = (a: Avail[], b: Avail[]): string | null => {
  for (const x of a || []) {
    for (const y of b || []) {
      if (x.day === y.day && toMin(x.start) < toMin(y.end) && toMin(y.start) < toMin(x.end)) return x.day;
    }
  }
  return null;
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Suggested opponents for a player in a sport. Deterministic compatibility scoring over
 * skill, location (Klimr's geographic wedge), availability, and preferred format. Returns
 * the top matches with the human-readable reasons behind each score. Excludes blocked
 * players (either direction) and inactive accounts.
 */
export async function suggestedOpponents(supabase: SB, meId: string, sportKey: string, limit = 8): Promise<Suggestion[]> {
  const [{ data: me }, { data: mySport }, { data: bOut }, { data: bIn }, { data: cand }] = await Promise.all([
    supabase.from("profiles").select("neighborhood, city, home_zip, state, availability, preferred_format").eq("id", meId).maybeSingle(),
    supabase.from("player_sports").select("skill_rating, skill_level, preferred_format").eq("user_id", meId).eq("sport_key", sportKey).maybeSingle(),
    supabase.from("blocks").select("blocked_id").eq("blocker_id", meId),
    supabase.from("blocks").select("blocker_id").eq("blocked_id", meId),
    supabase.from("player_sports").select("user_id, skill_rating, skill_level, preferred_format").eq("sport_key", sportKey).neq("user_id", meId).limit(200),
  ]);

  const excluded = new Set<string>([...(bOut ?? []).map((r) => r.blocked_id), ...(bIn ?? []).map((r) => r.blocker_id)]);
  const candidates = (cand ?? []).filter((c) => !excluded.has(c.user_id));
  if (!candidates.length) return [];

  const ids = candidates.map((c) => c.user_id);
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_hue, avatar_path, neighborhood, city, home_zip, state, availability, account_status")
    .in("id", ids);
  const profById = new Map((profs ?? []).map((p) => [p.id, p]));

  const myAvail = (me?.availability ?? []) as Avail[];
  const myFormat = mySport?.preferred_format || me?.preferred_format || null;
  const myZip3 = me?.home_zip ? me.home_zip.slice(0, 3) : null;

  const out: Suggestion[] = [];
  for (const c of candidates) {
    const p = profById.get(c.user_id);
    if (!p) continue;
    if (p.account_status && p.account_status !== "active") continue;

    const reasons: string[] = [];
    let score = 0;

    // location — Klimr's geographic wedge gets the most weight
    if (me?.neighborhood && p.neighborhood && me.neighborhood.toLowerCase() === p.neighborhood.toLowerCase()) {
      score += 35;
      reasons.push(`Plays in ${p.neighborhood}`);
    } else if (me?.city && p.city && me.city.toLowerCase() === p.city.toLowerCase()) {
      score += 25;
      reasons.push(`Both in ${p.city}`);
    } else if (myZip3 && p.home_zip && p.home_zip.slice(0, 3) === myZip3) {
      score += 18;
      reasons.push("Nearby");
    } else if (me?.state && p.state && me.state === p.state) {
      score += 8;
    }

    // skill proximity
    if (mySport?.skill_level && c.skill_level && mySport.skill_level.toLowerCase() === c.skill_level.toLowerCase()) {
      score += 35;
      reasons.push(`Same level: ${c.skill_level}`);
    } else if (mySport?.skill_rating != null && c.skill_rating != null) {
      const closeness = Math.max(0, 1 - Math.abs(mySport.skill_rating - c.skill_rating) / 1.5);
      score += Math.round(35 * closeness);
      if (closeness > 0.5) reasons.push("Similar skill level");
    } else {
      score += 12;
    }

    // availability overlap
    const day = overlapDay(myAvail, (p.availability ?? []) as Avail[]);
    if (day) {
      score += 20;
      reasons.push(`Both free on ${cap(day)}`);
    }

    // preferred format
    if (myFormat && c.preferred_format && myFormat.toLowerCase() === c.preferred_format.toLowerCase()) {
      score += 10;
      reasons.push(`Both prefer ${c.preferred_format}`);
    }

    out.push({
      userId: c.user_id,
      displayName: p.display_name || "Player",
      avatarHue: p.avatar_hue ?? 200,
      avatarPath: p.avatar_path ?? null,
      neighborhood: p.neighborhood ?? null,
      city: p.city ?? null,
      skillLevel: c.skill_level ?? null,
      score: Math.min(100, score),
      reasons,
    });
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
