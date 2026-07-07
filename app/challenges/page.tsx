import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Flag } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SportChip } from "@/components/sport-chip";
import { computeSide, splitPct } from "@/lib/challenges";

export const metadata: Metadata = { title: "Region challenges" };

type Challenge = {
  id: string;
  sport_key: string;
  scope: string;
  region_a: string;
  region_b: string;
  ends_at: string | null;
};

function daysLeft(ends: string | null): number | null {
  if (!ends) return null;
  return Math.max(0, Math.ceil((new Date(ends).getTime() - Date.now()) / 86400000));
}

export default async function ChallengesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/challenges");

  const [{ data: cData }, { data: profile }] = await Promise.all([
    supabase.from("region_challenges").select("id, sport_key, scope, region_a, region_b, ends_at").eq("status", "active").order("created_at"),
    supabase.from("profiles").select("neighborhood, city").eq("id", user.id).maybeSingle(),
  ]);
  const challenges = (cData as Challenge[] | null) ?? [];

  const cards = await Promise.all(
    challenges.map(async (c) => {
      const [a, b] = await Promise.all([
        computeSide(supabase, c.scope, c.region_a, c.sport_key),
        computeSide(supabase, c.scope, c.region_b, c.sport_key),
      ]);
      const mineArea = c.scope === "city" ? profile?.city : profile?.neighborhood;
      const repping = mineArea === c.region_a ? c.region_a : mineArea === c.region_b ? c.region_b : null;
      return { c, a, b, repping };
    })
  );

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-5">
        <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Region challenges</h1>
        <p className="mt-1 text-sm text-mute">Your neighborhood vs theirs. Every ranked match moves the line.</p>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-2xl border border-rule bg-surface p-10 text-center text-sm text-mute">No active challenges right now.</div>
      ) : (
        <div className="space-y-3">
          {cards.map(({ c, a, b, repping }) => {
            const pct = splitPct(a.points, b.points);
            const aLead = a.points > b.points;
            const bLead = b.points > a.points;
            const dl = daysLeft(c.ends_at);
            return (
              <Link key={c.id} href={`/challenges/${c.id}`} className="lift block rounded-2xl border border-rule bg-surface p-4">
                <div className="mb-2 flex items-center justify-between">
                  <SportChip sport={c.sport_key} size="sm" />
                  <span className="flex items-center gap-2 text-xs text-faint">
                    {repping ? <span className="rounded-full bg-tint-brand px-2 py-0.5 font-semibold text-brand-deep">Repping {repping}</span> : null}
                    {dl !== null ? <span>{dl}d left</span> : <span>Ongoing</span>}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-bold ${aLead ? "text-brand-deep" : "text-ink"}`}>{c.region_a}</span>
                    <span className="text-xs text-mute tabular">{a.points} pts · {a.players} {a.players === 1 ? "player" : "players"}</span>
                  </span>
                  <span className="shrink-0 text-xs font-bold text-faint">vs</span>
                  <span className="min-w-0 flex-1 text-right">
                    <span className={`block truncate text-sm font-bold ${bLead ? "text-brand-deep" : "text-ink"}`}>{c.region_b}</span>
                    <span className="text-xs text-mute tabular">{b.points} pts · {b.players} {b.players === 1 ? "player" : "players"}</span>
                  </span>
                </div>

                {/* split bar */}
                <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-bg">
                  <span className="h-full" style={{ width: `${pct}%`, background: "var(--color-brand)" }} />
                  <span className="h-full flex-1" style={{ background: "#3f3f46" }} />
                </div>

                <div className="mt-2 flex items-center justify-end gap-1 text-xs font-semibold text-mute">
                  View standings <ChevronRight size={13} />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-faint">
        <Flag size={13} className="mt-0.5 shrink-0" />
        Standings reflect the combined ranking points of each area&apos;s players in that sport, updating as matches are recorded.
      </p>
    </div>
  );
}
