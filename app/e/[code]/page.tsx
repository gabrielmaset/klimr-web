import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Users, Trophy, Check, Dices, FileText, Megaphone, Pin, ChevronDown, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { formatFee, isRegistrationOpen, type TournamentFormatConfig, type PublishedScheduleRow, type PublishedPool, type PublishedBracketRound, type Sponsor, type Prize, type Announcement } from "@/lib/tournament";
import { PaymentProofUpload } from "@/components/payment-proof-upload";
import { EventHero } from "@/components/event-hero";
import { PremiumSponsorAd } from "@/components/sponsor-ad";
import { WeatherForecastCard } from "@/components/weather-card";
import { EventLocationMap } from "@/components/event-location-map";
import { reopenTournament } from "@/app/tournaments/actions";
import { withinRecoverWindow, recoverDaysLeft } from "@/lib/recover";
import { JoinWaitlistDialog } from "@/components/join-waitlist-dialog";
import { getEventForecast } from "@/lib/weather";

// Always render the public page fresh — see app/e/[code]/layout.tsx. Repeated
// here so the page's live-feed behavior is explicit and regression-proof.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

const REG_STATUS_LABEL: Record<string, string> = { pending: "Pending", confirmed: "Confirmed", waitlisted: "Waitlisted" };
const PAY_STATUS_LABEL: Record<string, string> = { unpaid: "Not submitted", proof_submitted: "Under review", confirmed: "Confirmed", denied: "Needs attention" };
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function PublicStandings({ pool }: { pool: PublishedPool }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-rule">
      <p className="truncate bg-gradient-to-br from-brand to-brand-deep px-4 py-2.5 text-sm font-bold tracking-wide text-white">{pool.name}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-rule text-[10px] uppercase tracking-wide text-mute">
            <th className="px-3 py-1.5 text-center font-semibold">#</th>
            <th className="px-3 py-1.5 text-left font-semibold">Team</th>
            <th className="px-2 py-1.5 text-center font-semibold">W</th>
            <th className="px-2 py-1.5 text-center font-semibold">L</th>
            <th className="px-3 py-1.5 text-center font-semibold">+/&minus;</th>
          </tr>
        </thead>
        <tbody>
          {pool.rows.map((r, i) => (
            <tr key={i} className="border-b border-rule/60 last:border-0">
              <td className="px-3 py-1.5 text-center">
                <span className="inline-grid h-5 w-5 place-items-center rounded-full bg-tint-brand text-[10px] font-bold text-brand-deep">{r.rank}</span>
              </td>
              <td className="px-3 py-1.5 text-ink">{r.team}</td>
              <td className="px-2 py-1.5 text-center tabular-nums text-ink-soft">{r.w}</td>
              <td className="px-2 py-1.5 text-center tabular-nums text-ink-soft">{r.l}</td>
              <td className="px-3 py-1.5 text-center tabular-nums text-mute">{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
            </tr>
          ))}
          {pool.rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-3 text-center text-xs text-mute">No teams yet</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function PublicBracket({ rounds }: { rounds: PublishedBracketRound[] }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-mute">
        <Trophy size={13} /> Knockout
      </p>
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-4">
          {rounds.map((rd, r) => (
            <div key={r} className="w-56 shrink-0">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-mute">{rd.label}</p>
              <div className="grid gap-2">
                {rd.matches.map((m, i) => {
                  const aWin = m.done && m.sa != null && m.sb != null && m.sa > m.sb;
                  const bWin = m.done && m.sa != null && m.sb != null && m.sb > m.sa;
                  return (
                    <div key={i} className="rounded-xl border border-rule bg-surface/90 px-3 py-2 text-sm">
                      <div className={`flex items-center justify-between gap-2 ${aWin ? "font-bold text-ink" : "text-ink-soft"}`}>
                        <span className="min-w-0 truncate">{m.a}</span>
                        <span className="shrink-0 font-mono text-xs tabular-nums">{m.sa ?? ""}</span>
                      </div>
                      <div className={`mt-1 flex items-center justify-between gap-2 border-t border-rule/60 pt-1 ${bWin ? "font-bold text-ink" : "text-ink-soft"}`}>
                        <span className="min-w-0 truncate">{m.b}</span>
                        <span className="shrink-0 font-mono text-xs tabular-nums">{m.sb ?? ""}</span>
                      </div>
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

const MEDALS: Record<string, { from: string; to: string; text: string; ring: string; tint: string }> = {
  gold: { from: "#fde68a", to: "#f59e0b", text: "#854d0e", ring: "#f6c453", tint: "#fffbeb" },
  silver: { from: "#eef2f6", to: "#94a3b8", text: "#334155", ring: "#cbd5e1", tint: "#f8fafc" },
  bronze: { from: "#fcd9b6", to: "#c2773f", text: "#7c2d12", ring: "#e0a06a", tint: "#fff7ed" },
  brand: { from: "#ffd0bf", to: "#ff5b2e", text: "#9a2c0c", ring: "#ffb59e", tint: "#fff5f1" },
};
function medalKey(place?: string | null): keyof typeof MEDALS {
  const p = (place ?? "").toLowerCase();
  if (/(^|\b)(1|1st|first|champion|gold|winner)\b/.test(p) || p.includes("🥇")) return "gold";
  if (/(^|\b)(2|2nd|second|runner|finalist|silver)\b/.test(p) || p.includes("🥈")) return "silver";
  if (/(^|\b)(3|3rd|third|bronze)\b/.test(p) || p.includes("🥉")) return "bronze";
  return "brand";
}

function PrizeCard({ p }: { p: Prize }) {
  const m = MEDALS[medalKey(p.place)];
  const num = (p.place ?? "").match(/\d+/)?.[0] ?? null;
  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl border shadow-sm" style={{ borderColor: m.ring, background: m.tint }}>
      {p.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.photo} alt="" className="aspect-[16/9] w-full object-cover" />
      ) : null}
      <div className="flex flex-1 items-center gap-3.5 p-4">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full font-display text-xl font-bold shadow-inner ring-1 ring-black/5"
          style={{ background: `linear-gradient(145deg, ${m.from}, ${m.to})`, color: m.text }}
        >
          {num ?? <Trophy size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          {p.place ? <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: m.text }}>{p.place}</p> : null}
          <p className="font-display text-lg font-bold leading-tight text-ink">{p.title}</p>
          {p.description ? <p className="mt-0.5 text-xs leading-relaxed text-mute">{p.description}</p> : null}
        </div>
      </div>
    </div>
  );
}

function SponsorCard({ s }: { s: Sponsor }) {
  const inner = (
    <div className="relative flex h-full flex-col items-center gap-2.5 rounded-2xl border border-rule bg-surface/90 p-4 text-center transition hover:border-faint">
      {s.tier === "premium" ? (
        <span className="absolute right-2 top-2 rounded-full bg-tint-brand px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-deep">Premium</span>
      ) : null}
      {s.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.logo} alt="" className="h-20 w-full rounded-xl border border-rule bg-white object-contain p-2" />
      ) : (
        <span className="grid h-20 w-full place-items-center rounded-xl bg-tint-brand text-3xl font-bold text-brand-deep">{s.name.slice(0, 1).toUpperCase()}</span>
      )}
      <span className="text-sm font-semibold text-ink">{s.name}</span>
    </div>
  );
  return s.url ? (
    <a href={s.url} target="_blank" rel="noopener noreferrer" className="block">
      {inner}
    </a>
  ) : (
    inner
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-rule bg-surface/90 p-4">
      <span className="flex items-center gap-1.5 text-mute">
        {icon}
        <span className="text-xs">{label}</span>
      </span>
      <p className="mt-1 text-sm font-bold text-ink">{value}</p>
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
  const photos = Array.isArray(fc.gallery) ? fc.gallery : [];
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
  const forecast = t.weather_enabled
    ? await getEventForecast({ lat: t.location_lat, lng: t.location_lng, startsAt: t.starts_at, timezone: t.timezone })
    : null;
  // Status row is up to three columns: registration · venue map · weather. The map
  // shows when we have a location; registration widens to fill any empty columns.
  const hasMap = !!(t.location_url || t.location_address || t.location_name || (t.location_lat != null && t.location_lng != null));
  const sideCount = (hasMap ? 1 : 0) + (forecast ? 1 : 0);
  const regSpan = sideCount === 2 ? "lg:col-span-1" : sideCount === 1 ? "lg:col-span-2" : "lg:col-span-3";
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
  const isRed = regTone === "soldout" || regTone === "closed";
  const regCardCls =
    regTone === "open"
      ? "border border-transparent bg-gradient-to-br from-[#198a47] to-[#13703a]"
      : regTone === "warn"
        ? "border border-transparent bg-gradient-to-br from-[#fbbf24] to-[#f59e0b]"
        : isRed
          ? "border border-transparent bg-gradient-to-br from-[#ef4444] to-[#c81e1e]"
          : "border border-rule bg-surface/90";
  const regTitleCls = regTone === "warn" || regTone === "soon" ? "text-ink" : "text-white";
  const regSubCls = regTone === "warn" ? "text-ink/70" : regTone === "soon" ? "text-mute" : "text-white/85";
  const regMetaCls = regTone === "warn" ? "text-ink/60" : regTone === "soon" ? "text-faint" : "text-white/75";
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
  const fmtRegDate = (s: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null);
  const opensText = fmtRegDate(t.registration_opens_at);
  const closesText = fmtRegDate(t.registration_deadline);
  const regBtnCls =
    regTone === "open"
      ? "bg-white text-[#13703a] hover:bg-white/90"
      : regTone === "warn"
        ? "bg-ink text-white hover:bg-ink-soft"
        : regTone === "soldout"
          ? "bg-white text-[#c0271d] hover:bg-white/90"
          : regTone === "closed"
            ? "cursor-not-allowed bg-white/15 text-white/90 ring-1 ring-inset ring-white/25"
            : "cursor-not-allowed bg-bg text-faint";
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
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      {/* hero */}
      <EventHero
        kicker={`${meta.name} · ${t.entry_type === "team" ? "Team event" : "Individual event"}`}
        title={t.title}
        summary={t.summary}
        dateText={dateText}
        locationName={t.location_name}
        emoji={meta.emoji}
        photos={photos}
      />

      {t.cancelled_at ? (
        <div className="mt-4 rounded-3xl border border-[#f5b8a6] bg-[#fff5f1] px-5 py-4">
          <p className="text-sm font-bold text-[#dc2626]">This tournament has been cancelled.</p>
          <p className="mt-0.5 text-xs text-ink-soft">Sign-ups are closed. If you registered, reach out to the organizer about any refunds.</p>
          {user && t.owner_id === user.id ? (
            withinRecoverWindow(t.cancelled_at) ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <form action={reopenTournament}>
                  <input type="hidden" name="tournamentId" value={t.id} />
                  <button className="press inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep"><RotateCcw size={14} /> Recover tournament</button>
                </form>
                <span className="text-xs text-mute">Recoverable for {recoverDaysLeft(t.cancelled_at)} more day{recoverDaysLeft(t.cancelled_at) === 1 ? "" : "s"}, then archived.</span>
              </div>
            ) : (
              <p className="mt-2 text-xs text-mute">The 90-day recovery window has passed \u2014 this tournament is archived. Its data is kept.</p>
            )
          ) : null}
        </div>
      ) : null}

      {/* status row: registration · venue map · weather, side by side on desktop */}
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className={regSpan}>
          {myEntry ? (
        myEntry.status === "waitlisted" ? (
          <div className="flex h-full flex-col justify-center rounded-3xl border border-brand/30 bg-tint-brand p-5">
            <p className="flex items-center gap-2 text-sm font-bold text-ink">
              <CalendarClock size={15} className="text-brand-deep" /> You&rsquo;re on the waitlist
            </p>
            <p className="mt-0.5 text-xs text-mute">Your entry is complete. If a spot opens and the organizer accepts it, you&rsquo;ll just need to submit payment.</p>
          </div>
        ) : myEntry.isTeam ? (
          <div className="h-full rounded-3xl border border-rule bg-surface/90 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-bold text-ink">
                  <Check size={15} className="text-success" /> {teamName ?? "Your team"} is entered
                </p>
                <p className="mt-0.5 text-xs text-mute">
                  Entry: {REG_STATUS_LABEL[myEntry.status] ?? myEntry.status} · Payment: {PAY_STATUS_LABEL[myEntry.paymentStatus] ?? myEntry.paymentStatus}
                  {myEntry.iAmReserve ? " · You're a reserve" : ""}
                </p>
              </div>
              {myEntry.iAmRegistrant ? (
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${rosterAllConfirmed ? "bg-tint-success text-success" : "bg-bg text-mute"}`}>
                  {rosterAllConfirmed ? "All confirmed" : "Awaiting confirmations"}
                </span>
              ) : null}
            </div>

            {myEntry.iAmRegistrant && roster.length ? (
              <ul className="mt-4 grid gap-2">
                {roster.map((r) => (
                  <li key={r.userId} className="flex items-center justify-between gap-3 rounded-xl border border-rule bg-bg/40 px-3.5 py-2.5">
                    <span className="flex items-center gap-2 text-sm font-medium text-ink">
                      {r.name}
                      {r.isReserve ? <span className="rounded-full bg-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-mute">Reserve</span> : null}
                    </span>
                    {r.confirmed ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-success">
                        <Check size={13} /> Confirmed
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-mute">Awaiting</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-4">
              {myEntry.iConfirmed ? (
                <p className="flex items-center gap-1.5 text-sm font-medium text-success">
                  <Check size={15} /> You&rsquo;ve confirmed your spot.
                </p>
              ) : (
                <Link href={`/e/${t.code}/confirm`} className="press inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep">
                  Confirm your spot
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col justify-center rounded-3xl border border-success/40 bg-tint-success p-5">
            <p className="flex items-center gap-2 text-sm font-bold text-ink">
              <Check size={15} className="text-success" /> You&rsquo;re registered
            </p>
            <p className="mt-0.5 text-xs text-mute">
              Status: {REG_STATUS_LABEL[myEntry.status] ?? myEntry.status} · Payment: {PAY_STATUS_LABEL[myEntry.paymentStatus] ?? myEntry.paymentStatus}
            </p>
          </div>
        )
      ) : (
        <div className={`flex h-full flex-wrap items-center justify-between gap-3 rounded-3xl p-5 ${regCardCls}`}>
          <div>
            <p className={`text-sm font-bold ${regTitleCls}`}>{regTitle}</p>
            <p className={`text-xs ${regSubCls}`}>{regSub}</p>
            {opensText || closesText ? (
              <div className={`mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-medium ${regMetaCls}`}>
                {opensText ? <span>Opens {opensText}</span> : null}
                {closesText ? <span>Closes {closesText}</span> : null}
              </div>
            ) : null}
          </div>
          {regTone === "soldout" ? (
            <JoinWaitlistDialog tournamentId={t.id} code={t.code} loggedIn={!!user} triggerClassName={`press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold ${regBtnCls}`} />
          ) : canSignUp ? (
            <Link href={signupHref} className={`press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold ${regBtnCls}`}>
              {user ? "Sign up" : "Join to sign up"}
            </Link>
          ) : (
            <button type="button" disabled className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold ${regBtnCls}`}>
              {regClosed ? "Closed" : "Follow · Soon"}
            </button>
          )}
        </div>
          )}
        </div>
        {hasMap ? (
          <EventLocationMap
            name={t.location_name}
            address={t.location_address}
            zip={t.location_zip}
            lat={t.location_lat}
            lng={t.location_lng}
            href={t.location_url ?? undefined}
            className="lg:col-span-1"
          />
        ) : null}
        {forecast ? (
          <WeatherForecastCard forecast={forecast} dateText={dateText} locationName={t.location_name} className="lg:col-span-1 lg:self-start" />
        ) : null}
      </div>

      {/* payment (registrant only) */}
      {myEntry && myEntry.iAmRegistrant && myEntry.status !== "waitlisted" ? (
        <div className="mt-3 rounded-2xl border border-rule bg-surface/90 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-mute">Payment</p>
          {myEntry.paymentStatus === "confirmed" ? (
            <p className="flex items-center gap-1.5 text-sm font-medium text-success">
              <Check size={15} /> Payment confirmed{expectedCents ? ` · ${money(expectedCents)}` : ""}
            </p>
          ) : myEntry.paymentStatus === "proof_submitted" ? (
            <p className="text-sm text-ink-soft">
              Proof received — your organizer is reviewing it.{expectedCents ? ` Amount: ${money(expectedCents)}.` : ""}
            </p>
          ) : (
            <div>
              {expectedCents ? (
                <p className="mb-2 text-sm text-ink-soft">
                  Amount due: <span className="font-semibold text-ink">{money(expectedCents)}</span>
                </p>
              ) : null}
              {myEntry.paymentStatus === "denied" && payDeny ? (
                <p className="mb-2 rounded-lg bg-tint-brand px-3 py-2 text-xs font-medium text-brand-deep">Your last proof was declined: {payDeny}</p>
              ) : null}
              <PaymentProofUpload registrationId={myEntry.regId} />
            </div>
          )}
        </div>
      ) : null}

      {announcements.length ? (
        <section className="mt-6 rounded-3xl border border-rule bg-surface/90 p-5 sm:p-6">
          <h2 className="mb-3 flex items-center gap-1.5 text-base font-bold text-ink">
            <Megaphone size={16} className="text-brand-deep" /> Announcements
          </h2>
          <ul className="grid gap-3">
            {announcements.map((a) => (
              <li key={a.id} className={`rounded-2xl border p-4 ${a.pinned ? "border-brand/40 bg-tint-brand/30" : "border-rule bg-bg/40"}`}>
                <div className="flex items-center gap-2">
                  {a.pinned ? <Pin size={13} className="shrink-0 fill-current text-brand-deep" /> : null}
                  {a.title ? <p className="text-sm font-bold text-ink">{a.title}</p> : null}
                  <span className="ml-auto shrink-0 text-xs text-faint">{a.dateText}</span>
                </div>
                {a.body ? <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{a.body}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* featured premium sponsor — promoted up, just under announcements */}
      {premiumSponsors.length ? (
        <div className="mt-6">
          <PremiumSponsorAd sponsors={premiumSponsors} />
        </div>
      ) : null}

      {/* quick facts — sport · entry · capacity (now leads into divisions) */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Fact icon={<Trophy size={16} />} label="Sport" value={meta.name} />
        <Fact icon={<Users size={16} />} label="Entry" value={t.entry_type === "team" ? "Teams" : "Individuals"} />
        <Fact icon={<Users size={16} />} label="Capacity" value={capacityText} />
      </section>

      {/* divisions */}
      {divs && divs.length ? (
        <section className="mt-6 rounded-3xl border border-rule bg-surface/90 p-5 sm:p-6">
          <h2 className="mb-3 text-sm font-bold text-ink">Divisions &amp; fees</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {divs.map((d) => (
              <div key={d.id} className="flex flex-col rounded-2xl border border-rule bg-bg/40 p-4">
                <p className="text-sm font-semibold text-ink">{d.name}</p>
                {d.description ? <p className="mt-0.5 line-clamp-2 text-xs text-mute">{d.description}</p> : null}
                <p className="mt-2 text-sm font-bold text-brand-deep">{formatFee(d.fee_cents, d.fee_basis)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* prizes */}
      {prizeGroups.length ? (
        <section className="mt-6 rounded-3xl border border-rule bg-surface/90 p-5 sm:p-6">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-ink">
            <Trophy size={15} className="text-brand-deep" /> Prizes
          </h2>
          <div className="space-y-6">
            {prizeGroups.map((g) => (
              <div key={g.key}>
                {prizeGroups.length > 1 || g.key !== "overall" ? (
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-ink-soft">{g.label}</span>
                    <span className="h-px flex-1 bg-rule" />
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  {g.items.map((p) => (
                    <PrizeCard key={p.id} p={p} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* about */}
      {t.description ? (
        <section className="mt-6 rounded-3xl border border-rule bg-surface/90 p-5 sm:p-6">
          <h2 className="mb-2 text-sm font-bold text-ink">About</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{t.description}</p>
        </section>
      ) : null}

      {/* rules — collapsible, closed by default (can run long) */}
      {rulesText ? (
        <details className="group mt-6 rounded-3xl border border-rule bg-surface/90 p-5 sm:p-6">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-base font-bold text-ink [&::-webkit-details-marker]:hidden">
            <FileText size={16} className="text-brand-deep" /> Rules
            <ChevronDown size={16} className="ml-auto text-mute transition-transform group-open:rotate-180" />
          </summary>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{rulesText}</p>
        </details>
      ) : null}

      {/* the draw (transparency) */}
      {drawnDivisions.length ? (
        <section className="mt-6 rounded-3xl border border-rule bg-surface/90 p-5 sm:p-6">
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-ink">
            <Dices size={15} /> The draw
          </h2>
          <p className="mb-3 text-xs text-mute">Pools are drawn completely at random — organizers can&rsquo;t choose placements. Every draw is logged here for transparency.</p>
          <ul className="grid gap-2">
            {drawnDivisions.map((d) => (
              <li key={d.id} className="rounded-2xl border border-rule bg-bg/40 px-3.5 py-2.5 text-sm">
                <span className="font-semibold text-ink">{d.name}</span>
                <span className="text-mute"> — drawn {d.firstAt}</span>
                {d.redrawn ? <span className="font-medium text-brand-deep"> · redrawn {d.lastAt} (draw #{d.lastNumber})</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pubSchedule ? (
        <section className="mt-6 rounded-3xl border border-rule bg-surface/90 p-5 sm:p-6">
          <div className="mb-1 flex items-center gap-2">
            <CalendarClock size={18} className="text-brand-deep" />
            <h2 className="text-base font-bold text-ink">Match schedule</h2>
          </div>
          <p className="mb-4 text-xs text-faint">{pubSchedule.mode === "ordered" ? "Play in the listed order on each court." : "Start times are approximate and may shift on the day."}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {schedByCourt.map(([court, rows]) => (
              <div key={court} className="overflow-hidden rounded-2xl border border-rule">
                <p className="border-b border-rule bg-bg/60 px-3 py-2 text-sm font-bold text-ink">{court}</p>
                <ul className="divide-y divide-rule">
                  {rows.map((r, i) => (
                    <li key={i} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                      <span className="w-16 shrink-0 font-mono text-xs font-semibold tabular-nums text-mute">{r.time ?? `#${i + 1}`}</span>
                      <span className="min-w-0 flex-1">
                        <span className="text-ink">
                          {r.a} <span className="text-faint">vs</span> {r.b}
                        </span>
                        <span className="mt-0.5 block text-xs text-faint">
                          {r.division}
                          {r.pool ? ` · ${r.pool}` : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {pubResults ? (
        <section className="mt-6 rounded-3xl border border-rule bg-surface/90 p-5 sm:p-6">
          <div className="mb-1 flex items-center gap-2">
            <Trophy size={18} className="text-brand-deep" />
            <h2 className="text-base font-bold text-ink">Results &amp; standings</h2>
          </div>
          <p className="mb-4 text-xs text-faint">{resultsUpdated ? `Updated ${resultsUpdated}.` : "Live from the organizer."}</p>
          <div className="grid gap-6">
            {pubResults.divisions.map((d, di) => (
              <div key={di}>
                {pubResults.divisions.length > 1 ? <h3 className="mb-3 border-b border-rule pb-2 text-sm font-bold uppercase tracking-wide text-ink">{d.name}</h3> : null}
                {d.pools.length ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {d.pools.map((p, pi) => (
                      <PublicStandings key={pi} pool={p} />
                    ))}
                  </div>
                ) : null}
                {d.rounds.length ? (
                  <div className={d.pools.length ? "mt-4" : ""}>
                    <PublicBracket rounds={d.rounds} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* sponsors & partners — full logo grid at the foot */}
      {sponsors.length ? (
        <section className="mt-6">
          <p className="kicker mb-3 text-mute">Sponsors &amp; partners</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {sponsors.map((s) => (
              <SponsorCard key={s.id} s={s} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
