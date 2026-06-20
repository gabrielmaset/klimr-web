import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SportsEditor, type SportState, type SportsInitial } from "./sports-editor";

export const metadata: Metadata = { title: "Sports & skill · Settings" };

const SPORT_KEYS = ["tennis", "pickleball", "padel", "racquetball"];

export default async function SportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/sports");

  const [{ data: rows }, { data: profile }] = await Promise.all([
    supabase.from("player_sports").select("sport_key, skill_level, skill_rating, preferred_format").eq("user_id", user.id),
    supabase.from("profiles").select("primary_sport").eq("id", user.id).maybeSingle(),
  ]);

  const byKey = new Map((rows ?? []).map((r) => [r.sport_key, r]));
  const sports: Record<string, SportState> = {};
  for (const k of SPORT_KEYS) {
    const r = byKey.get(k);
    sports[k] = {
      on: !!r,
      level: r?.skill_level ?? "casual",
      rating: r?.skill_rating != null ? String(r.skill_rating) : "",
      format: r?.preferred_format ?? "both",
    };
  }
  const primary = profile?.primary_sport && sports[profile.primary_sport]?.on
    ? profile.primary_sport
    : SPORT_KEYS.find((k) => sports[k].on) ?? "tennis";

  const initial: SportsInitial = { sports, primary };

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:py-10">
      <Link href="/settings" className="press mb-4 inline-flex items-center gap-1 text-sm font-semibold text-mute transition-colors hover:text-ink">
        <ChevronLeft size={16} /> Settings
      </Link>
      <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Sports &amp; skill levels</h1>
      <p className="mt-2 text-sm text-mute">Pick the sports you play, set your level in each, and choose your default sport.</p>

      <div className="mt-6 rounded-2xl border border-rule bg-surface p-5 sm:p-6">
        <SportsEditor initial={initial} />
      </div>
    </div>
  );
}
