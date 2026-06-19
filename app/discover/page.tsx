import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Radar, Sparkle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SPORT_KEYS, sportMeta } from "@/lib/sports";
import { Avatar } from "@/components/avatar";
import { AdSlot } from "@/components/ads/ad-slot";
import { suggestedOpponents } from "@/lib/match-intel";

export const metadata: Metadata = { title: "Discover players" };

function scoreColor(score: number): { bg: string; fg: string } {
  if (score >= 70) return { bg: "#f0fdf4", fg: "#15803d" };
  if (score >= 45) return { bg: "#fff8e6", fg: "#8a6d0b" };
  return { bg: "#f4f4f5", fg: "#52525b" };
}

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ sport?: string }> }) {
  const { sport } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/discover");

  const [{ data: mySportsRows }, { data: profile }] = await Promise.all([
    supabase.from("player_sports").select("sport_key").eq("user_id", user.id),
    supabase.from("profiles").select("primary_sport").eq("id", user.id).maybeSingle(),
  ]);
  const mySports = [...new Set((mySportsRows ?? []).map((r) => r.sport_key))].filter((k) => SPORT_KEYS.includes(k));

  if (mySports.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-8 sm:py-10">
        <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Match Intelligence</h1>
        <div className="mt-5 rounded-2xl border border-rule bg-surface p-8 text-center">
          <Radar className="mx-auto text-faint" size={26} />
          <p className="mt-2 text-sm font-semibold text-ink">Add a sport to get matched</p>
          <p className="mt-1 text-sm text-mute">Tell us what you play and we&apos;ll suggest opponents near your level and area.</p>
          <Link href="/onboarding" className="press mt-4 inline-block rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep">
            Set up your sports
          </Link>
        </div>
      </div>
    );
  }

  const selected = sport && mySports.includes(sport) ? sport : mySports.includes(profile?.primary_sport ?? "") ? (profile!.primary_sport as string) : mySports[0];
  const suggestions = await suggestedOpponents(supabase, user.id, selected, 10);
  const meta = sportMeta(selected);

  // Open matches that still need players (any sport, soonest first).
  const { data: openMatches } = await supabase
    .from("matches")
    .select("id, sport_key, format, scheduled_at, total_slots, location_text, court_id, organizer_id")
    .eq("status", "open")
    .order("scheduled_at", { ascending: true, nullsFirst: false })
    .limit(16);
  const openList = openMatches ?? [];
  type NeedRow = {
    id: string;
    sport_key: string;
    format: string;
    scheduled_at: string | null;
    total_slots: number;
    location_text: string | null;
    court_id: string | null;
    filled: number;
    org: string;
    place: string | null;
  };
  let needPlayers: NeedRow[] = [];
  if (openList.length) {
    const ids = openList.map((m) => m.id);
    const orgIds = [...new Set(openList.map((m) => m.organizer_id))];
    const courtIds = [...new Set(openList.map((m) => m.court_id).filter(Boolean) as string[])];
    const [{ data: counts }, { data: orgs2 }, courtRes] = await Promise.all([
      supabase.from("match_participants").select("match_id, user_id").in("match_id", ids),
      supabase.from("profiles").select("id, display_name").in("id", orgIds),
      courtIds.length ? supabase.from("courts").select("id, name").in("id", courtIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    const cMap = new Map<string, number>();
    const mine = new Set<string>();
    for (const c of counts ?? []) {
      cMap.set(c.match_id, (cMap.get(c.match_id) ?? 0) + 1);
      if (c.user_id === user.id) mine.add(c.match_id);
    }
    const oMap = new Map((orgs2 ?? []).map((o) => [o.id, o.display_name]));
    const courtMap = new Map(((courtRes.data as { id: string; name: string }[] | null) ?? []).map((c) => [c.id, c.name]));
    needPlayers = openList
      .filter((m) => (cMap.get(m.id) ?? 0) < m.total_slots && !mine.has(m.id))
      .slice(0, 8)
      .map((m) => ({
        id: m.id,
        sport_key: m.sport_key,
        format: m.format,
        scheduled_at: m.scheduled_at,
        total_slots: m.total_slots,
        location_text: m.location_text,
        court_id: m.court_id,
        filled: cMap.get(m.id) ?? 0,
        org: oMap.get(m.organizer_id) ?? "a player",
        place: (m.court_id ? courtMap.get(m.court_id) : null) ?? m.location_text ?? null,
      }));
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:py-10">
      <div className="mb-1 flex items-center gap-2">
        <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Match Intelligence</h1>
      </div>
      <p className="mb-4 flex items-center gap-1.5 text-sm text-mute">
        <Sparkle size={13} className="text-brand" /> Suggested opponents, ranked by skill, area, availability, and play style.
      </p>

      {/* sport selector (only sports you play) */}
      {mySports.length > 1 ? (
        <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1">
          {mySports.map((k) => {
            const m = sportMeta(k);
            const on = k === selected;
            return (
              <Link
                key={k}
                href={`/discover?sport=${k}`}
                className="press shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{ borderColor: on ? "#ff4e1b" : "#e4e4e7", background: on ? "#fff1ed" : "transparent", color: on ? "#d63a0f" : "#71717a" }}
              >
                {m.emoji} {m.name}
              </Link>
            );
          })}
        </div>
      ) : null}

      {/* Matches need a player — surfaced open matches you can jump into */}
      {needPlayers.length > 0 ? (
        <section className="mb-7">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="kicker text-brand-deep">Matches need a player · {needPlayers.length} open</h2>
            <Link href="/play" className="press text-xs font-semibold text-brand-deep hover:underline">
              See all →
            </Link>
          </div>
          <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
            {needPlayers.map((m) => {
              const m2 = sportMeta(m.sport_key);
              const left = m.total_slots - m.filled;
              const d = m.scheduled_at ? new Date(m.scheduled_at) : null;
              return (
                <Link
                  key={m.id}
                  href={`/play/${m.id}`}
                  className="lift w-64 shrink-0 snap-start rounded-2xl border border-rule bg-surface p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xl" aria-hidden>{m2.emoji}</span>
                    <span className="kicker rounded-full bg-tint-brand px-2 py-1 text-[9px] text-brand-deep">
                      {left} spot{left === 1 ? "" : "s"} open
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-bold text-ink">
                    {m2.name} · {m.format === "doubles" ? "Doubles" : "Singles"}
                  </h3>
                  <p className="mt-1 text-xs text-mute">
                    {d
                      ? d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                      : "Open · anytime"}
                  </p>
                  {m.place ? <p className="mt-0.5 truncate text-xs text-faint">{m.place}</p> : null}
                  <p className="mt-2 border-t border-rule pt-2 text-xs text-faint">
                    by {m.org} · {m.filled}/{m.total_slots} in
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {suggestions.length === 0 ? (
        <div className="rounded-2xl border border-rule bg-surface p-8 text-center text-sm text-mute">
          No {meta.name.toLowerCase()} players to suggest yet. As more players join your area, matches will appear here.
        </div>
      ) : (
        <div className="space-y-2.5">
          {suggestions.map((s) => {
            const url = s.avatarPath ? supabase.storage.from("avatars").getPublicUrl(s.avatarPath).data.publicUrl : null;
            const c = scoreColor(s.score);
            return (
              <Link key={s.userId} href={`/profile/${s.userId}`} className="lift block rounded-2xl border border-rule bg-surface p-4">
                <div className="flex items-center gap-3">
                  <Avatar url={url} hue={s.avatarHue} name={s.displayName} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{s.displayName}</p>
                    <p className="truncate text-xs text-mute">
                      {[s.neighborhood, s.city].filter(Boolean).join(", ") || "—"}
                      {s.skillLevel ? ` · ${s.skillLevel}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular" style={{ background: c.bg, color: c.fg }}>
                    {s.score}% match
                  </span>
                </div>
                {s.reasons.length ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {s.reasons.slice(0, 3).map((r) => (
                      <span key={r} className="rounded-full bg-[#f4f4f5] px-2 py-0.5 text-[11px] font-medium text-ink-soft">{r}</span>
                    ))}
                  </div>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}

      <AdSlot className="mt-6" label="Local sponsor" />

      <p className="mt-6 text-xs leading-relaxed text-faint">
        Suggestions use your profile, ranking, and availability. Update your area and times on your account for sharper matches.
      </p>
    </div>
  );
}
