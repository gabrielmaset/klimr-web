import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import {
  CalendarClock, MapPin, Globe, ArrowRight, Users, UserCheck, CreditCard,
  Layers, Network, Clock, Check, Link2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { STATUS_LABEL, isRegistrationOpen, isSignupFormReady, type TournamentFormatConfig } from "@/lib/tournament";
import { openRegistration, closeRegistration } from "@/app/tournaments/actions";
import { WeatherForecastCard } from "@/components/weather-card";
import { getEventForecast } from "@/lib/weather";

const REG_LABEL: Record<string, string> = { pending: "Pending", confirmed: "Confirmed", waitlisted: "Waitlisted" };

function regBadgeCls(s: string) {
  return s === "confirmed" ? "bg-tint-success text-success" : "bg-bg text-mute";
}

function timeAgo(iso: string | null, now: number): string {
  if (!iso) return "";
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function StatTile({
  label, Icon, value, sub, tone = "default",
}: {
  label: string;
  Icon: LucideIcon;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "good" | "warn";
}) {
  const valueColor = tone === "good" ? "text-success" : tone === "warn" ? "text-brand-deep" : "text-ink";
  return (
    <div className="rounded-2xl border border-rule bg-surface p-4">
      <div className="flex items-center gap-1.5 text-mute">
        <Icon size={14} />
        <span className="kicker">{label}</span>
      </div>
      <p className={`mt-2 text-2xl font-bold leading-none ${valueColor}`}>{value}</p>
      {sub ? <div className="mt-1.5 text-xs text-mute">{sub}</div> : null}
    </div>
  );
}

export default async function TournamentDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/tournament/${id}`);

  const { data: t } = await supabase
    .from("tournaments")
    .select("id, code, title, sport_key, status, entry_type, starts_at, location_name, location_lat, location_lng, timezone, registration_opens_at, registration_deadline, capacity, format_config")
    .eq("id", id)
    .maybeSingle();
  if (!t) notFound();

  const base = `/tournament/${id}`;
  const meta = sportMeta(t.sport_key);
  const fc = (t.format_config ?? {}) as TournamentFormatConfig;
  const dateText = t.starts_at
    ? new Date(t.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "Dates TBD";
  const publicUrl = `klimr.com/e/${t.code}`;

  // eslint-disable-next-line react-hooks/purity -- server component; comparing against the current time is intentional
  const nowMs = Date.now();
  const dayMs = 86_400_000;

  // Registration state + window
  const regOpen = isRegistrationOpen(t);
  const regOpensAtMs = t.registration_opens_at ? new Date(t.registration_opens_at).getTime() : null;
  const beforeRegOpen = !regOpen && t.status === "published" && regOpensAtMs !== null && nowMs < regOpensAtMs;
  const regOpensText = t.registration_opens_at ? new Date(t.registration_opens_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;
  const regDeadlineText = t.registration_deadline ? new Date(t.registration_deadline).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;
  const regDeadlineMs = t.registration_deadline ? new Date(t.registration_deadline).getTime() : null;
  const regDeadlinePassed = regDeadlineMs !== null && nowMs > regDeadlineMs;
  // Organizer can flip the open/closed switch only once the event is published.
  const canControlReg = t.status === "published" || t.status === "registration_open" || t.status === "registration_closed";
  // Situation-aware status + the exact reason registration is in that state, so
  // "Closed" inside the open→close window is never a mystery.
  let regState: "open" | "scheduled" | "closed";
  let regReason: string;
  if (regOpen) {
    regState = "open";
    regReason = regDeadlineText ? `Open now — closes ${regDeadlineText}.` : "Open now — no closing date set, so it stays open until you close it.";
  } else if (beforeRegOpen) {
    regState = "scheduled";
    regReason = `Scheduled to open ${regOpensText}.`;
  } else {
    regState = "closed";
    if (t.status === "draft") regReason = "Your event isn't published yet, so registration can't open.";
    else if (regDeadlinePassed) regReason = `The registration deadline passed on ${regDeadlineText}.`;
    else if (t.status === "registration_closed") regReason = "You closed registration manually — reopen it any time.";
    else if (!t.registration_opens_at) regReason = "No opening date is set, so it hasn't opened — open it now, or set a date in Settings.";
    else regReason = "Registration hasn't been opened yet.";
  }

  // Countdown to start
  const startMs = t.starts_at ? new Date(t.starts_at).getTime() : null;
  const diffDays = startMs !== null ? Math.floor(startMs / dayMs) - Math.floor(nowMs / dayMs) : null;
  let cdValue: string;
  let cdSub: string;
  let cdTone: "default" | "good" | "warn" = "default";
  if (diffDays === null) {
    cdValue = "—";
    cdSub = "dates TBD";
  } else if (diffDays > 1) {
    cdValue = String(diffDays);
    cdSub = `days · ${dateText}`;
  } else if (diffDays === 1) {
    cdValue = "1";
    cdSub = `day · ${dateText}`;
    cdTone = "warn";
  } else if (diffDays === 0) {
    cdValue = "Today";
    cdSub = dateText;
    cdTone = "good";
  } else {
    cdValue = "Done";
    cdSub = `${Math.abs(diffDays)}d ago`;
  }

  // Sign-up form readiness (for the setup widget)
  const { count: cfCount } = await supabase.from("tournament_custom_fields").select("id", { count: "exact", head: true }).eq("tournament_id", id);
  const signupFormReady = isSignupFormReady(fc, cfCount ?? 0);

  // Registrations (active = not withdrawn/declined)
  const { data: regRows } = await supabase
    .from("tournament_registrations")
    .select("id, status, payment_status, team_id, registrant_id, division_id, created_at")
    .eq("tournament_id", id)
    .not("status", "in", "(withdrawn,declined)")
    .order("created_at", { ascending: false });
  const regs = regRows ?? [];
  const totalReg = regs.length;
  const confirmedReg = regs.filter((r) => r.status === "confirmed").length;
  const pendingReg = regs.filter((r) => r.status === "pending").length;
  const waitlistedReg = regs.filter((r) => r.status === "waitlisted").length;
  const paidReg = regs.filter((r) => r.payment_status === "confirmed").length;
  const reviewReg = regs.filter((r) => r.payment_status === "proof_submitted").length;
  const unpaidReg = regs.filter((r) => r.payment_status === "unpaid").length;

  // Divisions
  const { data: divRows } = await supabase
    .from("tournament_divisions")
    .select("id, name, fee_cents, capacity, sort_order")
    .eq("tournament_id", id)
    .order("sort_order");
  const divisions = divRows ?? [];
  const hasFees = divisions.some((d) => (d.fee_cents ?? 0) > 0);
  const divNameById = new Map(divisions.map((d) => [d.id, d.name] as const));
  const perDivCount = new Map<string, number>();
  for (const r of regs) if (r.division_id) perDivCount.set(r.division_id, (perDivCount.get(r.division_id) ?? 0) + 1);

  // Capacity (pooled mode only)
  const capMode = fc.capacity_mode === "per_division" ? "per_division" : "pooled";
  const pooledCap = capMode === "pooled" ? (t.capacity ?? null) : null;
  const spotsTaken = totalReg - waitlistedReg; // confirmed + pending hold a spot
  const capPct = pooledCap && pooledCap > 0 ? Math.min(100, Math.round((spotsTaken / pooledCap) * 100)) : null;

  // Competition progress
  const { count: totalMatchesRaw } = await supabase.from("tournament_matches").select("id", { count: "exact", head: true }).eq("tournament_id", id);
  const { count: openMatchesRaw } = await supabase.from("tournament_matches").select("id", { count: "exact", head: true }).eq("tournament_id", id).neq("status", "completed");
  const totalMatches = totalMatchesRaw ?? 0;
  const playedMatches = totalMatches - (openMatchesRaw ?? 0);
  const matchPct = totalMatches > 0 ? Math.round((playedMatches / totalMatches) * 100) : null;

  // Recent sign-ups — resolve display names for the latest five
  const recent = regs.slice(0, 5);
  const recTeamIds = [...new Set(recent.filter((r) => r.team_id).map((r) => r.team_id as string))];
  const recPersonIds = [...new Set(recent.filter((r) => !r.team_id).map((r) => r.registrant_id))];
  const teamName = new Map<string, string>();
  const personName = new Map<string, string>();
  if (recTeamIds.length) {
    const { data } = await supabase.from("teams").select("id, name").in("id", recTeamIds);
    for (const x of data ?? []) teamName.set(x.id, x.name);
  }
  if (recPersonIds.length) {
    const { data } = await supabase.from("profiles").select("id, display_name").in("id", recPersonIds);
    for (const x of data ?? []) personName.set(x.id, x.display_name ?? "Player");
  }
  const recentRows = recent.map((r) => ({
    name: r.team_id ? (teamName.get(r.team_id) ?? "Team") : (personName.get(r.registrant_id) ?? "Player"),
    status: r.status as string,
    division: r.division_id ? (divNameById.get(r.division_id) ?? null) : null,
    at: r.created_at as string | null,
  }));

  // Venue forecast (organizer view)
  const forecast = await getEventForecast({ lat: t.location_lat, lng: t.location_lng, startsAt: t.starts_at, timezone: t.timezone });

  // Setup checklist — demoted to one compact widget
  const setup: { label: string; done: boolean; anchor: string; href?: string }[] = [
    { label: "Basics", done: true, anchor: "details" },
    { label: "When & where", done: !!t.starts_at, anchor: "location" },
    { label: "Format", done: !!fc.format_type, anchor: "format" },
    { label: "Divisions", done: divisions.length > 0, anchor: "", href: `${base}/divisions` },
    { label: "Registration", done: !!(t.registration_opens_at || t.registration_deadline), anchor: "registration" },
    { label: "Sign-up form", done: signupFormReady, anchor: "form", href: `${base}/form` },
    { label: "Legal", done: !!(fc.legal?.waiver_text || fc.legal?.rules_text), anchor: "legal" },
    { label: "Publish", done: t.status !== "draft", anchor: "visibility" },
  ];
  const completed = setup.filter((s) => s.done).length;
  const setupPct = Math.round((completed / setup.length) * 100);

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      {/* compact header */}
      <div className="relative overflow-hidden rounded-3xl border border-rail-border bg-[linear-gradient(135deg,#0e2c3a,#0a212c)] p-5 sm:p-6">
        <span aria-hidden className="pointer-events-none absolute -right-4 -top-8 select-none text-[130px] leading-none opacity-[0.06]">{meta.emoji}</span>
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="kicker text-rail-active">Organizer</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rail-fg">{STATUS_LABEL[t.status] ?? t.status}</span>
            </div>
            <h1 className="mt-1 font-display text-2xl leading-tight text-white sm:text-3xl">{t.title}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-rail-fg/80">
              <span>{meta.name}</span>
              <span className="capitalize">{t.entry_type} entry</span>
              <span className="flex items-center gap-1"><CalendarClock size={13} /> {dateText}</span>
              {t.location_name ? <span className="flex items-center gap-1"><MapPin size={13} /> {t.location_name}</span> : null}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link href={`${base}/settings`} className="press inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep">
              {t.status === "draft" ? "Set up event" : "Edit details"} <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </div>

      {/* at-a-glance stat tiles */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Countdown" Icon={CalendarClock} value={cdValue} sub={cdSub} tone={cdTone} />
        <StatTile
          label="Registrations"
          Icon={Users}
          value={totalReg}
          sub={
            <>
              {confirmedReg} confirmed · {pendingReg} pending
              {capPct !== null ? (
                <span className="mt-1.5 block">
                  <span className="mb-0.5 block text-[11px]">{spotsTaken} / {pooledCap} spots</span>
                  <span className="block h-1 w-full overflow-hidden rounded-full bg-bg">
                    <span className="block h-full rounded-full bg-brand" style={{ width: `${capPct}%` }} />
                  </span>
                </span>
              ) : null}
            </>
          }
        />
        <StatTile label="Confirmed" Icon={UserCheck} value={confirmedReg} sub={waitlistedReg ? `${waitlistedReg} waitlisted` : "ready to play"} tone={confirmedReg ? "good" : "default"} />
        {hasFees ? (
          <StatTile label="Payments" Icon={CreditCard} value={paidReg} sub={`${reviewReg} to review · ${unpaidReg} unpaid`} tone={reviewReg ? "warn" : "default"} />
        ) : (
          <StatTile label="Entry" Icon={CreditCard} value="Free" sub="no entry fee" />
        )}
        <StatTile label="Divisions" Icon={Layers} value={divisions.length} sub={t.entry_type === "team" ? "team event" : "singles event"} />
        {totalMatches > 0 ? (
          <StatTile label="Matches" Icon={Network} value={`${playedMatches}/${totalMatches}`} sub={matchPct === 100 ? "all played" : `${matchPct}% played`} tone={matchPct === 100 ? "good" : "default"} />
        ) : (
          <StatTile label="Matches" Icon={Network} value="—" sub="draw not built" />
        )}
      </div>

      {/* panels */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* setup progress (compact) */}
        <section className="rounded-2xl border border-rule bg-surface p-4 sm:p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-ink">Setup</h2>
            <span className="text-xs text-mute">{completed} of {setup.length} done</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg">
            <div className="h-full rounded-full bg-success transition-all" style={{ width: `${setupPct}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {setup.map((s) => (
              <Link
                key={s.label}
                href={s.href ?? `${base}/settings#${s.anchor}`}
                className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-semibold transition-colors ${s.done ? "border-success/30 bg-tint-success text-success" : "border-rule bg-bg text-mute hover:border-faint hover:text-ink"}`}
              >
                {s.done ? <Check size={12} className="shrink-0" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-faint" />}
                <span className="truncate">{s.label}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* venue weather */}
        {forecast ? (
          <WeatherForecastCard forecast={forecast} dateText={dateText} locationName={t.location_name} className="lg:col-span-1" />
        ) : (
          <section className="rounded-2xl border border-rule bg-surface p-4 sm:p-5 lg:col-span-1">
            <h2 className="mb-2 text-sm font-bold text-ink">Weather</h2>
            <p className="text-xs text-mute">
              {t.location_lat == null
                ? "Add a venue location in Settings to show the forecast."
                : "The venue forecast appears about two weeks out."}
            </p>
          </section>
        )}

        {/* public page */}
        <section className="rounded-2xl border border-rule bg-surface p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-bold text-ink">Public page</h2>
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-tint-brand text-brand-deep"><Link2 size={17} /></span>
            <p className="min-w-0 flex-1 truncate font-mono text-sm text-ink">{publicUrl}</p>
          </div>
          <Link href={`/e/${t.code}`} target="_blank" rel="noopener noreferrer" className="press mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-rule bg-bg px-3 py-2 text-sm font-semibold text-ink hover:border-brand">
            <Globe size={14} /> View public page
          </Link>
        </section>

        {/* recent sign-ups */}
        <section className="rounded-2xl border border-rule bg-surface p-4 sm:p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-ink">Recent sign-ups</h2>
            <Link href={`${base}/registrations`} className="text-xs font-semibold text-brand-deep hover:underline">View all →</Link>
          </div>
          {recentRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-mute">No sign-ups yet.</p>
          ) : (
            <ul className="divide-y divide-rule/70">
              {recentRows.map((r, i) => (
                <li key={i} className="flex items-center gap-3 py-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bg text-xs font-bold text-mute">{r.name.slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{r.name}</span>
                    {r.division ? <span className="block truncate text-xs text-mute">{r.division}</span> : null}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${regBadgeCls(r.status)}`}>{REG_LABEL[r.status] ?? r.status}</span>
                  <span className="w-14 shrink-0 text-right text-xs text-faint">{timeAgo(r.at, nowMs)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* registration window + control */}
        <section className="rounded-2xl border border-rule bg-surface p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-bold text-ink">Registration</h2>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${regState === "open" ? "bg-tint-success text-success" : regState === "scheduled" ? "bg-tint-brand text-brand-deep" : "bg-bg text-mute"}`}>
            <Clock size={12} /> {regState === "open" ? "Open" : regState === "scheduled" ? "Scheduled" : "Closed"}
          </span>
          <p className="mt-2 text-xs leading-relaxed text-mute">{regReason}</p>
          <dl className="mt-3 space-y-1.5 text-xs">
            <div className="flex justify-between gap-2"><dt className="text-mute">Opens</dt><dd className="text-right font-medium text-ink">{regOpensText ?? "Not set"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-mute">Closes</dt><dd className="text-right font-medium text-ink">{regDeadlineText ?? "Not set"}</dd></div>
          </dl>
          {regOpen ? (
            <form action={closeRegistration.bind(null, t.id)} className="mt-3">
              <button type="submit" className="press w-full rounded-xl border border-rule bg-bg px-3 py-2 text-sm font-semibold text-ink hover:border-faint">Close registration</button>
            </form>
          ) : regDeadlinePassed && canControlReg ? (
            <Link href={`${base}/settings#registration`} className="press mt-3 inline-flex w-full items-center justify-center rounded-xl border border-rule bg-bg px-3 py-2 text-sm font-semibold text-ink hover:border-faint">Extend the deadline</Link>
          ) : canControlReg ? (
            <form action={openRegistration.bind(null, t.id)} className="mt-3">
              <button type="submit" className="press w-full rounded-xl bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-ink-soft">{regState === "scheduled" ? "Open now" : "Open registration"}</button>
            </form>
          ) : (
            <Link href={`${base}/settings#visibility`} className="press mt-3 inline-flex w-full items-center justify-center rounded-xl bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-ink-soft">Publish event</Link>
          )}
        </section>

        {/* divisions breakdown */}
        {divisions.length > 0 ? (
          <section className="rounded-2xl border border-rule bg-surface p-4 sm:p-5 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-ink">Divisions</h2>
              <Link href={`${base}/divisions`} className="text-xs font-semibold text-brand-deep hover:underline">Manage →</Link>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {divisions.map((d) => {
                const n = perDivCount.get(d.id) ?? 0;
                const cap = d.capacity ?? null;
                const pct = cap && cap > 0 ? Math.min(100, Math.round((n / cap) * 100)) : null;
                return (
                  <div key={d.id} className="rounded-xl border border-rule bg-bg/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-semibold text-ink">{d.name}</span>
                      {hasFees ? <span className="shrink-0 text-xs text-mute">{(d.fee_cents ?? 0) > 0 ? `$${Math.round((d.fee_cents ?? 0) / 100)}` : "Free"}</span> : null}
                    </div>
                    <p className="mt-1 text-xs text-mute">{n}{cap ? ` / ${cap}` : ""} {t.entry_type === "team" ? "teams" : "players"}</p>
                    {pct !== null ? (
                      <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-bg">
                        <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
