import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { MapPin, Clock, Users, Check, CalendarPlus, DollarSign, Pencil, Ban } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { EventCoverEditor } from "@/components/event-cover-editor";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { Avatar } from "@/components/avatar";
import { rsvp, cancelRsvp, cancelEvent } from "../actions";

export const metadata: Metadata = { title: "Event" };

type Prof = { id: string; display_name: string; avatar_hue: number; avatar_path: string | null };

const TZ = "America/Los_Angeles";
const KIND_LABEL: Record<string, string> = {
  open_play: "Open play",
  ladder: "Ladder night",
  clinic: "Clinic",
  tournament: "Tournament",
  social: "Social",
};

function isPast(iso: string) {
  return new Date(iso).getTime() < Date.now();
}
const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("en-US", { ...opts, timeZone: TZ });
function gcalStamp(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/events/${id}`);

  const { data: e } = await supabase
    .from("events")
    .select("id, title, sport_key, kind, description, court_id, location_text, starts_at, ends_at, capacity, cost_text, status, created_by, cover_path")
    .eq("id", id)
    .maybeSingle();
  if (!e) notFound();

  const meta = sportMeta(e.sport_key);
  const isCreator = e.created_by === user.id;
  const coverUrl = e.cover_path ? supabase.storage.from("tournament-gallery").getPublicUrl(e.cover_path).data.publicUrl : null;

  const [{ data: rsvps }, court] = await Promise.all([
    supabase.from("event_rsvps").select("user_id").eq("event_id", id),
    e.court_id
      ? supabase.from("courts").select("id, name, neighborhood, city").eq("id", e.court_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const attendeeIds = (rsvps ?? []).map((r) => r.user_id);
  const count = attendeeIds.length;
  const amGoing = attendeeIds.includes(user.id);

  const profById = new Map<string, Prof>();
  if (attendeeIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_hue, avatar_path").in("id", attendeeIds.slice(0, 24));
    for (const p of (profs as Prof[] | null) ?? []) profById.set(p.id, p);
  }
  const avatarUrl = (p: Prof | undefined) =>
    p?.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null;

  const courtData = court.data as { id: string; name: string; neighborhood: string | null; city: string | null } | null;
  const where = courtData ? courtData.name : e.location_text;
  const full = e.capacity != null && count >= e.capacity && !amGoing;
  const past = isPast(e.starts_at);
  const cancelled = e.status === "cancelled";
  const canRsvp = !past && !cancelled;
  const spotsLeft = e.capacity != null ? Math.max(0, e.capacity - count) : null;

  const gcalEnd = e.ends_at ?? new Date(new Date(e.starts_at).getTime() + 2 * 3600000).toISOString();
  const gcal =
    `https://www.google.com/calendar/render?action=TEMPLATE` +
    `&text=${encodeURIComponent(e.title)}` +
    `&dates=${gcalStamp(e.starts_at)}/${gcalStamp(gcalEnd)}` +
    `&details=${encodeURIComponent(e.description ?? "")}` +
    `&location=${encodeURIComponent(where ?? "")}`;

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <BackButton fallback="/events" label="Events" className="press mb-5 inline-flex items-center gap-1 text-sm font-semibold text-mute hover:text-ink" size={15} />

      {isCreator ? (
        <EventCoverEditor eventId={e.id} initialUrl={coverUrl} />
      ) : coverUrl ? (
        <div className="mx-auto mb-6 aspect-square w-full max-w-sm overflow-hidden rounded-3xl border border-rule">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        </div>
      ) : null}

      <span className="inline-block rounded-full border border-rule bg-surface px-2.5 py-1 text-xs font-semibold text-ink">
        {meta.emoji} {meta.name} · {KIND_LABEL[e.kind] ?? "Event"}
      </span>
      <h1 className="mt-2 font-display text-3xl leading-tight text-ink sm:text-4xl">{e.title}</h1>

      {cancelled ? (
        <div className="mt-3 rounded-xl border border-brand/30 bg-tint-brand px-4 py-2.5 text-sm font-semibold text-brand-deep">This event was cancelled.</div>
      ) : past ? (
        <div className="mt-3 rounded-xl border border-rule bg-[#f4f4f5] px-4 py-2.5 text-sm font-semibold text-mute">This event has ended.</div>
      ) : null}

      {isCreator ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            href={`/events/${e.id}/edit`}
            className="press inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-4 py-1.5 text-sm font-semibold text-ink transition-colors hover:border-brand"
          >
            <Pencil size={14} /> Edit event
          </Link>
          {!cancelled ? (
            <form action={cancelEvent}>
              <input type="hidden" name="eventId" value={e.id} />
              <button className="press inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-4 py-1.5 text-sm font-semibold text-mute transition-colors hover:border-brand hover:text-brand-deep">
                <Ban size={14} /> Cancel event
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {/* facts */}
      <div className="mt-4 space-y-2 text-sm text-ink">
        <p className="flex items-center gap-2">
          <Clock size={15} className="shrink-0 text-mute" />
          {fmt(e.starts_at, { weekday: "long", month: "long", day: "numeric" })} · {fmt(e.starts_at, { hour: "numeric", minute: "2-digit" })}
          {e.ends_at ? ` – ${fmt(e.ends_at, { hour: "numeric", minute: "2-digit" })}` : ""} PT
        </p>
        {where ? (
          <p className="flex items-center gap-2">
            <MapPin size={15} className="shrink-0 text-mute" />
            {courtData ? (
              <Link href={`/courts/${courtData.id}`} className="font-semibold text-brand-deep hover:text-brand">
                {courtData.name}
              </Link>
            ) : (
              where
            )}
            {courtData?.neighborhood ? <span className="text-mute">· {courtData.neighborhood}</span> : null}
          </p>
        ) : null}
        {e.cost_text ? (
          <p className="flex items-center gap-2">
            <DollarSign size={15} className="shrink-0 text-mute" /> {e.cost_text}
          </p>
        ) : null}
        <p className="flex items-center gap-2">
          <Users size={15} className="shrink-0 text-mute" />
          {count} going{e.capacity != null ? ` · ${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left` : ""}
        </p>
      </div>

      {/* actions */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {canRsvp ? (
          amGoing ? (
            <form action={cancelRsvp}>
              <input type="hidden" name="eventId" value={e.id} />
              <button className="press inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-tint-success px-5 py-2.5 text-sm font-semibold text-success">
                <Check size={15} /> You&apos;re going · cancel
              </button>
            </form>
          ) : full ? (
            <span className="rounded-full border border-rule bg-[#f4f4f5] px-5 py-2.5 text-sm font-semibold text-mute">Event full</span>
          ) : (
            <form action={rsvp}>
              <input type="hidden" name="eventId" value={e.id} />
              <button className="press rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep">RSVP</button>
            </form>
          )
        ) : null}
        {!cancelled ? (
          <a
            href={gcal}
            target="_blank"
            rel="noopener noreferrer"
            className="press inline-flex items-center gap-1.5 rounded-full border border-rule px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-[#f4f4f5]"
          >
            <CalendarPlus size={15} /> Add to calendar
          </a>
        ) : null}
      </div>

      {/* description */}
      {e.description ? <p className="mt-6 text-sm leading-relaxed text-ink-soft">{e.description}</p> : null}

      {/* attendees */}
      {count > 0 ? (
        <section className="mt-7">
          <h2 className="kicker mb-2 text-faint">Who&apos;s going ({count})</h2>
          <div className="flex flex-wrap gap-2">
            {attendeeIds.slice(0, 24).map((uid) => {
              const p = profById.get(uid);
              return (
                <Link key={uid} href={`/profile/${uid}`} className="press flex items-center gap-1.5 rounded-full border border-rule bg-surface py-1 pl-1 pr-3">
                  <Avatar url={avatarUrl(p)} hue={p?.avatar_hue ?? 200} name={p?.display_name ?? "Player"} size={24} />
                  <span className="max-w-28 truncate text-xs font-medium text-ink">{p?.display_name ?? "Player"}</span>
                </Link>
              );
            })}
            {count > 24 ? <span className="self-center text-xs text-faint">+{count - 24} more</span> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
