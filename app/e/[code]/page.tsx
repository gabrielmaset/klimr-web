import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Users, Trophy, Check, Dices, Megaphone, Pin, RotateCcw, Hourglass, MapPin, CloudSun, Sun, Cloud, CloudRain, CloudSnow, CloudLightning, Droplets, Wind, Clock, Crown, Ticket, ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { isRegistrationOpen, type TournamentFormatConfig,
  normalizeGallery, type PublishedScheduleRow, type PublishedPool, type PublishedBracketRound, type Sponsor, type Prize, type Announcement } from "@/lib/tournament";
import { PaymentProofUpload } from "@/components/payment-proof-upload";
import { EventLocationMap } from "@/components/event-location-map";
import { reopenTournament } from "@/app/tournaments/actions";
import { withinRecoverWindow, recoverDaysLeft } from "@/lib/recover";
import { JoinWaitlistDialog } from "@/components/join-waitlist-dialog";
import { getEventForecast } from "@/lib/weather";
import { TournamentHeroCarousel } from "@/components/tournament-hero-carousel";

// Always render the public page fresh — see app/e/[code]/layout.tsx. Repeated
// here so the page's live-feed behavior is explicit and regression-proof.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

const REG_STATUS_LABEL: Record<string, string> = { pending: "Pending", confirmed: "Confirmed", waitlisted: "Waitlisted" };
const PAY_STATUS_LABEL: Record<string, string> = { unpaid: "Not submitted", proof_submitted: "Under review", confirmed: "Confirmed", denied: "Needs attention" };
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const MEDALS: Record<string, { from: string; to: string; text: string }> = {
  gold: { from: "#fde68a", to: "#f59e0b", text: "#7c4a03" },
  silver: { from: "#eef2f6", to: "#b8c0cc", text: "#3f4753" },
  bronze: { from: "#fcd9b6", to: "#c2773f", text: "#6b3410" },
  brand: { from: "#ffd0bf", to: "#e4713a", text: "#8e4720" },
};
function medalKey(place?: string | null): keyof typeof MEDALS {
  const p = (place ?? "").toLowerCase();
  if (/(^|\b)(1|1st|first|champion|gold|winner)\b/.test(p) || p.includes("🥇")) return "gold";
  if (/(^|\b)(2|2nd|second|runner|finalist|silver)\b/.test(p) || p.includes("🥈")) return "silver";
  if (/(^|\b)(3|3rd|third|bronze)\b/.test(p) || p.includes("🥉")) return "bronze";
  return "brand";
}

const WEATHER_ICON: Record<string, LucideIcon> = {
  clear: Sun, partly: CloudSun, cloudy: Cloud, fog: Cloud, drizzle: CloudRain, rain: CloudRain, snow: CloudSnow, thunder: CloudLightning,
};

function Panel({ id, className = "", children }: { id?: string; className?: string; children: React.ReactNode }) {
  return <section id={id} className={"scroll-mt-28 rounded-[22px] border border-[#E7E7E1] bg-white p-5 sm:p-6 " + className}>{children}</section>;
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="text-xl font-extrabold tracking-tight text-[#17190F]">{children}</h2>
      <span className="mt-2 block h-[3px] w-9 rounded-full bg-[#E4713A]" />
    </div>
  );
}

function PublicStandings({ pool }: { pool: PublishedPool }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E7E7E1]">
      <p className="truncate bg-[#17190F] px-4 py-2.5 text-sm font-bold tracking-wide text-white">{pool.name}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="tp-mono border-b border-[#E7E7E1] text-[10px] uppercase tracking-wide text-[#8A8D80]">
            <th className="px-3 py-1.5 text-center font-semibold">#</th>
            <th className="px-3 py-1.5 text-left font-semibold">Team</th>
            <th className="px-2 py-1.5 text-center font-semibold">W</th>
            <th className="px-2 py-1.5 text-center font-semibold">L</th>
            <th className="px-3 py-1.5 text-center font-semibold">+/−</th>
          </tr>
        </thead>
        <tbody>
          {pool.rows.map((r, i) => (
            <tr key={i} className="border-b border-[#EDEDE6] last:border-0">
              <td className="px-3 py-1.5 text-center"><span className="inline-grid h-5 w-5 place-items-center rounded-full bg-[#F7ECE4] text-[10px] font-bold text-[#8E4720]">{r.rank}</span></td>
              <td className="px-3 py-1.5 text-[#17190F]">{r.team}</td>
              <td className="px-2 py-1.5 text-center tabular-nums text-[#3F423A]">{r.w}</td>
              <td className="px-2 py-1.5 text-center tabular-nums text-[#3F423A]">{r.l}</td>
              <td className="px-3 py-1.5 text-center tabular-nums text-[#6B6E60]">{r.diff > 0 ? "+" + r.diff : r.diff}</td>
            </tr>
          ))}
          {pool.rows.length === 0 ? (<tr><td colSpan={5} className="px-3 py-3 text-center text-xs text-[#8A8D80]">No teams yet</td></tr>) : null}
        </tbody>
      </table>
    </div>
  );
}

