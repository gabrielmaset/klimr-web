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
  thumb_path: string | null;
  created_by: string | null;
  status: string;
};

const COVER_BUCKET = "tournament-gallery";
const CARD_COLS = "id, title, sport_key, kind, court_id, location_text, starts_at, capacity, cost_text, cover_path, thumb_path, created_by, status";

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

  const [{ data: eData }, { data: mgr }] = await Promise.all([
    supabase.from("events").select(CARD_COLS).eq("status", "active").gte("starts_at", nowIso()).order("starts_at").limit(60),
    supabase.from("event_managers").select("event_id").eq("user_id", user.id),
  ]);
  const events = (eData as Ev[] | null) ?? [];
  const adminSet = new Set<string>((mgr ?? []).map((m) => m.event_id));

  // events the viewer owns or co-admins — any status, most recent first
  let myRows: Ev[] = [];
  {
    const adminIds = [...adminSet];
    let qb = supabase.from("events").select(CARD_COLS);
    qb = adminIds.length ? qb.or(`created_by.eq.${user.id},id.in.(${adminIds.join(",")})`) : qb.eq("created_by", user.id);
    const { data } = await qb.order("starts_at", { ascending: false }).limit(60);
    myRows = (data as Ev[] | null) ?? [];
  }

  const allIds = [...new Set([...events.map((e) => e.id), ...myRows.map((e) => e.id)])];
  const going = new Set<string>();
  const counts = new Map<string, number>();
  const courtName = new Map<string, string>();
  if (allIds.length) {
    const courtIds = [...new Set([...events, ...myRows].map((e) => e.court_id).filter(Boolean))] as string[];
    const [{ data: rsvps }, courtsRes] = await Promise.all([
      supabase.from("event_rsvps").select("event_id, user_id, status").in("event_id", allIds).eq("status", "going"),
      courtIds.length ? supabase.from("courts").select("id, name").in("id", courtIds) : Promise.resolve({ data: [] }),
    ]);
    for (const r of rsvps ?? []) {
      counts.set(r.event_id, (counts.get(r.event_id) ?? 0) + 1);
      if (r.user_id === user.id) going.add(r.event_id);
    }
    for (const c of (courtsRes.data as { id: string; name: string }[] | null) ?? []) courtName.set(c.id, c.name);
  }

  const coverUrl = (e: Ev) => {
    const path = e.thumb_path || e.cover_path;
    return path ? supabase.storage.from(COVER_BUCKET).getPublicUrl(path).data.publicUrl : null;
  };
  const toCard = (e: Ev): CardEvent => ({
    id: e.id,
    title: e.title,
    sportKey: e.sport_key,
    kind: e.kind,
    whenIso: e.starts_at,
    venue: e.court_id ? courtName.get(e.court_id) ?? null : e.location_text,
    goingCount: counts.get(e.id) ?? 0,
    capacity: e.capacity,
    amGoing: going.has(e.id),
    coverUrl: coverUrl(e),
    costText: e.cost_text,
    mine: e.created_by === user.id || adminSet.has(e.id),
    status: e.status,
  });

  const cards = events.map(toCard);
  const myCards = myRows.map(toCard);

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Events</h1>
          <p className="mt-1 text-sm text-mute">Open play, ladder nights, clinics, and tournaments near you. Times shown in PT.</p>
          <Link href="/archive?tab=events" className="mt-1.5 inline-block text-xs font-semibold text-brand-deep hover:underline">View past events →</Link>
        </div>
        <Link href="/events/new" className="press inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep shadow-md shadow-brand/25">
          <Plus size={16} /> Host an event
        </Link>
      </div>

      <EventsBrowser events={cards} myEvents={myCards} nowMs={nowMs()} />
    </div>
  );
}
