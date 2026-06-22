import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { CalendarClock, MapPin, Users, Trophy, Check, Dices } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { formatFee } from "@/lib/tournament";
import { PaymentProofUpload } from "@/components/payment-proof-upload";

const REG_STATUS_LABEL: Record<string, string> = { pending: "Pending", confirmed: "Confirmed", waitlisted: "Waitlisted" };
const PAY_STATUS_LABEL: Record<string, string> = { unpaid: "Not submitted", proof_submitted: "Under review", confirmed: "Confirmed", denied: "Needs attention" };
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-rule bg-surface p-4">
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
  if (!user) redirect(`/login?next=/e/${code}`);

  // RLS: a draft/cancelled event only resolves for its owner/managers, so a null
  // row here means "no such (visible) event" → 404.
  const { data: t } = await supabase
    .from("tournaments")
    .select("id, code, title, sport_key, status, entry_type, summary, description, starts_at, location_name, capacity, registration_deadline")
    .eq("code", code)
    .maybeSingle();
  if (!t) notFound();

  const meta = sportMeta(t.sport_key);
  const dateText = t.starts_at
    ? new Date(t.starts_at).toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric", year: "numeric" })
    : null;
  // eslint-disable-next-line react-hooks/purity -- server component; comparing against the current time is intentional
  const deadlinePassed = !!t.registration_deadline && new Date(t.registration_deadline).getTime() < Date.now();
  const canSignUp = t.status === "registration_open" && !deadlinePassed;

  // The viewer's entry, found via their player row so teammates see it too — not just the registrant.
  const { data: myPlayerRows } = await supabase
    .from("tournament_registration_players")
    .select("registration_id, confirmed_at, is_reserve")
    .eq("tournament_id", t.id)
    .eq("user_id", user.id);

  let myEntry: { regId: string; status: string; paymentStatus: string; isTeam: boolean; iConfirmed: boolean; iAmReserve: boolean; iAmRegistrant: boolean } | null = null;
  let expectedCents = 0;
  let payDeny: string | null = null;
  let teamName: string | null = null;
  let roster: { userId: string; name: string; isReserve: boolean; confirmed: boolean }[] = [];
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
  const rosterAllConfirmed = roster.length > 0 && roster.every((r) => r.confirmed);

  const { data: divs } = await supabase
    .from("tournament_divisions")
    .select("id, name, description, fee_cents, fee_basis")
    .eq("tournament_id", t.id)
    .order("sort_order");

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
    <div className="mx-auto max-w-3xl px-5 py-8 sm:py-10">
      {/* hero */}
      <div className="relative overflow-hidden rounded-3xl border border-rail-border bg-[linear-gradient(135deg,#0e2c3a,#0a212c)] p-6 sm:p-8">
        <span aria-hidden className="pointer-events-none absolute -right-6 -top-10 select-none text-[170px] leading-none opacity-[0.07]">{meta.emoji}</span>
        <span aria-hidden className="pointer-events-none absolute -left-12 bottom-0 h-48 w-48 rounded-full bg-brand/20 blur-3xl" />
        <div className="relative">
          <p className="kicker text-rail-active">
            {meta.name} · {t.entry_type === "team" ? "Team event" : "Individual event"}
          </p>
          <h1 className="mt-1 font-display text-4xl leading-tight text-white sm:text-5xl">{t.title}</h1>
          {t.summary ? <p className="mt-3 max-w-xl text-rail-fg/85">{t.summary}</p> : null}
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-rail-fg/80">
            {dateText ? (
              <span className="flex items-center gap-1.5">
                <CalendarClock size={14} /> {dateText}
              </span>
            ) : null}
            {t.location_name ? (
              <span className="flex items-center gap-1.5">
                <MapPin size={14} /> {t.location_name}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* register / entry status */}
      {myEntry ? (
        myEntry.isTeam ? (
          <div className="mt-4 rounded-3xl border border-rule bg-surface p-5 sm:p-6">
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
          <div className="mt-4 rounded-2xl border border-success/40 bg-tint-success p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-ink">
              <Check size={15} className="text-success" /> You&rsquo;re registered
            </p>
            <p className="mt-0.5 text-xs text-mute">
              Status: {REG_STATUS_LABEL[myEntry.status] ?? myEntry.status} · Payment: {PAY_STATUS_LABEL[myEntry.paymentStatus] ?? myEntry.paymentStatus}
            </p>
          </div>
        )
      ) : (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rule bg-surface p-4">
          <div>
            <p className="text-sm font-bold text-ink">{canSignUp ? "Registration is open" : deadlinePassed ? "Registration has closed" : "Registration isn't open yet"}</p>
            <p className="text-xs text-mute">{canSignUp ? "Secure your spot now." : "Follow this event to hear when sign-ups open."}</p>
          </div>
          {canSignUp ? (
            <Link href={`/e/${t.code}/signup`} className="press inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep">
              Sign up
            </Link>
          ) : (
            <button type="button" disabled className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-xl bg-bg px-4 py-2.5 text-sm font-semibold text-faint">
              Follow · Soon
            </button>
          )}
        </div>
      )}

      {/* payment (registrant only) */}
      {myEntry && myEntry.iAmRegistrant ? (
        <div className="mt-3 rounded-2xl border border-rule bg-surface p-4">
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

      {/* about */}
      {t.description ? (
        <section className="mt-6 rounded-3xl border border-rule bg-surface p-5 sm:p-6">
          <h2 className="mb-2 text-sm font-bold text-ink">About</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{t.description}</p>
        </section>
      ) : null}

      {/* divisions */}
      {divs && divs.length ? (
        <section className="mt-6 rounded-3xl border border-rule bg-surface p-5 sm:p-6">
          <h2 className="mb-3 text-sm font-bold text-ink">Divisions &amp; fees</h2>
          <div className="grid gap-2.5">
            {divs.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 rounded-2xl border border-rule bg-bg/40 p-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{d.name}</p>
                  {d.description ? <p className="truncate text-xs text-mute">{d.description}</p> : null}
                </div>
                <span className="shrink-0 text-sm font-semibold text-brand-deep">{formatFee(d.fee_cents, d.fee_basis)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* the draw (transparency) */}
      {drawnDivisions.length ? (
        <section className="mt-6 rounded-3xl border border-rule bg-surface p-5 sm:p-6">
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

      {/* quick facts */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Fact icon={<Trophy size={16} />} label="Sport" value={meta.name} />
        <Fact icon={<Users size={16} />} label="Entry" value={t.entry_type === "team" ? "Teams" : "Individuals"} />
        <Fact icon={<Users size={16} />} label="Capacity" value={t.capacity ? String(t.capacity) : "Open"} />
      </section>
    </div>
  );
}
