import type { Metadata } from "next";
import { SportIcon } from "@/components/sport-icons";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { MapPin, Clock, Users, Check, CalendarPlus, DollarSign, Pencil, Ban, Repeat, ArrowRight, MessageCircle, UserCheck, X, Crown, Shield, Wrench, ExternalLink, RotateCcw } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { EventHeroCover } from "@/components/event-hero-cover";
import { EventQueueAdmin } from "@/components/event-queue-admin";
import { EventAdmins } from "@/components/event-admins";
import { EventLocationMap } from "@/components/event-location-map";
import { EventShareKit } from "@/components/event-share-kit";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { sanitizeRichText, looksLikeHtml } from "@/lib/rich-text";
import { Avatar } from "@/components/avatar";
import { rsvp, cancelRsvp, approveMember, denyMember } from "../actions";
import { rsvpCycleStartMs } from "@/lib/event-schedule";
import { eventKindLabel } from "@/lib/event-kinds";
import { mapsPointFromUrl, firstMapsUrlInText, geocodeAddress } from "@/lib/maps-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { retireSessionIfStale } from "@/lib/queue-state";
import { DangerConfirm } from "@/components/danger-confirm";
import { cancelEventById, reopenEvent } from "../actions";
import { withinRecoverWindow, recoverDaysLeft } from "@/lib/recover";

export const metadata: Metadata = { title: "Event" };

type Prof = { id: string; display_name: string; avatar_hue: number; avatar_path: string | null };

