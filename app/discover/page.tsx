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
