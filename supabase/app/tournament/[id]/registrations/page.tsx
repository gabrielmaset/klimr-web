import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { RegistrationsToolbar } from "@/components/registrations-toolbar";
import { RegistrationsTabs } from "@/components/registrations-tabs";
import { WaitlistManager, type WaitlistRegItem, type WaitlistEmailItem } from "@/components/waitlist-manager";
import { RegistrationDivisionSelect, type DivisionOption } from "@/components/registration-division-select";
import { RegistrationModeration } from "@/components/registration-moderation";

const REG_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  waitlisted: "Waitlisted",
  under_review: "Under review",
  withdrawn: "Withdrawn",
  cancelled: "Cancelled",
  disqualified: "Disqualified",
};
const PAY_LABEL: Record<string, string> = { unpaid: "Unpaid", proof_submitted: "Under review", confirmed: "Paid", denied: "Declined", refunded: "Refunded" };

function regBadge(s: string) {
  if (s === "confirmed") return "bg-tint-success text-success";
  if (s === "under_review") return "bg-[#FDF3DD] text-[#B45309]";
  if (s === "cancelled" || s === "disqualified") return "bg-[#fdeaea] text-[#b91c1c]";
  if (s === "withdrawn") return "bg-bg text-faint";
  return "bg-bg text-mute";
}
function payBadge(s: string) {
  if (s === "confirmed") return "bg-tint-success text-success";
  if (s === "proof_submitted") return "bg-bg text-ink-soft";
  if (s === "denied") return "bg-tint-brand text-brand-deep";
  return "bg-bg text-mute";
}

function val(answers: Record<string, unknown> | null | undefined, id: string): string {
  const v = answers?.[id];
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(String).join("; ");
  return String(v);
}

type Field = { id: string; label: string };
type Player = { name: string; isReserve: boolean; confirmed: boolean; waiver: boolean; rules: boolean; answers: Record<string, string> };
type Entry = { regId: string; name: string; type: string; division: string | null; divisionId: string | null; moderationNote: string | null; status: string; paymentStatus: string; registeredAt: string | null; teamAnswers: Record<string, string>; players: Player[] };

