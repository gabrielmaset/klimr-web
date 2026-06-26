import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MapPin, Clock, Users, Check, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";

export const metadata: Metadata = { title: "Events" };

type Ev = {
  id: string;
  title: string;
  sport_key: string;
  kind: string;
  court_id: string | null;
  location_text: string | null;
  starts_at: string;
  capacity: number | null;
  cost_text: string | null;
};

const TZ = "America/Los_Angeles";
const KIND_LABEL: Record<string, string> = {
  open_play: "Open play",
  ladder: "Ladder night",
  clinic: "Clinic",
  tournament: "Tournament",
  social: "Social",
};

function nowIso() {
  return new Date().toISOString();
}
const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("en-US", { ...opts, timeZone: TZ });

export default async function EventsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/events");

  const { data: eData } = await supabase
    .from("events")
    .select("id, title, sport_key, kind, court_id, location_text, starts_at, capacity, cost_text")
    .eq("status", "active")
    .gte("starts_at", nowIso())
    .order("starts_at")
    .limit(30);
  const events = (eData as Ev[] | null) ?? [];

  const ids = events.map((e) => e.id);
  const going = new Set<string>();
  const counts = new Map<string, number>();
  const courtName = new Map<string, string>();
  if (ids.length) {
    const courtIds = [...new Set(events.map((e) => e.court_id).filter(Boolean))] as string[];
    const [{ data: rsvps }, courtsRes] = await Promise.all([
      supabase.from("event_rsvps").select("event_id, user_id").in("event_id", ids),
      courtIds.length ? supabase.from("courts").select("id, name").in("id", courtIds) : Promise.resolve({ data: [] }),
    ]);
    for (const r of rsvps ?? []) {
      counts.set(r.event_id, (counts.get(r.event_id) ?? 0) + 1);
      if (r.user_id === user.id) going.add(r.event_id);
    }
    for (const c of (courtsRes.data as { id: string; name: string }[] | null) ?? []) courtName.set(c.id, c.name);
  }

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-5">
        <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Events</h1>
        <p className="mt-1 text-sm text-mute">Open play, ladder nights, clinics, and tournaments near you. Times shown in PT.</p>
      </div>

      {events.length === 0 ? (
        <div className="rounded-2xl border border-rule bg-surface p-10 text-center text-sm text-mute">
          No upcoming events right now. Check back soon.
        </div>
      ) : (
        <div className="space-y-2.5">
          {events.map((e) => {
            const meta = sportMeta(e.sport_key);
            const n = counts.get(e.id) ?? 0;
            const where = e.court_id ? courtName.get(e.court_id) : e.location_text;
            const full = e.capacity != null && n >= e.capacity;
            const amGoing = going.has(e.id);
            return (
              <Link key={e.id} href={`/events/${e.id}`} className="lift flex gap-3 rounded-2xl border border-rule bg-surface p-4">
                {/* date badge */}
                <div className="flex w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-[#f4f4f5] py-1.5">
                  <span className="kicker text-brand-deep">{fmt(e.starts_at, { month: "short" })}</span>
                  <span className="font-display text-2xl leading-none text-ink">{fmt(e.starts_at, { day: "numeric" })}</span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-ink">{e.title}</span>
                    {amGoing ? (
                      <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-tint-success px-1.5 py-0.5 text-[10px] font-bold text-success">
                        <Check size={10} /> Going
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-mute">
                    {meta.emoji} {KIND_LABEL[e.kind] ?? "Event"}
                    {e.cost_text ? ` · ${e.cost_text}` : ""}
                  </p>
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-faint">
                    <span className="flex items-center gap-1"><Clock size={11} /> {fmt(e.starts_at, { weekday: "short", hour: "numeric", minute: "2-digit" })}</span>
                    {where ? <span className="flex min-w-0 items-center gap-1"><MapPin size={11} /> <span className="truncate">{where}</span></span> : null}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-faint">
                    <Users size={11} /> {n}
                    {e.capacity != null ? `/${e.capacity}` : ""} going{full ? " · full" : ""}
                  </p>
                </div>
                <ChevronRight size={18} className="shrink-0 self-center text-faint" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
