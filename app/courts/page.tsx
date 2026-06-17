import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MapPin, Star, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SPORTS, SPORT_KEYS, sportMeta } from "@/lib/sports";

export const metadata: Metadata = { title: "Courts" };

type Court = {
  id: string;
  name: string;
  sports: string[];
  neighborhood: string | null;
  city: string | null;
  amenities: string[];
};

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={12} className={n <= Math.round(value) ? "fill-pop text-pop" : "text-rule"} />
      ))}
    </span>
  );
}

export default async function CourtsPage({ searchParams }: { searchParams: Promise<{ sport?: string }> }) {
  const { sport } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/courts");

  const { data } = await supabase
    .from("courts")
    .select("id, name, sports, neighborhood, city, amenities")
    .order("name");
  let courts = (data as Court[] | null) ?? [];
  const activeSport = sport && SPORT_KEYS.includes(sport) ? sport : null;
  if (activeSport) courts = courts.filter((c) => c.sports.includes(activeSport));

  // ratings
  const avg = new Map<string, number>();
  const count = new Map<string, number>();
  const ids = courts.map((c) => c.id);
  if (ids.length) {
    const { data: reviews } = await supabase.from("court_reviews").select("court_id, rating").in("court_id", ids);
    const sum = new Map<string, number>();
    for (const r of reviews ?? []) {
      sum.set(r.court_id, (sum.get(r.court_id) ?? 0) + r.rating);
      count.set(r.court_id, (count.get(r.court_id) ?? 0) + 1);
    }
    for (const [cid, s] of sum) avg.set(cid, s / (count.get(cid) ?? 1));
  }

  const chip = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      className="press shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
      style={{ borderColor: on ? "#ff4e1b" : "#e4e4e7", background: on ? "#fff1ed" : "transparent", color: on ? "#d63a0f" : "#71717a" }}
    >
      {label}
    </Link>
  );

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:py-10">
      <div className="mb-4">
        <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Courts</h1>
        <p className="mt-1 text-sm text-mute">Where the Westside plays. Reviews come from verified members.</p>
      </div>

      <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1">
        {chip("/courts", "All", !activeSport)}
        {SPORTS.map((s) => chip(`/courts?sport=${s.key}`, `${s.emoji} ${s.name}`, activeSport === s.key))}
      </div>

      {courts.length === 0 ? (
        <div className="rounded-2xl border border-rule bg-surface p-10 text-center text-sm text-mute">
          No courts here yet for this sport.
        </div>
      ) : (
        <div className="space-y-2.5">
          {courts.map((c) => {
            const n = count.get(c.id) ?? 0;
            return (
              <Link key={c.id} href={`/courts/${c.id}`} className="lift flex items-center gap-3 rounded-2xl border border-rule bg-surface p-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#f4f4f5]">
                  <MapPin size={18} className="text-ink" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink">{c.name}</span>
                  <span className="block truncate text-xs text-mute">
                    {[c.neighborhood, c.city].filter(Boolean).join(", ")} · {c.sports.map((s) => sportMeta(s).emoji).join(" ")}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-faint">
                    {n > 0 ? (
                      <>
                        <Stars value={avg.get(c.id) ?? 0} /> {(avg.get(c.id) ?? 0).toFixed(1)} · {n} review{n === 1 ? "" : "s"}
                      </>
                    ) : (
                      "No reviews yet"
                    )}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-faint" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
