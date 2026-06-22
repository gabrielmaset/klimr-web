import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ChevronLeft, Trophy, Users, Flag } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { Avatar } from "@/components/avatar";
import { computeSide, splitPct, type Side } from "@/lib/challenges";

export const metadata: Metadata = { title: "Region challenge" };

function daysLeft(ends: string | null): number | null {
  if (!ends) return null;
  return Math.max(0, Math.ceil((new Date(ends).getTime() - Date.now()) / 86400000));
}

type Prof = { id: string; display_name: string; avatar_hue: number; avatar_path: string | null };

export default async function ChallengeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/challenges/${id}`);

  const { data: c } = await supabase
    .from("region_challenges")
    .select("id, sport_key, scope, region_a, region_b, status, starts_at, ends_at")
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();

  const meta = sportMeta(c.sport_key);
  const [a, b, { data: profile }] = await Promise.all([
    computeSide(supabase, c.scope, c.region_a, c.sport_key),
    computeSide(supabase, c.scope, c.region_b, c.sport_key),
    supabase.from("profiles").select("neighborhood, city").eq("id", user.id).maybeSingle(),
  ]);

  const topIds = [...new Set([...a.top, ...b.top].map((t) => t.user_id))];
  const profById = new Map<string, Prof>();
  if (topIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_hue, avatar_path").in("id", topIds);
    for (const p of (profs as Prof[] | null) ?? []) profById.set(p.id, p);
  }
  const avatarUrl = (p: Prof | undefined) =>
    p?.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null;

  const pct = splitPct(a.points, b.points);
  const mineArea = c.scope === "city" ? profile?.city : profile?.neighborhood;
  const repping = mineArea === c.region_a ? c.region_a : mineArea === c.region_b ? c.region_b : null;
  const dl = daysLeft(c.ends_at);
  const sides: { name: string; side: Side; lead: boolean }[] = [
    { name: c.region_a, side: a, lead: a.points > b.points },
    { name: c.region_b, side: b, lead: b.points > a.points },
  ];

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <Link href="/challenges" className="press mb-5 inline-flex items-center gap-1 text-sm font-semibold text-mute hover:text-ink">
        <ChevronLeft size={15} /> Region challenges
      </Link>

      <div className="flex items-center gap-2 text-sm text-mute">
        <span className="rounded-full border border-rule bg-surface px-2.5 py-1 text-xs font-semibold text-ink">{meta.emoji} {meta.name}</span>
        <span className="text-xs text-faint">{dl !== null ? `${dl} days left` : "Ongoing"}</span>
      </div>
      <h1 className="mt-2 font-display text-3xl leading-tight text-ink sm:text-4xl">
        {c.region_a} <span className="text-faint">vs</span> {c.region_b}
      </h1>

      {/* split bar */}
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-[#f4f4f5]">
        <span className="h-full" style={{ width: `${pct}%`, background: "#ff4e1b" }} />
        <span className="h-full flex-1" style={{ background: "#3f3f46" }} />
      </div>
      <div className="mt-1 flex justify-between text-xs text-faint tabular">
        <span>{c.region_a} {a.points}</span>
        <span>{b.points} {c.region_b}</span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {sides.map(({ name, side, lead }) => (
          <div key={name} className={`rounded-2xl border p-4 ${lead ? "border-brand/30 bg-tint-brand/30" : "border-rule bg-surface"}`}>
            <div className="flex items-baseline justify-between">
              <h3 className="truncate font-display text-2xl text-ink">{name}</h3>
              {lead ? <span className="kicker text-brand-deep">Leading</span> : null}
            </div>
            <div className="mt-1 flex items-end gap-3">
              <span className="font-display text-4xl text-ink tabular">{side.points}</span>
              <span className="pb-1 text-xs text-mute">pts</span>
              <span className="ml-auto flex items-center gap-3 pb-1 text-xs text-mute">
                <span className="flex items-center gap-1"><Users size={12} /> {side.players}</span>
                <span className="flex items-center gap-1"><Trophy size={12} className="text-pop" /> {side.wins}</span>
              </span>
            </div>
            <div className="mt-3 space-y-1.5">
              {side.top.length === 0 ? (
                <p className="text-xs text-faint">No ranked players yet.</p>
              ) : (
                side.top.map((t) => {
                  const p = profById.get(t.user_id);
                  return (
                    <Link key={t.user_id} href={`/profile/${t.user_id}`} className="press flex items-center gap-2">
                      <Avatar url={avatarUrl(p)} hue={p?.avatar_hue ?? 200} name={p?.display_name ?? "Player"} size={24} />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink-soft">{p?.display_name ?? "Player"}</span>
                      <span className="text-xs text-faint tabular">{t.points}</span>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>

      {/* repping / nudge */}
      <div className="mt-5 rounded-2xl border border-rule bg-surface p-4">
        {repping ? (
          <p className="flex items-start gap-2 text-sm text-ink">
            <Flag size={15} className="mt-0.5 shrink-0 text-brand" />
            You&apos;re repping <span className="font-semibold">{repping}</span>. Every ranked {meta.name.toLowerCase()} match you win adds points for your area.
          </p>
        ) : (
          <p className="flex items-start gap-2 text-sm text-mute">
            <Flag size={15} className="mt-0.5 shrink-0 text-faint" />
            Set your home {c.scope === "city" ? "city" : "neighborhood"} and play {meta.name.toLowerCase()} to represent your area.{" "}
            <Link href="/account" className="font-semibold text-brand-deep hover:text-brand">Update profile</Link>
          </p>
        )}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-faint">
        Standings combine the ranking points of each area&apos;s players in {meta.name.toLowerCase()}, updating as matches are recorded.
      </p>
    </div>
  );
}