export default async function RegistrationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/tournament/${id}/registrations`);

  const { data: t } = await supabase.from("tournaments").select("id, title, owner_id").eq("id", id).maybeSingle();
  if (!t) notFound();
  const isOwner = t.owner_id === user.id;

  const { data: regs } = await supabase
    .from("tournament_registrations")
    .select("id, status, payment_status, team_id, registrant_id, division_id, moderation_note, team_answers, created_at")
    .eq("tournament_id", id)
    .not("status", "in", "(declined)")
    .order("created_at");
  const list = regs ?? [];
  const regIds = list.map((r) => r.id);

  // custom fields, split by scope
  const { data: fieldRows } = await supabase
    .from("tournament_custom_fields")
    .select("id, label, scope, sort_order")
    .eq("tournament_id", id)
    .order("sort_order");
  const perPlayerFields: Field[] = (fieldRows ?? []).filter((f) => f.scope === "per_player").map((f) => ({ id: f.id, label: f.label }));
  const perTeamFields: Field[] = (fieldRows ?? []).filter((f) => f.scope === "per_team").map((f) => ({ id: f.id, label: f.label }));

  // players
  const playersByReg = new Map<string, { user_id: string; is_reserve: boolean; confirmed_at: string | null; waiver_accepted_at: string | null; rules_accepted_at: string | null; player_answers: Record<string, unknown> | null }[]>();
  const allUserIds = new Set<string>();
  if (regIds.length) {
    const { data: players } = await supabase
      .from("tournament_registration_players")
      .select("registration_id, user_id, is_reserve, confirmed_at, waiver_accepted_at, rules_accepted_at, player_answers")
      .in("registration_id", regIds);
    for (const p of players ?? []) {
      const arr = playersByReg.get(p.registration_id) ?? [];
      arr.push(p as never);
      playersByReg.set(p.registration_id, arr);
      allUserIds.add(p.user_id);
    }
  }
  for (const r of list) if (!r.team_id) allUserIds.add(r.registrant_id);

  // names
  const teamIds = [...new Set(list.filter((r) => r.team_id).map((r) => r.team_id as string))];
  const teamName = new Map<string, string>();
  if (teamIds.length) {
    const { data } = await supabase.from("teams").select("id, name").in("id", teamIds);
    for (const x of data ?? []) teamName.set(x.id, x.name);
  }
  const personName = new Map<string, string>();
  if (allUserIds.size) {
    const { data } = await supabase.from("profiles").select("id, display_name").in("id", [...allUserIds]);
    for (const x of data ?? []) personName.set(x.id, x.display_name ?? "Player");
  }

  const divName = new Map<string, string>();
  const divisionOptions: DivisionOption[] = [];
  {
    const { data } = await supabase
      .from("tournament_divisions")
      .select("id, name, fee_cents, fee_basis")
      .eq("tournament_id", id)
      .order("sort_order");
    for (const d of data ?? []) {
      divName.set(d.id, d.name);
      divisionOptions.push({
        id: d.id,
        label: `${d.name}${d.fee_cents ? ` — $${Math.round(d.fee_cents / 100)}${d.fee_basis === "per_player" ? "/player" : "/team"}` : ""}`,
      });
    }
  }

  const entries: Entry[] = list.map((r) => {
    const rosterRaw = playersByReg.get(r.id) ?? [];
    const players: Player[] = rosterRaw
      .map((p) => ({
        name: personName.get(p.user_id) ?? "Player",
        isReserve: p.is_reserve,
        confirmed: !!p.confirmed_at,
        waiver: !!p.waiver_accepted_at,
        rules: !!p.rules_accepted_at,
        answers: Object.fromEntries(perPlayerFields.map((f) => [f.id, val(p.player_answers, f.id)])),
      }))
      .sort((a, b) => Number(a.isReserve) - Number(b.isReserve) || a.name.localeCompare(b.name));
    return {
      regId: r.id,
      name: r.team_id ? teamName.get(r.team_id) ?? "Team" : personName.get(r.registrant_id) ?? "Player",
      type: r.team_id ? "Team" : "Individual",
      division: r.division_id ? divName.get(r.division_id) ?? null : null,
      divisionId: r.division_id ?? null,
      moderationNote: r.moderation_note ?? null,
      status: r.status,
      paymentStatus: r.payment_status,
      registeredAt: r.created_at ? new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null,
      teamAnswers: Object.fromEntries(perTeamFields.map((f) => [f.id, val(r.team_answers as Record<string, unknown>, f.id)])),
      players,
    };
  });

  const activeEntries = entries.filter((e) => ["pending", "confirmed", "under_review"].includes(e.status));
  const closedEntries = entries.filter((e) => ["withdrawn", "cancelled", "disqualified"].includes(e.status));
  const waitlistedRegEntries = entries.filter((e) => e.status === "waitlisted");
  const playerCount = activeEntries.reduce((n, e) => n + e.players.length, 0);
  const paidCount = activeEntries.filter((e) => e.paymentStatus === "confirmed").length;

  // Klimr waitlisters are full (waitlisted) registrations — they carry their entry data.
  const regItems: WaitlistRegItem[] = waitlistedRegEntries.map((e) => ({
    regId: e.regId,
    name: e.name,
    type: e.type,
    division: e.division,
    divisionId: e.divisionId,
    moderationNote: e.moderationNote,
    playerCount: e.players.length,
  }));

  // Email-only waitlist entries (organizer only), fetched with the service role.
  let emailItems: WaitlistEmailItem[] = [];
  if (isOwner) {
    const admin = createAdminClient();
    const { data: wl } = await admin
      .from("tournament_waitlist")
      .select("id, email, name, status, created_at, notified_at")
      .eq("tournament_id", id)
      .eq("kind", "email")
      .neq("status", "removed")
      .order("created_at");
    const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null);
    emailItems = (wl ?? []).map((w) => ({ id: w.id, name: w.name || "Guest", email: w.email, status: w.status, notifiedAt: fmt(w.notified_at) }));
  }
  const waitCount = regItems.length + emailItems.length;

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker text-brand-deep">Registration</p>
          <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Registrations</h1>
          <p className="mt-2 text-sm text-mute">
            {activeEntries.length} {activeEntries.length === 1 ? "entry" : "entries"} · {playerCount} {playerCount === 1 ? "player" : "players"} · {paidCount} paid
          </p>
        </div>
        {activeEntries.length ? <RegistrationsToolbar entries={activeEntries} perPlayerFields={perPlayerFields} perTeamFields={perTeamFields} title={t.title} /> : null}
      </div>

      <RegistrationsTabs
        regCount={activeEntries.length}
        waitCount={waitCount}
        waitlist={<WaitlistManager regItems={regItems} emailItems={emailItems} tournamentId={id} />}
        registrations={
          activeEntries.length === 0 ? (
        <div className="rounded-3xl border border-rule bg-surface shadow-e1 p-8 text-center text-sm text-mute">No registrations yet. Entries will appear here as people sign up.</div>
      ) : (
        <div className="grid gap-4">
          {activeEntries.map((e, i) => (
            <div key={i} className="overflow-hidden rounded-3xl border border-rule bg-surface shadow-e1 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-bold text-ink">{e.name}</p>
                  <p className="text-xs text-mute">{[e.type, e.division, e.registeredAt].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${regBadge(e.status)}`}>{REG_LABEL[e.status] ?? e.status}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${payBadge(e.paymentStatus)}`}>{PAY_LABEL[e.paymentStatus] ?? e.paymentStatus}</span>
                </div>
              </div>

              {e.moderationNote ? (
                <p className={`mt-2 text-xs font-semibold ${e.status === "under_review" ? "text-[#B45309]" : "text-mute"}`}>
                  {e.status === "under_review" ? "Fix needed: " : "Note: "}
                  {e.moderationNote}
                </p>
              ) : null}

              {isOwner ? (
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                  {divisionOptions.length ? <RegistrationDivisionSelect regId={e.regId} current={e.divisionId} options={divisionOptions} /> : null}
                  <RegistrationModeration regId={e.regId} status={e.status} />
                </div>
              ) : null}

              {perTeamFields.length ? (
                <dl className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                  {perTeamFields.map((f) => (
                    <div key={f.id} className="text-sm">
                      <dt className="inline font-medium text-mute">{f.label}: </dt>
                      <dd className="inline text-ink-soft">{e.teamAnswers[f.id] || "—"}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              <div className="mt-3 overflow-x-auto rounded-xl border border-rule">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead className="bg-bg/60 text-left text-xs text-mute">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Player</th>
                      <th className="px-3 py-2 font-semibold">Confirmed</th>
                      {perPlayerFields.map((f) => (
                        <th key={f.id} className="px-3 py-2 font-semibold">
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {e.players.map((p, pi) => (
                      <tr key={pi} className="border-t border-rule">
                        <td className="px-3 py-2 text-ink">
                          <span className="font-medium">{p.name}</span>
                          {p.isReserve ? <span className="ml-1.5 rounded-full bg-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-mute">Reserve</span> : null}
                        </td>
                        <td className="px-3 py-2 text-ink-soft">{p.confirmed ? "Yes" : "—"}</td>
                        {perPlayerFields.map((f) => (
                          <td key={f.id} className="px-3 py-2 text-ink-soft">
                            {p.answers[f.id] || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {e.players.length === 0 ? (
                      <tr className="border-t border-rule">
                        <td colSpan={2 + perPlayerFields.length} className="px-3 py-3 text-center text-xs text-mute">
                          No players on this entry yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {closedEntries.length ? (
            <details className="rounded-3xl border border-rule bg-bg/60 p-5">
              <summary className="cursor-pointer text-sm font-bold text-mute">
                Closed entries ({closedEntries.length}) — cancelled, withdrawn &amp; disqualified
              </summary>
              <div className="mt-4 grid gap-3">
                {closedEntries.map((e, i) => (
                  <div key={i} className="rounded-2xl border border-rule bg-surface p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-ink">{e.name}</p>
                        <p className="text-xs text-mute">{[e.type, e.division].filter(Boolean).join(" · ")}</p>
                        {e.moderationNote ? <p className="mt-1 text-xs text-mute">Note: {e.moderationNote}</p> : null}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${regBadge(e.status)}`}>{REG_LABEL[e.status] ?? e.status}</span>
                        {isOwner ? <RegistrationModeration regId={e.regId} status={e.status} /> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      )
        }
      />
    </div>
  );
}