function PublicBracket({ rounds }: { rounds: PublishedBracketRound[] }) {
  return (
    <div>
      <p className="tp-mono mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#6B6E60]"><Trophy size={13} /> Knockout</p>
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-4">
          {rounds.map((rd, r) => (
            <div key={r} className="w-56 shrink-0">
              <p className="tp-mono mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#6B6E60]">{rd.label}</p>
              <div className="grid gap-2">
                {rd.matches.map((m, i) => {
                  const aWin = m.done && m.sa != null && m.sb != null && m.sa > m.sb;
                  const bWin = m.done && m.sa != null && m.sb != null && m.sb > m.sa;
                  return (
                    <div key={i} className="rounded-xl border border-[#E7E7E1] bg-white px-3 py-2 text-sm">
                      <div className={"flex items-center justify-between gap-2 " + (aWin ? "font-bold text-[#17190F]" : "text-[#3F423A]")}><span className="min-w-0 truncate">{m.a}</span><span className="tp-mono shrink-0 text-xs tabular-nums">{m.sa ?? ""}</span></div>
                      <div className={"mt-1 flex items-center justify-between gap-2 border-t border-[#EDEDE6] pt-1 " + (bWin ? "font-bold text-[#17190F]" : "text-[#3F423A]")}><span className="min-w-0 truncate">{m.b}</span><span className="tp-mono shrink-0 text-xs tabular-nums">{m.sb ?? ""}</span></div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function PublicTournament({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS: a draft/cancelled event only resolves for its owner/managers; a
  // published event resolves for anyone (including anon). So a null row here
  // means "no such (visible) event" → 404. The page needs no account to view.
  const { data: t } = await supabase
    .from("tournaments")
    .select("id, code, title, sport_key, status, owner_id, cancelled_at, entry_type, summary, description, starts_at, location_name, location_address, location_url, location_zip, location_lat, location_lng, timezone, weather_enabled, capacity, registration_opens_at, registration_deadline, format_config")
    .eq("code", code)
    .maybeSingle();
  if (!t) notFound();

  const fc = (t.format_config ?? {}) as TournamentFormatConfig;
  const galleryItems = normalizeGallery(fc.gallery);
  const pubSchedule = fc.schedule_published && fc.published_schedule?.rows?.length ? fc.published_schedule : null;
  const pubResults = fc.results_published && fc.published_results?.divisions?.length ? fc.published_results : null;
  const sponsors: Sponsor[] = Array.isArray(fc.sponsors) ? fc.sponsors : [];
  const prizes: Prize[] = Array.isArray(fc.prizes) ? fc.prizes : [];
  const premiumSponsors = sponsors.filter((s) => s.tier === "premium");
  const rulesText = fc.legal?.rules_text?.trim() || null;
  const announcements = (Array.isArray(fc.announcements) ? (fc.announcements as Announcement[]) : [])
    .slice()
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((a) => ({ ...a, dateText: new Date(a.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) }));
  const resultsUpdated = pubResults ? new Date(pubResults.builtAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;
  const courtNumOf = (c: string) => {
    const m = /Court (\d+)/.exec(c);
    return m ? Number(m[1]) : 999;
  };
  const schedByCourt: [string, PublishedScheduleRow[]][] = [];
  if (pubSchedule) {
    const map = new Map<string, PublishedScheduleRow[]>();
    for (const r of pubSchedule.rows) {
      const arr = map.get(r.court) ?? [];
      arr.push(r);
      map.set(r.court, arr);
    }
    schedByCourt.push(...[...map.entries()].sort((a, b) => courtNumOf(a[0]) - courtNumOf(b[0])));
  }

  const meta = sportMeta(t.sport_key);
  const dateText = t.starts_at
    ? new Date(t.starts_at).toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric", year: "numeric" })
    : null;
  // eslint-disable-next-line react-hooks/purity -- server component; current-time comparison is intentional
  const daysToGo = t.starts_at ? Math.ceil((new Date(t.starts_at).getTime() - Date.now()) / 86_400_000) : null;
  const startTimeSub = t.starts_at
    ? `First serve ${new Date(t.starts_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
    : "Schedule TBA";
  const forecast = t.weather_enabled
    ? await getEventForecast({ lat: t.location_lat, lng: t.location_lng, startsAt: t.starts_at, timezone: t.timezone })
    : null;
  // Status row is up to three columns: registration · venue map · weather. The map
  // shows when we have a location; registration widens to fill any empty columns.
  const hasMap = !!(t.location_url || t.location_address || t.location_name || (t.location_lat != null && t.location_lng != null));
  // Weather applies to a future, geolocated event with weather turned on. If we
  // have no forecast yet (still beyond the ~16-day horizon), keep the slot with a
  // "coming soon" placeholder rather than dropping it.
  // eslint-disable-next-line react-hooks/purity -- server component; comparing against the current time is intentional
  const weatherPending = !!t.weather_enabled && t.location_lat != null && t.location_lng != null && !forecast && !!t.starts_at && new Date(t.starts_at).getTime() >= Date.now() - 86_400_000;
  // Capacity shown WITH its unit so it can't be misread against per-player fees.
  const capUnit = fc.capacity_unit === "person" ? "players" : t.entry_type === "team" ? "teams" : "players";
  const capacityText =
    fc.capacity_mode === "per_division" ? "By division" : t.capacity ? `${t.capacity} ${capUnit}` : "Open";
  // eslint-disable-next-line react-hooks/purity -- server component; comparing against the current time is intentional
  const deadlinePassed = !!t.registration_deadline && new Date(t.registration_deadline).getTime() < Date.now();
  const canSignUp = isRegistrationOpen(t);
  // eslint-disable-next-line react-hooks/purity -- server component; current-time comparison is intentional
  const msToDeadline = t.registration_deadline ? new Date(t.registration_deadline).getTime() - Date.now() : null;
  const closingSoon = canSignUp && msToDeadline != null && msToDeadline > 0 && msToDeadline <= 86_400_000;
  const hoursToClose = msToDeadline != null && msToDeadline > 0 ? Math.max(1, Math.ceil(msToDeadline / 3_600_000)) : null;
  const regClosed = !canSignUp && (deadlinePassed || t.status === "registration_closed");

  // Capacity fill (only meaningful while sign-ups are open). Pooled mode uses the
  // shared total; per-division mode uses the combined cap (sum of every division's
  // cap). Confirmed + pending hold a spot, waitlisted don't — same as the dashboard.
  let capPct: number | null = null;
  if (canSignUp) {
    let effectiveCap: number | null = t.capacity ?? null;
    if (fc.capacity_mode === "per_division") {
      const { data: divCaps } = await supabase.from("tournament_divisions").select("capacity").eq("tournament_id", t.id);
      const sum = (divCaps ?? []).reduce((acc, d) => acc + (d.capacity ?? 0), 0);
      effectiveCap = sum > 0 ? sum : null;
    }
    if (effectiveCap && effectiveCap > 0) {
      const [{ count: activeReg }, { count: waitReg }] = await Promise.all([
        supabase.from("tournament_registrations").select("id", { count: "exact", head: true }).eq("tournament_id", t.id).not("status", "in", "(withdrawn,declined)"),
        supabase.from("tournament_registrations").select("id", { count: "exact", head: true }).eq("tournament_id", t.id).eq("status", "waitlisted"),
      ]);
      const spotsTaken = (activeReg ?? 0) - (waitReg ?? 0);
      capPct = Math.min(100, Math.round((spotsTaken / effectiveCap) * 100));
    }
  }
  const almostFull = capPct != null && capPct >= 90 && capPct < 100;
  const soldOut = capPct != null && capPct >= 100;

  // Status-card tone: green = open · yellow = almost full / closing within 24h ·
  // red = sold out or closed · neutral = not yet open.
  const regTone: "open" | "warn" | "soldout" | "closed" | "soon" = canSignUp
    ? soldOut
      ? "soldout"
      : almostFull || closingSoon
        ? "warn"
        : "open"
    : regClosed
      ? "closed"
      : "soon";
  const regTitle = soldOut
    ? "Event is sold out"
    : almostFull
      ? "Almost sold out"
      : closingSoon && canSignUp
        ? "Registration closes soon"
        : canSignUp
          ? "Registration is open"
          : regClosed
            ? "Registration has closed"
            : "Registration isn't open yet";
  const regSub = soldOut
    ? "All spots are taken — join the waitlist."
    : almostFull
      ? "Few spots left — sign up now."
      : closingSoon && canSignUp
        ? `Closing in ${hoursToClose === 1 ? "under an hour" : `~${hoursToClose} hours`} — sign up now.`
        : canSignUp
          ? "Secure your spot now."
          : regClosed
            ? "Sign-ups for this event are closed."
            : "Follow this event to hear when sign-ups open.";
  // Action color tracks the status notice: green while open, amber when
  // closing/almost full, red-clay for the sold-out waitlist path.
  const toneSolid = regTone === "open" ? "#2E9E44" : regTone === "warn" ? "#D98E1F" : "#C75039";
  const toneShadow = regTone === "open" ? "rgba(46,158,68,.4)" : regTone === "warn" ? "rgba(217,142,31,.4)" : "rgba(199,80,57,.4)";

  const fmtRegDate = (s: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null);
  const opensText = fmtRegDate(t.registration_opens_at);
  const closesText = fmtRegDate(t.registration_deadline);
  // Signing up requires a Klimr account; logged-out visitors are routed to Join first.
  const signupHref = user ? `/e/${t.code}/signup` : `/signup?next=${encodeURIComponent(`/e/${t.code}/signup`)}`;

  // The viewer's entry, found via their player row so teammates see it too — not
  // just the registrant. Only relevant when signed in.
  let myEntry: { regId: string; status: string; paymentStatus: string; isTeam: boolean; iConfirmed: boolean; iAmReserve: boolean; iAmRegistrant: boolean } | null = null;
  let expectedCents = 0;
  let payDeny: string | null = null;
  let teamName: string | null = null;
  let roster: { userId: string; name: string; isReserve: boolean; confirmed: boolean }[] = [];
  if (user) {
    const { data: myPlayerRows } = await supabase
      .from("tournament_registration_players")
      .select("registration_id, confirmed_at, is_reserve")
      .eq("tournament_id", t.id)
      .eq("user_id", user.id);
    if (myPlayerRows && myPlayerRows.length) {
    const regIds = myPlayerRows.map((r) => r.registration_id);
    const { data: regs } = await supabase
      .from("tournament_registrations")
      .select("id, status, payment_status, team_id, registrant_id, division_id")
      .in("id", regIds)
      .not("status", "in", "(withdrawn,declined)");
    if (regs && regs.length) {
      const reg = regs[0];
      const mine = myPlayerRows.find((p) => p.registration_id === reg.id);
      myEntry = {
        regId: reg.id,
        status: reg.status,
        paymentStatus: reg.payment_status,
        isTeam: !!reg.team_id,
        iConfirmed: !!mine?.confirmed_at,
        iAmReserve: !!mine?.is_reserve,
        iAmRegistrant: reg.registrant_id === user.id,
      };
      if (reg.team_id) {
        const { data: tm } = await supabase.from("teams").select("name").eq("id", reg.team_id).maybeSingle();
        teamName = tm?.name ?? null;
        if (myEntry.iAmRegistrant) {
          const { data: players } = await supabase.from("tournament_registration_players").select("user_id, is_reserve, confirmed_at").eq("registration_id", reg.id);
          const ids = (players ?? []).map((p) => p.user_id);
          const nameById = new Map<string, string>();
          if (ids.length) {
            const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids);
            for (const p of profs ?? []) nameById.set(p.id, p.display_name ?? "Player");
          }
          roster = (players ?? []).map((p) => ({ userId: p.user_id, name: nameById.get(p.user_id) ?? "Player", isReserve: p.is_reserve, confirmed: !!p.confirmed_at }));
          roster.sort((a, b) => Number(a.isReserve) - Number(b.isReserve) || a.name.localeCompare(b.name));
        }
      }
      if (myEntry.iAmRegistrant) {
        if (reg.division_id) {
          const { data: div } = await supabase.from("tournament_divisions").select("fee_cents, fee_basis").eq("id", reg.division_id).maybeSingle();
          if (div) {
            if (div.fee_basis === "per_team") expectedCents = div.fee_cents ?? 0;
            else expectedCents = (div.fee_cents ?? 0) * (reg.team_id ? roster.filter((r) => !r.isReserve).length : 1);
          }
        }
        if (myEntry.paymentStatus === "denied") {
          const { data: pay } = await supabase.from("tournament_payments").select("deny_reason").eq("registration_id", reg.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
          payDeny = pay?.deny_reason ?? null;
        }
      }
    }
    }
  }
  const rosterAllConfirmed = roster.length > 0 && roster.every((r) => r.confirmed);

  const { data: divs } = await supabase
    .from("tournament_divisions")
    .select("id, name, description, fee_cents, fee_basis")
    .eq("tournament_id", t.id)
    .order("sort_order");

  // Prizes grouped for the public page: overall (no division / stale division) first,
  // then each division that has prizes, in the divisions' own order.
  const divNameById = new Map((divs ?? []).map((d) => [d.id, d.name]));
  const prizeGroups: { key: string; label: string; items: Prize[] }[] = [];
  if (prizes.length) {
    const overall = prizes.filter((p) => !p.divisionId || !divNameById.has(p.divisionId));
    if (overall.length) prizeGroups.push({ key: "overall", label: divs && divs.length ? "All divisions" : "Prizes", items: overall });
    for (const d of divs ?? []) {
      const items = prizes.filter((p) => p.divisionId === d.id);
      if (items.length) prizeGroups.push({ key: d.id, label: d.name, items });
    }
  }

  const { data: drawsData } = await supabase.from("tournament_draws").select("division_id, draw_number, drawn_at").eq("tournament_id", t.id).order("draw_number");
  const drawsByDiv = new Map<string, { number: number; at: string }[]>();
  for (const dr of drawsData ?? []) {
    const arr = drawsByDiv.get(dr.division_id) ?? [];
    arr.push({ number: dr.draw_number, at: new Date(dr.drawn_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) });
    drawsByDiv.set(dr.division_id, arr);
  }
  const drawnDivisions = (divs ?? [])
    .filter((d) => drawsByDiv.has(d.id))
    .map((d) => {
      const ds = drawsByDiv.get(d.id) as { number: number; at: string }[];
      const last = ds[ds.length - 1];
      return { id: d.id, name: d.name, firstAt: ds[0].at, lastAt: last.at, lastNumber: last.number, redrawn: ds.length > 1 };
    });


  return (
    <div className="tp min-h-dvh bg-[#F6F6F2] text-[#17190F]">
      {/* HERO */}
      <section className="relative isolate overflow-hidden">
        {galleryItems.length ? (
          <TournamentHeroCarousel items={galleryItems} />
        ) : (
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#26320f,#14170E)" }} />
        )}
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,rgba(20,23,14,.35) 0%,rgba(20,23,14,.88) 100%)" }} />
        <div className="relative mx-auto max-w-[1200px] px-5 pb-14 pt-16 sm:px-8 sm:pb-16 sm:pt-24">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm"><span aria-hidden>{meta.emoji}</span> {meta.name}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm"><Users size={13} /> {t.entry_type === "team" ? "Team event" : "Individual event"}</span>
            {canSignUp ? (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: toneSolid, boxShadow: `0 2px 10px ${toneShadow}` }}>
                <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" /></span> Registration open
              </span>
            ) : null}
          </div>
          <h1 className="mt-4 max-w-3xl text-4xl font-extrabold leading-[0.98] tracking-tight text-white sm:text-6xl" style={{ textShadow: "0 2px 24px rgba(0,0,0,.35)" }}>{t.title}</h1>
          {t.summary ? <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/85 sm:text-lg">{t.summary}</p> : null}
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {([
              dateText ? { Icon: CalendarClock, main: dateText, sub: startTimeSub } : null,
              t.location_name ? { Icon: MapPin, main: t.location_name, sub: [t.location_address, t.location_zip].filter(Boolean).join(" · ") || "Venue" } : null,
              daysToGo != null && daysToGo > 0 ? { Icon: Hourglass, main: daysToGo + " day" + (daysToGo === 1 ? "" : "s"), sub: "until first serve" } : daysToGo === 0 ? { Icon: Hourglass, main: "Today", sub: "first serve" } : null,
            ].filter(Boolean) as { Icon: LucideIcon; main: string; sub: string }[]).map((c, i) => {
              const Ic = c.Icon;
              return (<div key={i} className="flex items-start gap-3 rounded-2xl border border-white/15 bg-white/10 p-3.5 backdrop-blur-sm"><Ic size={18} className="mt-0.5 shrink-0 text-white/80" /><div className="min-w-0"><p className="truncate text-sm font-bold text-white">{c.main}</p>{c.sub ? <p className="truncate text-xs text-white/70">{c.sub}</p> : null}</div></div>);
            })}
          </div>
        </div>
      </section>

      {/* SECTION NAV */}
      <nav className="sticky top-0 z-20 border-b border-[#E7E7E1] bg-[#F6F6F2]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1200px] gap-5 overflow-x-auto px-5 py-3 text-sm font-semibold text-[#6B6E60] sm:px-8">
          {announcements.length ? <a href="#announcements" className="whitespace-nowrap transition-colors hover:text-[#17190F]">Announcements</a> : null}
          {t.description ? <a href="#about" className="whitespace-nowrap transition-colors hover:text-[#17190F]">About</a> : null}
          {divs && divs.length ? <a href="#divisions" className="whitespace-nowrap transition-colors hover:text-[#17190F]">Divisions &amp; fees</a> : null}
          {prizeGroups.length ? <a href="#prizes" className="whitespace-nowrap transition-colors hover:text-[#17190F]">Prizes</a> : null}
          {rulesText ? <a href="#rules" className="whitespace-nowrap transition-colors hover:text-[#17190F]">Rules</a> : null}
          {sponsors.length ? <a href="#sponsors" className="whitespace-nowrap transition-colors hover:text-[#17190F]">Sponsors</a> : null}
        </div>
      </nav>

      {/* BODY */}
      <div className="mx-auto grid max-w-[1200px] gap-6 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <main className="min-w-0 space-y-5">
          {t.cancelled_at ? (
            <div className="rounded-[22px] border border-[#f0c2b0] bg-[#fbeee7] p-5">
              <p className="text-sm font-bold text-[#b91c1c]">This tournament has been cancelled.</p>
              <p className="mt-0.5 text-xs text-[#6B6E60]">Sign-ups are closed. If you registered, reach out to the organizer about any refunds.</p>
              {user && t.owner_id === user.id ? (withinRecoverWindow(t.cancelled_at) ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <form action={reopenTournament}><input type="hidden" name="tournamentId" value={t.id} /><button className="inline-flex items-center gap-1.5 rounded-full bg-[#E4713A] px-4 py-2 text-sm font-semibold text-white hover:brightness-95"><RotateCcw size={14} /> Recover tournament</button></form>
                  <span className="text-xs text-[#8A8D80]">Recoverable for {recoverDaysLeft(t.cancelled_at)} more day{recoverDaysLeft(t.cancelled_at) === 1 ? "" : "s"}.</span>
                </div>
              ) : (<p className="mt-2 text-xs text-[#8A8D80]">The 90-day recovery window has passed — archived.</p>)) : null}
            </div>
          ) : null}

          {myEntry ? (
            <Panel>
              {myEntry.status === "waitlisted" ? (
                <div><p className="flex items-center gap-2 text-sm font-bold text-[#17190F]"><CalendarClock size={15} className="text-[#E4713A]" /> You&rsquo;re on the waitlist</p><p className="mt-0.5 text-xs text-[#6B6E60]">Your entry is complete. If a spot opens and the organizer accepts it, you&rsquo;ll just need to submit payment.</p></div>
              ) : myEntry.isTeam ? (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><p className="flex items-center gap-2 text-sm font-bold text-[#17190F]"><Check size={15} className="text-[#3F6314]" /> {teamName ?? "Your team"} is entered</p><p className="mt-0.5 text-xs text-[#6B6E60]">Entry: {REG_STATUS_LABEL[myEntry.status] ?? myEntry.status} · Payment: {PAY_STATUS_LABEL[myEntry.paymentStatus] ?? myEntry.paymentStatus}{myEntry.iAmReserve ? " · You're a reserve" : ""}</p></div>
                    {myEntry.iAmRegistrant ? <span className={"rounded-full px-2.5 py-1 text-[11px] font-semibold " + (rosterAllConfirmed ? "bg-[#EEF4E2] text-[#3F6314]" : "bg-[#F1F1EB] text-[#6B6E60]")}>{rosterAllConfirmed ? "All confirmed" : "Awaiting confirmations"}</span> : null}
                  </div>
                  {myEntry.iAmRegistrant && roster.length ? (<ul className="mt-4 grid gap-2">{roster.map((r) => (<li key={r.userId} className="flex items-center justify-between gap-3 rounded-xl border border-[#E7E7E1] bg-[#FCFCFA] px-3.5 py-2.5"><span className="flex items-center gap-2 text-sm font-medium text-[#17190F]">{r.name}{r.isReserve ? <span className="rounded-full bg-[#F1F1EB] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#6B6E60]">Reserve</span> : null}</span>{r.confirmed ? <span className="flex items-center gap-1 text-xs font-semibold text-[#3F6314]"><Check size={13} /> Confirmed</span> : <span className="text-xs font-medium text-[#8A8D80]">Awaiting</span>}</li>))}</ul>) : null}
                  <div className="mt-4">{myEntry.iConfirmed ? (<p className="flex items-center gap-1.5 text-sm font-medium text-[#3F6314]"><Check size={15} /> You&rsquo;ve confirmed your spot.</p>) : (<Link href={"/e/" + t.code + "/confirm"} className="inline-flex items-center gap-1.5 rounded-xl bg-[#E4713A] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-95">Confirm your spot</Link>)}</div>
                </div>
              ) : (
                <div><p className="flex items-center gap-2 text-sm font-bold text-[#17190F]"><Check size={15} className="text-[#3F6314]" /> You&rsquo;re registered</p><p className="mt-0.5 text-xs text-[#6B6E60]">Status: {REG_STATUS_LABEL[myEntry.status] ?? myEntry.status} · Payment: {PAY_STATUS_LABEL[myEntry.paymentStatus] ?? myEntry.paymentStatus}</p></div>
              )}
            </Panel>
          ) : null}

          {myEntry && myEntry.iAmRegistrant && myEntry.status !== "waitlisted" ? (
            <Panel>
              <p className="tp-mono mb-2 text-[11px] font-bold uppercase tracking-wider text-[#8A8D80]">Payment</p>
              {myEntry.paymentStatus === "confirmed" ? (<p className="flex items-center gap-1.5 text-sm font-medium text-[#3F6314]"><Check size={15} /> Payment confirmed{expectedCents ? " · " + money(expectedCents) : ""}</p>) : myEntry.paymentStatus === "proof_submitted" ? (<p className="text-sm text-[#3F423A]">Proof received — your organizer is reviewing it.{expectedCents ? " Amount: " + money(expectedCents) + "." : ""}</p>) : (<div>{expectedCents ? <p className="mb-2 text-sm text-[#3F423A]">Amount due: <span className="font-semibold text-[#17190F]">{money(expectedCents)}</span></p> : null}{myEntry.paymentStatus === "denied" && payDeny ? <p className="mb-2 rounded-lg bg-[#F7ECE4] px-3 py-2 text-xs font-medium text-[#8E4720]">Your last proof was declined: {payDeny}</p> : null}<PaymentProofUpload registrationId={myEntry.regId} /></div>)}
            </Panel>
          ) : null}

          {announcements.length ? (
            <Panel id="announcements">
              <div className="mb-4 flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#F7ECE4] text-[#E4713A]"><Megaphone size={17} /></span>
                <div className="min-w-0 flex-1"><p className="text-base font-extrabold text-[#17190F]">Announcements</p><p className="text-xs text-[#8A8D80]">Latest updates from the organizers</p></div>
                <span className="tp-mono shrink-0 rounded-full bg-[#F1F1EB] px-2.5 py-1 text-[11px] font-bold text-[#6B6E60]">{announcements.length} update{announcements.length === 1 ? "" : "s"}</span>
              </div>
              <ul className="grid gap-2.5">
                {announcements.map((a) => (
                  <li key={a.id} className={"rounded-2xl border p-4 " + (a.pinned ? "border-[#f0c9a8] bg-[#FDF3EA]" : "border-[#EDEDE6] bg-[#FCFCFA]")}>
                    <div className="flex items-center gap-2">
                      {a.title ? <p className="text-sm font-bold text-[#17190F]">{a.title}</p> : null}
                      {a.pinned ? <span className="inline-flex items-center gap-1 rounded-full bg-[#E4713A] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"><Pin size={9} className="fill-current" /> Pinned</span> : null}
                      <span className="tp-mono ml-auto shrink-0 text-[11px] text-[#8A8D80]">{a.dateText}</span>
                    </div>
                    {a.body ? <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-[#3F423A]">{a.body}</p> : null}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {t.description ? (
            <Panel id="about">
              <Heading>About the event</Heading>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#3F423A]">{t.description}</p>
            </Panel>
          ) : null}

          {divs && divs.length ? (
            <Panel id="divisions">
              <Heading>Divisions &amp; fees</Heading>
              <div className="grid gap-3 sm:grid-cols-2">
                {divs.map((d) => {
                  const lower = d.name.toLowerCase();
                  const tone = lower.includes("comp") || lower.includes("pro") || lower.includes("adv") || lower.includes("open") ? { tint: "#F7ECE4", text: "#8E4720" } : lower.includes("fun") || lower.includes("rec") || lower.includes("social") || lower.includes("begin") ? { tint: "#EEF4E2", text: "#3F6314" } : { tint: "#F7F0D9", text: "#8E4720" };
                  const tag = (d.name.split(/\s+/)[0] || "Division").toUpperCase();
                  const dollars = d.fee_cents ? "$" + Math.round(d.fee_cents / 100) : "Free";
                  const unit = d.fee_basis === "per_team" ? "/ team" : "/ player";
                  return (
                    <div key={d.id} className="flex flex-col rounded-2xl border border-[#E7E7E1] bg-[#FCFCFA] p-4">
                      <span className="tp-mono w-fit rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider" style={{ background: tone.tint, color: tone.text }}>{tag}</span>
                      <p className="mt-2.5 text-base font-bold text-[#17190F]">{d.name}</p>
                      <p className="mt-1"><span className="text-2xl font-extrabold text-[#E4713A]">{dollars}</span>{d.fee_cents ? <span className="text-sm text-[#6B6E60]"> {unit}</span> : null}</p>
                      {d.description ? <p className="mt-1.5 text-xs leading-relaxed text-[#6B6E60]">{d.description}</p> : null}
                    </div>
                  );
                })}
              </div>
            </Panel>
          ) : null}

          {prizeGroups.length ? (
            <Panel id="prizes">
              <Heading>Prizes</Heading>
              <div className="grid gap-4 sm:grid-cols-2">
                {prizeGroups.map((g) => (
                  <div key={g.key} className="rounded-2xl border border-[#EDEDE6] bg-[#FCFCFA] p-4">
                    <p className="tp-mono mb-3 text-[11px] font-bold uppercase tracking-wider text-[#8E4720]">{g.label}</p>
                    <ul className="space-y-2">
                      {g.items.map((pz) => {
                        const m = MEDALS[medalKey(pz.place)];
                        const num = (pz.place ?? "").match(/\d+/)?.[0] ?? null;
                        return (
                          <li key={pz.id} className="flex items-center gap-3 rounded-xl border border-[#E7E7E1] bg-white px-3 py-2.5">
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold" style={{ background: "linear-gradient(145deg," + m.from + "," + m.to + ")", color: m.text }}>{num ?? <Trophy size={13} />}</span>
                            <span className="min-w-0 flex-1">{pz.place ? <span className="tp-mono block text-[10px] font-bold uppercase tracking-wider text-[#8A8D80]">{pz.place}</span> : null}<span className="text-sm font-bold text-[#17190F]">{pz.title}</span></span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}

          {rulesText ? (
            <Panel id="rules">
              <Heading>Rules &amp; format</Heading>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#3F423A]">{rulesText}</p>
            </Panel>
          ) : null}

          {drawnDivisions.length ? (
            <Panel>
              <div className="mb-1 flex items-center gap-1.5"><Dices size={16} className="text-[#E4713A]" /><h2 className="text-base font-extrabold text-[#17190F]">The draw</h2></div>
              <p className="mb-3 text-xs text-[#8A8D80]">Pools are drawn completely at random — every draw is logged here for transparency.</p>
              <ul className="grid gap-2">{drawnDivisions.map((d) => (<li key={d.id} className="rounded-xl border border-[#E7E7E1] bg-[#FCFCFA] px-3.5 py-2.5 text-sm"><span className="font-semibold text-[#17190F]">{d.name}</span><span className="text-[#8A8D80]"> — drawn {d.firstAt}</span>{d.redrawn ? <span className="font-medium text-[#8E4720]"> · redrawn {d.lastAt} (draw #{d.lastNumber})</span> : null}</li>))}</ul>
            </Panel>
          ) : null}

          {pubSchedule ? (
            <Panel>
              <div className="mb-1 flex items-center gap-2"><CalendarClock size={18} className="text-[#E4713A]" /><h2 className="text-base font-extrabold text-[#17190F]">Match schedule</h2></div>
              <p className="mb-4 text-xs text-[#8A8D80]">{pubSchedule.mode === "ordered" ? "Play in the listed order on each court." : "Start times are approximate and may shift on the day."}</p>
              <div className="grid gap-4 sm:grid-cols-2">{schedByCourt.map(([court, rows]) => (<div key={court} className="overflow-hidden rounded-2xl border border-[#E7E7E1]"><p className="border-b border-[#E7E7E1] bg-[#F1F1EB] px-3 py-2 text-sm font-bold text-[#17190F]">{court}</p><ul className="divide-y divide-[#EDEDE6]">{rows.map((r, i) => (<li key={i} className="flex items-start gap-3 px-3 py-2.5 text-sm"><span className="tp-mono w-16 shrink-0 text-xs font-semibold tabular-nums text-[#8A8D80]">{r.time ?? "#" + (i + 1)}</span><span className="min-w-0 flex-1"><span className="text-[#17190F]">{r.a} <span className="text-[#8A8D80]">vs</span> {r.b}</span><span className="mt-0.5 block text-xs text-[#8A8D80]">{r.division}{r.pool ? " · " + r.pool : ""}</span></span></li>))}</ul></div>))}</div>
            </Panel>
          ) : null}

          {pubResults ? (
            <Panel>
              <div className="mb-1 flex items-center gap-2"><Trophy size={18} className="text-[#E4713A]" /><h2 className="text-base font-extrabold text-[#17190F]">Results &amp; standings</h2></div>
              <p className="mb-4 text-xs text-[#8A8D80]">{resultsUpdated ? "Updated " + resultsUpdated + "." : "Live from the organizer."}</p>
              <div className="grid gap-6">{pubResults.divisions.map((d, di) => (<div key={di}>{pubResults.divisions.length > 1 ? <h3 className="tp-mono mb-3 border-b border-[#E7E7E1] pb-2 text-sm font-bold uppercase tracking-wide text-[#17190F]">{d.name}</h3> : null}{d.pools.length ? <div className="grid gap-3 sm:grid-cols-2">{d.pools.map((pl, pi) => <PublicStandings key={pi} pool={pl} />)}</div> : null}{d.rounds.length ? <div className={d.pools.length ? "mt-4" : ""}><PublicBracket rounds={d.rounds} /></div> : null}</div>))}</div>
            </Panel>
          ) : null}

          {sponsors.length ? (
            <Panel id="sponsors">
              <Heading>Sponsors &amp; partners</Heading>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sponsors.map((s) => {
                  const inner = (
                    <div className="relative flex h-full flex-col rounded-2xl border border-[#E7E7E1] bg-white p-4">
                      {s.tier === "premium" ? <span className="tp-mono absolute right-3 top-3 rounded-full bg-[#F7F0D9] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#8E4720]">Premium</span> : null}
                      {s.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.logo} alt="" className="h-16 w-full rounded-lg border border-[#EDEDE6] bg-white object-contain p-2" />
                      ) : (<span className="grid h-16 w-full place-items-center rounded-lg text-2xl font-extrabold text-[#8A8D80]" style={{ background: "repeating-linear-gradient(45deg,#EAEAE2 0 10px,#F1F1EB 10px 20px)" }}>{s.name.slice(0, 1).toUpperCase()}</span>)}
                      <p className="tp-mono mt-3 text-[10px] font-bold uppercase tracking-wider text-[#8E4720]">{s.tier === "premium" ? "Title sponsor" : "Partner"}</p>
                      <p className="text-sm font-bold text-[#17190F]">{s.name}</p>
                    </div>
                  );
                  return s.url ? <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer" className="block">{inner}</a> : <div key={s.id}>{inner}</div>;
                })}
              </div>
            </Panel>
          ) : null}
        </main>

        {/* SIDEBAR */}
        <aside className="space-y-4 lg:sticky lg:top-16">
          <div className="rounded-[22px] p-5 text-white" style={{ background: "linear-gradient(160deg,#20240f,#14170E)" }}>
            {myEntry ? (
              <div>
                <p className="tp-mono text-[11px] font-bold uppercase tracking-wider text-[#E4713A]">Your entry</p>
                <p className="mt-1.5 text-lg font-extrabold">{myEntry.status === "waitlisted" ? "You're on the waitlist" : "You're registered"}</p>
                <p className="mt-1 text-sm text-white/60">Entry {REG_STATUS_LABEL[myEntry.status] ?? myEntry.status} · Payment {PAY_STATUS_LABEL[myEntry.paymentStatus] ?? myEntry.paymentStatus}</p>
              </div>
            ) : (
              <div>
                <p className="tp-mono flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: regTone === "open" ? "#8fd39c" : regTone === "warn" ? "#e9b949" : regTone === "soldout" || regTone === "closed" ? "#f0967f" : "#a2a597" }}>
                  {canSignUp ? <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" /></span> : null}
                  {regTitle}
                </p>
                <p className="mt-2 text-[22px] font-extrabold leading-tight">{soldOut ? "Join the waitlist" : "Secure your spot"}</p>
                {opensText || closesText ? <p className="mt-1 text-sm text-white/60">{opensText ? "Opens " + opensText : ""}{opensText && closesText ? " · " : ""}{closesText ? "Closes " + closesText : ""}</p> : <p className="mt-1 text-sm text-white/60">{regSub}</p>}
                {capPct != null ? (
                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs font-semibold"><span className="text-white/70">{capacityText}</span><span className="text-white/90">{capPct}% full</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full" style={{ width: capPct + "%", background: toneSolid }} /></div>
                  </div>
                ) : null}
                {soldOut ? (
                  <div className="mt-4"><JoinWaitlistDialog tournamentId={t.id} code={t.code} loggedIn={!!user} triggerClassName="press flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white hover:brightness-95" triggerStyle={{ background: toneSolid }} /></div>
                ) : canSignUp ? (
                  <Link href={signupHref} className="press mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white hover:brightness-95" style={{ background: toneSolid, boxShadow: `0 4px 14px ${toneShadow}` }}><Ticket size={16} /> {t.entry_type === "team" ? "Sign up your team" : "Sign up"}</Link>
                ) : (
                  <button type="button" disabled className="mt-4 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-white/10 py-3 text-sm font-bold text-white/70">{regClosed ? "Registration closed" : "Not open yet"}</button>
                )}
                <p className="mt-3 text-center text-xs text-white/45">secure checkout</p>
              </div>
            )}
          </div>

          <div className="rounded-[22px] border border-[#E7E7E1] bg-white p-4">
            <ul className="divide-y divide-[#EDEDE6]">
              {([
                { Icon: Trophy, label: "Sport", value: meta.name },
                { Icon: Users, label: "Entry", value: t.entry_type === "team" ? "Teams" : "Individuals" },
                { Icon: Users, label: "Capacity", value: capacityText },
                t.location_name ? { Icon: MapPin, label: "Location", value: t.location_name } : null,
              ].filter(Boolean) as { Icon: LucideIcon; label: string; value: string }[]).map((f, i) => {
                const Ic = f.Icon;
                return (<li key={i} className="flex items-center justify-between gap-3 py-2.5"><span className="flex items-center gap-2 text-sm text-[#6B6E60]"><Ic size={15} className="text-[#8A8D80]" /> {f.label}</span><span className="truncate text-sm font-bold text-[#17190F]">{f.value}</span></li>);
              })}
            </ul>
          </div>

          {forecast ? (() => {
            const WIcon = WEATHER_ICON[forecast.kind] ?? CloudSun;
            return (
              <div className="rounded-[22px] border border-[#E7E7E1] bg-white p-4">
                <p className="tp-mono text-[10px] font-bold uppercase tracking-wider text-[#8A8D80]">Forecast{dateText ? " · " + dateText : ""}</p>
                <div className="mt-2 flex items-center gap-3"><WIcon size={34} className="shrink-0 text-[#E4713A]" /><div><p className="text-2xl font-extrabold text-[#17190F]">{forecast.tempMaxF}° <span className="text-base font-semibold text-[#8A8D80]">/ {forecast.tempMinF}°</span></p><p className="text-sm text-[#6B6E60]">{forecast.label}</p></div></div>
                {forecast.precipProb != null || forecast.windMaxMph != null ? (<div className="mt-3 grid grid-cols-2 gap-2">{forecast.precipProb != null ? <div className="rounded-xl bg-[#F1F1EB] px-3 py-2"><p className="flex items-center gap-1 text-[11px] text-[#6B6E60]"><Droplets size={12} /> Precip</p><p className="text-sm font-bold text-[#17190F]">{forecast.precipProb}%</p></div> : null}{forecast.windMaxMph != null ? <div className="rounded-xl bg-[#F1F1EB] px-3 py-2"><p className="flex items-center gap-1 text-[11px] text-[#6B6E60]"><Wind size={12} /> Wind</p><p className="text-sm font-bold text-[#17190F]">{forecast.windMaxMph} mph</p></div> : null}</div>) : null}
              </div>
            );
          })() : weatherPending ? (
            <div className="rounded-[22px] border border-[#E7E7E1] bg-[#F1F1EB] p-4">
              <p className="tp-mono text-[10px] font-bold uppercase tracking-wider text-[#8A8D80]">Forecast{dateText ? " · " + dateText : ""}</p>
              <div className="mt-2 flex items-center gap-3"><CloudSun size={34} className="shrink-0 text-[#A2A597]" /><div><p className="text-base font-bold text-[#17190F]">Weather coming soon</p><p className="text-xs text-[#6B6E60]">Appears about two weeks out.</p></div></div>
              <span className="tp-mono mt-3 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-[#8A8D80]"><Clock size={11} /> Updates automatically</span>
            </div>
          ) : null}

          {hasMap ? <EventLocationMap name={t.location_name} address={t.location_address} zip={t.location_zip} lat={t.location_lat} lng={t.location_lng} href={t.location_url ?? undefined} className="rounded-[22px]" /> : null}

          {premiumSponsors.length ? (() => {
            const s = premiumSponsors[0];
            return (
              <div className="rounded-[22px] border border-[#f0d9a8] p-4" style={{ background: "linear-gradient(160deg,#FDF8EC,#FCFCFA)" }}>
                <p className="tp-mono flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8E4720]"><Crown size={12} className="text-[#C99A12]" /> Premium sponsor</p>
                <p className="mt-2 text-lg font-extrabold text-[#17190F]">{s.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-[#6B6E60]">Proudly powering this event — the courts, the prizes, and the giveaways.</p>
                {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="press mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#17190F] px-3.5 py-2 text-sm font-semibold text-white hover:brightness-110"><ArrowUpRight size={14} /> Visit {s.name}</a> : null}
              </div>
            );
          })() : null}
        </aside>
      </div>

      {/* FOOTER */}
      <footer className="border-t border-[#E7E7E1] bg-[#FCFCFA]">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-2 px-5 py-6 sm:flex-row sm:px-8">
          <p className="text-sm font-semibold text-[#6B6E60]">{t.title} · powered by Klimr — your game, ranked</p>
          <Link href="/" className="tp-mono text-xs font-semibold uppercase tracking-wider text-[#8E4720] transition-colors hover:text-[#E4713A]">Go to Klimr →</Link>
        </div>
      </footer>
    </div>
  );
}