const TZ = "America/Los_Angeles";
const DAY_LABEL: Record<string, string> = { SU: "Sun", MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat" };

function isPast(iso: string) {
  return new Date(iso).getTime() < Date.now();
}
const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("en-US", { ...opts, timeZone: TZ });
function gcalStamp(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function recurrenceText(recurrence: string, days: string[]): string | null {
  const dlabel = days.length ? days.map((d) => DAY_LABEL[d] ?? d).join(", ") : null;
  if (recurrence === "weekly") return dlabel ? `Weekly · ${dlabel}` : "Weekly";
  if (recurrence === "biweekly") return dlabel ? `Every 2 weeks · ${dlabel}` : "Every 2 weeks";
  if (recurrence === "monthly") return "Monthly";
  if (recurrence === "daily") return "Daily";
  return null;
}

function Tile({ icon, label, children, tint }: { icon: React.ReactNode; label: string; children: React.ReactNode; tint: string }) {
  return (
    <div className="rounded-2xl border border-rule p-4" style={{ background: tint }}>
      <div className="flex items-center gap-1.5 text-mute">
        {icon}
        <span className="kicker">{label}</span>
      </div>
      <div className="mt-1.5 text-sm font-semibold text-ink">{children}</div>
    </div>
  );
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
    .select("id, title, sport_key, kind, description, court_id, location_text, location_url, starts_at, ends_at, capacity, cost_text, status, created_by, cover_path, whatsapp_url, join_policy, recurrence, recurrence_days, queue_enabled, cancelled_at, location_reveal")
    .eq("id", id)
    .maybeSingle();
  if (!e) notFound();

  const meta = sportMeta(e.sport_key);
  const isOwner = e.created_by === user.id;
  const coverUrl = e.cover_path ? supabase.storage.from("tournament-gallery").getPublicUrl(e.cover_path).data.publicUrl : null;

  const [{ data: rsvps }, { data: managerRows }, court] = await Promise.all([
    supabase.from("event_rsvps").select("user_id, status, created_at").eq("event_id", id),
    supabase.from("event_managers").select("user_id").eq("event_id", id),
    e.court_id ? supabase.from("courts").select("id, name, neighborhood, city, lat, lng").eq("id", e.court_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const adminIds = new Set<string>([e.created_by ?? "", ...((managerRows ?? []).map((m) => m.user_id))].filter(Boolean));
  const isAdmin = isOwner || adminIds.has(user.id);

  const allRsvps = rsvps ?? [];
  const cycleStartMs = rsvpCycleStartMs(e.starts_at, e.recurrence, e.recurrence_days ?? []);
  const inCycle = (createdAt: string) => cycleStartMs == null || new Date(createdAt).getTime() > cycleStartMs;
  const goingIds = allRsvps.filter((r) => r.status === "going" && inCycle(r.created_at)).map((r) => r.user_id);
  const pendingIds = allRsvps.filter((r) => r.status === "pending").map((r) => r.user_id);
  const myRsvp = allRsvps.find((r) => r.user_id === user.id);
  // A stale "going" from a past occurrence reads as not-going, so the user can re-RSVP for the next one.
  const myStatus = myRsvp ? (myRsvp.status === "going" && !inCycle(myRsvp.created_at) ? null : myRsvp.status) : null; // 'going' | 'pending' | null
  const count = goingIds.length;

  const wanted = [...new Set([...goingIds.slice(0, 60), ...pendingIds.slice(0, 30)])];
  const profById = new Map<string, Prof>();
  if (wanted.length) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_hue, avatar_path").in("id", wanted);
    for (const p of (profs as Prof[] | null) ?? []) profById.set(p.id, p);
  }
  const avatarUrl = (p: Prof | undefined) => (p?.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null);

  // admin roster (owner + managers) — some admins may not be RSVP'd "going", so fetch any missing profiles
  const adminIdList = [...adminIds];
  const adminProfById = new Map<string, Prof>(profById);
  const missingAdmin = adminIdList.filter((uid) => !adminProfById.has(uid));
  if (missingAdmin.length) {
    const { data: aprofs } = await supabase.from("profiles").select("id, display_name, avatar_hue, avatar_path").in("id", missingAdmin);
    for (const p of (aprofs as Prof[] | null) ?? []) adminProfById.set(p.id, p);
  }
  const initialAdmins = adminIdList
    .map((uid) => {
      const p = adminProfById.get(uid);
      return { id: uid, name: p?.display_name ?? "Player", hue: p?.avatar_hue ?? 200, avatarUrl: avatarUrl(p), isOwner: uid === e.created_by };
    })
    .sort((a, b) => (a.isOwner === b.isOwner ? 0 : a.isOwner ? -1 : 1));

  let session: { id: string; code: string; status: string; firstCourtId: string | null } | null = null;
  if (e.queue_enabled) {
    // Latest session in ANY state — an ended one still matters (the panel offers
    // "Start today's queue" on the SAME session so the printed code survives).
    const { data: qs } = await supabase.from("court_sessions").select("id, code, status, created_at").eq("event_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (qs && (await retireSessionIfStale(createAdminClient(), qs))) qs.status = "ended";
    if (qs) {
      const { data: firstCourt } = await supabase.from("queue_courts").select("id").eq("session_id", qs.id).order("sort").limit(1).maybeSingle();
      session = { id: qs.id, code: qs.code, status: qs.status, firstCourtId: firstCourt?.id ?? null };
    }
  }

  const courtData = court.data as { id: string; name: string; neighborhood: string | null; city: string | null; lat: number | null; lng: number | null } | null;
  const where = courtData ? courtData.name : e.location_text;
  const locationLocked = e.location_reveal === "rsvp" && !isAdmin && myStatus !== "going";
  const whereShown = locationLocked ? (courtData?.neighborhood ?? courtData?.city ?? "Location shared after RSVP") : where;
  const full = e.capacity != null && count >= e.capacity && myStatus !== "going";
  const past = isPast(e.starts_at);
  const cancelled = e.status === "cancelled";
  const canRsvp = !past && !cancelled;
  const spotsLeft = e.capacity != null ? Math.max(0, e.capacity - count) : null;
  const recurText = recurrenceText(e.recurrence, e.recurrence_days ?? []);
  const queueLiveForMembers = e.queue_enabled && session?.status === "live";
  const showWhatsApp = !!e.whatsapp_url && (myStatus === "going" || isAdmin);

  // One source of truth for "where": the organizer's pasted Maps link wins
  // (location_url, else the first Maps link inside the description — organizers
  // often put the real meeting-point pin there), else a Maps search for the
  // venue text. The embed pin is resolved from the SAME link so the map can
  // never show a different place than the link opens.
  const mapsQuery = [courtData?.name ?? e.location_text, courtData?.city].filter(Boolean).join(", ");
  const pinUrl = e.location_url || firstMapsUrlInText((e.description ?? "").replace(/<[^>]+>/g, " "));
  const mapsHref = pinUrl || (mapsQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}` : null);
  // Embed pin, most precise first: the court's stored coordinate → the
  // coordinate dug out of the organizer's link → server-side geocode of the
  // venue text (the keyless embed's own text geocoding is unreliable).
  let mapPoint =
    courtData?.lat != null && courtData?.lng != null
      ? { lat: courtData.lat, lng: courtData.lng }
      : await mapsPointFromUrl(pinUrl);
  if (!mapPoint && !locationLocked && (mapsQuery || e.location_text)) {
    mapPoint = await geocodeAddress(mapsQuery || e.location_text);
  }

  const descHtml = e.description ? (looksLikeHtml(e.description) ? sanitizeRichText(e.description) : null) : null;
  const plainDesc = (e.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  const gcalEnd = e.ends_at ?? new Date(new Date(e.starts_at).getTime() + 2 * 3600000).toISOString();
  const gcal =
    `https://www.google.com/calendar/render?action=TEMPLATE` +
    `&text=${encodeURIComponent(e.title)}` +
    `&dates=${gcalStamp(e.starts_at)}/${gcalStamp(gcalEnd)}` +
    `&details=${encodeURIComponent(plainDesc)}` +
    `&location=${encodeURIComponent(where ?? "")}`;

  const pendingProfiles = pendingIds.map((uid) => profById.get(uid)).filter(Boolean) as Prof[];

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <BackButton fallback="/events" label="Events" className="press mb-5 inline-flex items-center gap-1 text-sm font-semibold text-mute hover:text-ink" size={15} />

      {/* hero */}
      <EventHeroCover eventId={e.id} initialUrl={coverUrl} canEdit={isAdmin} sportKey={e.sport_key}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
            <SportIcon sport={e.sport_key} variant="badge" size={14} /> {meta.name} · {eventKindLabel(e.kind)}
          </span>
          {recurText ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
              <Repeat size={11} /> {recurText}
            </span>
          ) : null}
          {queueLiveForMembers ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-2.5 py-1 text-xs font-bold text-white">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
              LIVE NOW
            </span>
          ) : null}
        </div>
        <h1 className="mt-2 max-w-3xl font-display text-3xl leading-tight text-white drop-shadow-md sm:text-5xl">{e.title}</h1>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/90 drop-shadow">
          <span className="inline-flex items-center gap-1.5">
            <Clock size={15} /> {fmt(e.starts_at, { weekday: "short", month: "short", day: "numeric" })} · {fmt(e.starts_at, { hour: "numeric", minute: "2-digit" })} PT
          </span>
          {locationLocked ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={15} /> {whereShown}
              <span className="rounded-full border border-rule bg-bg px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-faint">Exact spot after RSVP</span>
            </span>
          ) : where ? (
            mapsHref ? (
              <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline">
                <MapPin size={15} /> {where} <ExternalLink size={12} />
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={15} /> {where}
              </span>
            )
          ) : null}
        </div>
      </EventHeroCover>

      {/* status notices */}
      {cancelled ? (
        <div className="mt-5 rounded-2xl border border-brand/30 bg-tint-brand px-4 py-3.5">
          <p className="text-sm font-semibold text-brand-deep">This event was cancelled.</p>
          {isOwner ? (
            withinRecoverWindow(e.cancelled_at) ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-3">
                <form action={reopenEvent}>
                  <input type="hidden" name="eventId" value={e.id} />
                  <button className="press inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep">
                    <RotateCcw size={14} /> Recover event
                  </button>
                </form>
                <span className="text-xs text-mute">Recoverable for {recoverDaysLeft(e.cancelled_at)} more day{recoverDaysLeft(e.cancelled_at) === 1 ? "" : "s"}, then archived.</span>
              </div>
            ) : (
              <p className="mt-1 text-xs text-mute">The 90-day recovery window has passed — this event is archived. Its data is kept.</p>
            )
          ) : null}
        </div>
      ) : past ? (
        <div className="mt-5 rounded-2xl border border-rule bg-bg px-4 py-3 text-sm font-semibold text-mute">This event has ended.</div>
      ) : null}

      {/* primary actions (attendee-facing) */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {canRsvp ? (
          myStatus === "going" ? (
            <form action={cancelRsvp}>
              <input type="hidden" name="eventId" value={e.id} />
              <button className="press inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-tint-success px-5 py-2.5 text-sm font-semibold text-success">
                <Check size={15} /> You&apos;re in · tap to leave
              </button>
            </form>
          ) : myStatus === "pending" ? (
            <form action={cancelRsvp}>
              <input type="hidden" name="eventId" value={e.id} />
              <button className="press inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-tint-warning px-5 py-2.5 text-sm font-semibold text-warning">
                <Clock size={15} /> Awaiting approval · cancel
              </button>
            </form>
          ) : full ? (
            <span className="rounded-full border border-rule bg-bg px-5 py-2.5 text-sm font-semibold text-mute">Event full</span>
          ) : (
            <form action={rsvp}>
              <input type="hidden" name="eventId" value={e.id} />
              <button className="press rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep">{e.join_policy === "approval" ? "Request to join" : "Join event"}</button>
              <p className="mt-2 max-w-md text-[10.5px] leading-relaxed text-faint">
                By joining you agree to the <a href="/legal#terms" target="_blank" className="font-semibold underline decoration-rule-2 underline-offset-2">Klimr Terms</a>, including assumption of risk &amp; release. This event is hosted by a member — Klimr is not the organizer.
              </p>
            </form>
          )
        ) : null}

        {showWhatsApp ? (
          <a href={e.whatsapp_url!} target="_blank" rel="noopener noreferrer" className="press inline-flex items-center gap-1.5 rounded-full border border-[#25D366]/40 bg-[#25D366]/10 px-4 py-2.5 text-sm font-semibold text-[#128C7E] transition-colors hover:bg-[#25D366]/20">
            <MessageCircle size={15} /> WhatsApp group
          </a>
        ) : null}

        {myStatus === "going" || myStatus === "pending" ? (
          <Link href="/me" className="press inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-tint-success px-4 py-2.5 text-sm font-semibold text-success">
            <Check size={15} /> On your Klimr calendar
          </Link>
        ) : null}

        {!cancelled ? (
          <a href={gcal} target="_blank" rel="noopener noreferrer" className="press inline-flex items-center gap-1.5 rounded-full border border-rule px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-bg">
            <CalendarPlus size={15} /> Google Calendar
          </a>
        ) : null}
      </div>
      {canRsvp && !cancelled && myStatus !== "going" && myStatus !== "pending" ? (
        <p className="mt-2 flex items-center gap-1.5 px-1 text-xs text-mute">
          <CalendarPlus size={12} className="shrink-0 text-faint" /> Joining adds this to your Klimr calendar.
        </p>
      ) : null}

      {/* member-facing LIVE entry */}
      {queueLiveForMembers && myStatus === "going" && !isAdmin && session ? (
        <Link href={`/queue/${session.id}`} className="lift mt-5 flex items-center gap-3 overflow-hidden rounded-3xl border border-brand/30 bg-gradient-to-r from-tint-brand to-surface p-4">
          <span className="relative flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-brand" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-brand-deep">Live queue is on — jump in</span>
            <span className="block text-xs text-mute">See the line, grab a spot, and check your place from your phone.</span>
          </span>
          <ArrowRight size={18} className="shrink-0 text-brand-deep" />
        </Link>
      ) : null}

      {/* facts */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={<Clock size={14} />} label={e.recurrence && e.recurrence !== "none" ? "Next event" : "When"} tint="linear-gradient(135deg,#fff1ed,#ffffff)">
          {fmt(e.starts_at, { weekday: "long", month: "long", day: "numeric" })}
          <span className="mt-0.5 block text-xs font-normal text-mute">
            {fmt(e.starts_at, { hour: "numeric", minute: "2-digit" })}
            {e.ends_at ? ` – ${fmt(e.ends_at, { hour: "numeric", minute: "2-digit" })}` : ""} PT{recurText ? ` · ${recurText}` : ""}
          </span>
        </Tile>
        <Tile icon={<MapPin size={14} />} label="Where" tint="linear-gradient(135deg,#eef6ff,#ffffff)">
          {mapsHref ? (
            <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-deep hover:text-brand">
              {where ?? "View location"} <ExternalLink size={12} />
            </a>
          ) : (
            where ?? "TBD"
          )}
          {courtData ? (
            <Link href={`/courts/${courtData.id}`} className="mt-0.5 block text-xs font-normal text-mute hover:text-brand-deep">
              {courtData.neighborhood ? courtData.neighborhood : "View court page"}
            </Link>
          ) : null}
        </Tile>
        <Tile icon={<Users size={14} />} label="Going" tint="linear-gradient(135deg,#effaf2,#ffffff)">
          {count}
          {e.capacity != null ? <span className="mt-0.5 block text-xs font-normal text-mute">{spotsLeft} spot{spotsLeft === 1 ? "" : "s"} left</span> : <span className="mt-0.5 block text-xs font-normal text-mute">Open capacity</span>}
        </Tile>
        <Tile icon={<DollarSign size={14} />} label="Cost" tint="linear-gradient(135deg,#fdf4ff,#ffffff)">
          {e.cost_text || "Free"}
          <span className="mt-0.5 block text-xs font-normal text-mute capitalize">{e.join_policy === "approval" ? "Approval to join" : "Open to all"}</span>
        </Tile>
      </div>

      {/* description + map */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {descHtml || plainDesc ? (
          <section className="rounded-3xl border-l-4 border-l-brand border-y border-r border-rule bg-gradient-to-r from-bg/60 to-surface p-5 sm:p-6">
            {descHtml ? <div className="rich-text" dangerouslySetInnerHTML={{ __html: descHtml }} /> : <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{plainDesc}</p>}
          </section>
        ) : (
          <div />
        )}
        {!locationLocked && where ? <EventLocationMap name={courtData?.name ?? e.location_text} address={e.location_text} zip={null} lat={null} lng={null} point={mapPoint} href={mapsHref ?? undefined} /> : null}

        {/* Promo copy is an organizer tool — members already have RSVP + calendar. */}
        {isAdmin ? <EventShareKit
          title={e.title}
          sportName={sportMeta(e.sport_key).name}
          sportEmoji={sportMeta(e.sport_key).emoji}
          kindLabel={eventKindLabel(e.kind)}
          startsAt={e.starts_at}
          endsAt={e.ends_at}
          where={locationLocked ? null : (where ?? null)}
          whereLocked={locationLocked}
          costText={e.cost_text}
          capacity={e.capacity}
          description={e.description}
          url={`https://klimr.com/events/${e.id}`}
        /> : null}
      </div>

      {/* ORGANIZER TOOLS — everything admin-only lives here, clearly separated */}
      {isAdmin && !cancelled ? (
        <section className="mt-7 rounded-3xl border border-dashed border-brand/40 bg-tint-brand/40 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Wrench size={15} className="text-brand-deep" />
            <h2 className="text-sm font-bold text-ink">Organizer tools</h2>
            <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{isOwner ? "Organizer" : "Admin"}</span>
            <span className="ml-auto text-[11px] text-mute">Only admins see this panel</span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href={`/events/${e.id}/edit`} className="press inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand">
              <Pencil size={14} /> Edit event details
            </Link>
            {isOwner ? (
              <DangerConfirm
                word="CANCEL"
                triggerLabel="Cancel event"
                triggerIcon={<Ban size={14} />}
                heading="Cancel this event?"
                description="RSVPs stop and it drops off listings. Nothing is deleted — your photos, RSVPs, and queue history are kept, and you can recover it for 90 days."
                consequences={["Any live queue for this event is turned off", "Guests can no longer RSVP or join", "Recoverable for 90 days, then archived read-only"]}
                confirmLabel="Cancel event"
                onConfirm={cancelEventById.bind(null, e.id)}
              />
            ) : null}
          </div>

          {e.join_policy === "approval" && pendingProfiles.length ? (
            <div className="mt-4 rounded-3xl border border-warning/30 bg-tint-warning p-4">
              <p className="kicker mb-3 flex items-center gap-1.5 text-warning">
                <UserCheck size={14} /> Requests to join · {pendingProfiles.length}
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {pendingProfiles.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 rounded-2xl border border-rule bg-surface shadow-e1 px-3 py-2">
                    <Link href={`/profile/${p.id}`} className="flex min-w-0 items-center gap-2">
                      <Avatar url={avatarUrl(p)} hue={p.avatar_hue} name={p.display_name} size={28} />
                      <span className="truncate text-sm font-medium text-ink">{p.display_name}</span>
                    </Link>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <form action={approveMember}>
                        <input type="hidden" name="eventId" value={e.id} />
                        <input type="hidden" name="userId" value={p.id} />
                        <button className="press inline-flex items-center gap-1 rounded-full bg-success px-3 py-1.5 text-xs font-semibold text-white hover:brightness-95">
                          <Check size={13} /> Approve
                        </button>
                      </form>
                      <form action={denyMember}>
                        <input type="hidden" name="eventId" value={e.id} />
                        <input type="hidden" name="userId" value={p.id} />
                        <button aria-label="Decline" className="press rounded-full border border-rule bg-white px-2 py-1.5 text-faint hover:text-brand-deep">
                          <X size={14} />
                        </button>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Live queue + admins are compact panels — pair them side by side on wider screens */}
          <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
            <EventQueueAdmin eventId={e.id} queueEnabled={e.queue_enabled} session={session} />
            <EventAdmins eventId={e.id} isOwner={isOwner} meId={user.id} initialAdmins={initialAdmins} />
          </div>
        </section>
      ) : null}

      {/* attendees + roles */}
      {count > 0 ? (
        <section className="mt-7">
          <h2 className="kicker mb-3 text-faint">Who&apos;s going ({count})</h2>
          <div className="flex flex-wrap gap-2">
            {goingIds.slice(0, 60).map((uid) => {
              const p = profById.get(uid);
              const owner = uid === e.created_by;
              const admin = adminIds.has(uid);
              const tone = owner
                ? "border-brand/40 bg-tint-brand hover:border-brand/60"
                : admin
                  ? "border-[#0e7490]/30 bg-[#ecfeff] hover:border-[#0e7490]/50"
                  : "border-rule bg-surface hover:border-ink/25";
              return (
                <Link
                  key={uid}
                  href={`/profile/${uid}`}
                  className={`press inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3.5 transition-colors ${tone}`}
                >
                  <Avatar url={avatarUrl(p)} hue={p?.avatar_hue ?? 200} name={p?.display_name ?? "Player"} size={28} />
                  <span className="max-w-[10rem] truncate text-sm font-medium text-ink">{p?.display_name ?? "Player"}</span>
                  {owner ? (
                    <Crown size={12} className="shrink-0 text-brand-deep" aria-label="Organizer" />
                  ) : admin ? (
                    <Shield size={12} className="shrink-0 text-[#0e7490]" aria-label="Admin" />
                  ) : null}
                </Link>
              );
            })}
            {count > 60 ? (
              <span className="inline-flex items-center rounded-full border border-dashed border-rule bg-bg/40 px-3.5 py-1.5 text-sm font-medium text-mute">
                +{count - 60} more
              </span>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* local sponsor placeholder */}
      <div className="mt-10 rounded-3xl border border-dashed border-rule bg-surface/50 px-5 py-7 text-center">
        <p className="kicker text-faint">Local sponsor · reserved</p>
        <p className="mt-1 text-xs text-mute">A local sponsor card lands here at launch.</p>
      </div>
    </div>
  );
}
