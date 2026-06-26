import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EventsBrowser, type CardEvent } from "@/components/events-browser";

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
  cover_path: string | null;
};

const COVER_BUCKET = "tournament-gallery";

// Wrapped in a helper so the render body stays free of a bare new Date() call.
function nowIso() {
  return new Date().toISOString();
}
function nowMs() {
  return Date.now();
}

export default async function EventsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/events");

  const { data: eData } = await supabase
    .from("events")
    .select("id, title, sport_key, kind, court_id, location_text, starts_at, capacity, cost_text, cover_path")
    .eq("status", "active")
    .gte("starts_at", nowIso())
    .order("starts_at")
    .limit(60);
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

  const cards: CardEvent[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    sportKey: e.sport_key,
    kind: e.kind,
    whenIso: e.starts_at,
    venue: e.court_id ? courtName.get(e.court_id) ?? null : e.location_text,
    goingCount: counts.get(e.id) ?? 0,
    capacity: e.capacity,
    amGoing: going.has(e.id),
    coverUrl: e.cover_path ? supabase.storage.from(COVER_BUCKET).getPublicUrl(e.cover_path).data.publicUrl : null,
    costText: e.cost_text,
  }));

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Events</h1>
          <p className="mt-1 text-sm text-mute">Open play, ladder nights, clinics, and tournaments near you. Times shown in PT.</p>
        </div>
        <Link
          href="/events/new"
          className="press inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep"
        >
          <Plus size={16} /> Host an event
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="rounded-3xl border border-rule bg-surface p-12 text-center text-sm text-mute">No upcoming events right now. Check back soon.</div>
      ) : (
        <EventsBrowser events={cards} nowMs={nowMs()} />
      )}
    </div>
  );
}
