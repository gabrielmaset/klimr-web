import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, MapPin, Users, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SPORTS, sportMeta } from "@/lib/sports";

export const metadata: Metadata = { title: "Play" };

type Org = { id: string; display_name: string; avatar_hue: number };
type Part = { match_id: string; user_id: string };

function whenLabel(scheduledAt: string | null) {
  if (!scheduledAt) return "Open — anytime";
  return new Date(scheduledAt).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string }>;
}) {
  const { sport } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/play");

  let query = supabase
    .from("matches")
    .select("*")
    .in("status", ["open", "scheduled"])
    .order("scheduled_at", { ascending: true, nullsFirst: false });
  const activeSport = sport && SPORTS.some((s) => s.key === sport) ? sport : null;
  if (activeSport) query = query.eq("sport_key", activeSport);
  const { data: matches } = await query;
  const list = matches ?? [];

  let orgs: Org[] = [];
  let parts: Part[] = [];
  if (list.length) {
    const organizerIds = [...new Set(list.map((m) => m.organizer_id))];
    const matchIds = list.map((m) => m.id);
    const [o, p] = await Promise.all([
      supabase.from("profiles").select("id, display_name, avatar_hue").in("id", organizerIds),
      supabase.from("match_participants").select("match_id, user_id").in("match_id", matchIds),
    ]);
    orgs = (o.data as Org[] | null) ?? [];
    parts = (p.data as Part[] | null) ?? [];
  }
  const orgMap = new Map(orgs.map((o) => [o.id, o]));

  const courtIds = [...new Set(list.map((m) => m.court_id).filter(Boolean) as string[])];
  let courtMap = new Map<string, { id: string; name: string }>();
  if (courtIds.length) {
    const { data: cs } = await supabase.from("courts").select("id, name").in("id", courtIds);
    courtMap = new Map(((cs as { id: string; name: string }[] | null) ?? []).map((c) => [c.id, c]));
  }
  const countMap = new Map<string, number>();
  const mineSet = new Set<string>();
  for (const p of parts) {
    countMap.set(p.match_id, (countMap.get(p.match_id) ?? 0) + 1);
    if (p.user_id === user.id) mineSet.add(p.match_id);
  }

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Play</h1>
          <p className="mt-1 text-sm text-mute">Find an open match near you — or organize your own.</p>
        </div>
        <Link
          href="/play/new"
          className="press inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft"
        >
          <Plus size={16} /> Organize a match
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-1.5">
        <FilterPill href="/play" active={!activeSport} label="All sports" />
        {SPORTS.map((s) => (
          <FilterPill key={s.key} href={`/play?sport=${s.key}`} active={activeSport === s.key} label={`${s.emoji} ${s.name}`} />
        ))}
      </div>

      {list.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-rule bg-surface p-10 text-center">
          <Users size={28} className="mx-auto text-faint" />
          <h2 className="mt-3 font-display text-2xl text-ink">
            No open matches{activeSport ? ` for ${sportMeta(activeSport).name.toLowerCase()}` : ""} yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-mute">
            Be the one to get a game going. Organize a match and verified players nearby can join.
          </p>
          <Link
            href="/play/new"
            className="press mt-5 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep"
          >
            <Plus size={16} /> Organize a match
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((m) => {
            const org = orgMap.get(m.organizer_id);
            const filled = countMap.get(m.id) ?? 0;
            const left = m.total_slots - filled;
            const full = left <= 0;
            const mine = mineSet.has(m.id);
            const meta = sportMeta(m.sport_key);
            const court = m.court_id ? courtMap.get(m.court_id) : null;
            const placeLabel = court ? court.name : m.location_text;
            const placeNote = court && m.location_text ? m.location_text : null;
            return (
              <Link key={m.id} href={`/play/${m.id}`} className="lift block rounded-2xl border border-rule bg-surface p-5">
                <div className="flex items-center justify-between">
                  <span className="text-2xl" aria-hidden>{meta.emoji}</span>
                  <span
                    className="kicker rounded-full px-2 py-1 text-[9px]"
                    style={{ background: full ? "#f4f4f5" : "#fff1ed", color: full ? "#71717a" : "#d63a0f" }}
                  >
                    {full ? "Full · waitlist" : `${left} spot${left === 1 ? "" : "s"} left`}
                  </span>
                </div>
                <h3 className="mt-3 font-display text-xl text-ink">
                  {meta.name} · {m.format === "doubles" ? "Doubles" : "Singles"}
                </h3>
                <div className="mt-3 space-y-1.5 text-sm text-mute">
                  <div className="flex items-center gap-2"><CalendarClock size={14} className="shrink-0 text-faint" /> {whenLabel(m.scheduled_at)}</div>
                  {placeLabel ? (
                    <div className="flex items-center gap-2"><MapPin size={14} className="shrink-0 text-faint" /> <span className="truncate">{placeLabel}{placeNote ? ` · ${placeNote}` : ""}</span></div>
                  ) : null}
                  <div className="flex items-center gap-2"><Users size={14} className="shrink-0 text-faint" /> {filled}/{m.total_slots} players</div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-rule pt-3">
                  <span className="truncate text-xs text-faint">by {org?.display_name ?? "a player"}{mine ? " · you're in" : ""}</span>
                  <span className="shrink-0 text-xs font-semibold text-brand-deep">View →</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterPill({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className="press rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors"
      style={{
        borderColor: active ? "#0a0a0b" : "#e4e4e7",
        background: active ? "#0a0a0b" : "transparent",
        color: active ? "#ffffff" : "#71717a",
      }}
    >
      {label}
    </Link>
  );
}
