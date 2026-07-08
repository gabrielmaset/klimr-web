import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Flag } from "lucide-react";
import { PageHeader } from "@/components/page-header";
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
      <PageHeader
        kicker="Compete — Challenges"
        title="Turf wars"
        sub="Your neighborhood vs theirs. Every ranked match moves the line."
        className="mb-6"
      />

      {cards.length === 0 ? (
        <div className="rounded-2xl border border-rule bg-surface shadow-e1 p-10 text-center text-sm text-mute">No active challenges right now.</div>
      ) : (
        <div className="space-y-[14px]">
          {cards.map(({ c, a, b, repping }) => {
            const pct = splitPct(a.points, b.points);
            const aLead = a.points > b.points;
            const dl = daysLeft(c.ends_at);
            return (
              <Link key={c.id} href={`/challenges/${c.id}`} className="lift block rounded-[18px] border border-rule bg-surface p-5 shadow-e1">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <SportChip sport={c.sport_key} size="sm" />
                  {repping ? (
                    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[.14em]" style={{ background: "var(--color-tint-brand)", borderColor: "var(--color-tint-brand-bd)", color: "var(--color-flame-text)" }}>
                      <Flag size={10} /> Repping {repping}
                    </span>
                  ) : null}
                  <span className="ml-auto font-mono text-[10px] font-bold uppercase tracking-[.14em] text-faint">
                    {dl !== null ? `${dl}d left` : "Ongoing"}
                  </span>
                </div>

                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                  <span className="min-w-0">
                    <span className="block truncate font-display text-[26px] font-bold leading-none tracking-[-0.02em] sm:text-[30px]" style={{ color: repping === c.region_a ? "var(--color-brand-deep)" : aLead ? "var(--color-ink)" : "var(--color-ink)" }}>{c.region_a}</span>
                    <span className="mt-1 block font-mono text-[11px] font-semibold tabular text-mute">{a.points.toLocaleString("en-US")} PTS · {a.players} {a.players === 1 ? "PLAYER" : "PLAYERS"}</span>
                  </span>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold text-faint" style={{ background: "var(--color-bg)", border: "1px solid var(--color-rule-2)" }}>VS</span>
                  <span className="min-w-0 text-right">
                    <span className="block truncate font-display text-[26px] font-bold leading-none tracking-[-0.02em] sm:text-[30px]" style={{ color: repping === c.region_b ? "var(--color-brand-deep)" : "var(--color-ink)" }}>{c.region_b}</span>
                    <span className="mt-1 block font-mono text-[11px] font-semibold tabular text-mute">{b.points.toLocaleString("en-US")} PTS · {b.players} {b.players === 1 ? "PLAYER" : "PLAYERS"}</span>
                  </span>
                </div>

                {/* the line */}
                <div className="relative mt-4 h-3 rounded-full" style={{ background: "#EDE7DA" }}>
                  <span
                    className="absolute inset-y-0 left-0"
                    style={{ width: `${pct}%`, background: "linear-gradient(90deg, #FF7A4D, #E23E0D)", borderRadius: "99px 4px 4px 99px", boxShadow: "0 2px 8px -2px rgba(214,58,15,.4)" }}
                  />
                  <span className="absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" style={{ left: `${pct}%`, border: "4px solid var(--color-flame-deep)" }} aria-hidden />
                </div>

                <div className="mt-2.5 flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[.14em] text-flame-text">{pct}% of the line</span>
                  <span className="inline-flex h-[28px] items-center gap-1 rounded-full border border-rule-2 bg-surface px-2.5 text-xs font-semibold text-mute">
                    Standings <ChevronRight size={13} />
                  </span>
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
