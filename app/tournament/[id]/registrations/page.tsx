import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RegistrationsToolbar } from "@/components/registrations-toolbar";

const REG_LABEL: Record<string, string> = { pending: "Pending", confirmed: "Confirmed", waitlisted: "Waitlisted" };
const PAY_LABEL: Record<string, string> = { unpaid: "Unpaid", proof_submitted: "Under review", confirmed: "Paid", denied: "Declined" };

function regBadge(s: string) {
  if (s === "confirmed") return "bg-tint-success text-success";
  if (s === "waitlisted") return "bg-bg text-mute";
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
type Entry = { name: string; type: string; division: string | null; status: string; paymentStatus: string; registeredAt: string | null; teamAnswers: Record<string, string>; players: Player[] };

export default async function RegistrationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/tournament/${id}/registrations`);

  const { data: t } = await supabase.from("tournaments").select("id, title").eq("id", id).maybeSingle();
  if (!t) notFound();

  const { data: regs } = await supabase
    .from("tournament_registrations")
    .select("id, status, payment_status, team_id, registrant_id, division_id, team_answers, created_at")
    .eq("tournament_id", id)
    .not("status", "in", "(withdrawn,declined)")
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
  {
    const { data } = await supabase.from("tournament_divisions").select("id, name").eq("tournament_id", id);
    for (const d of data ?? []) divName.set(d.id, d.name);
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
      name: r.team_id ? teamName.get(r.team_id) ?? "Team" : personName.get(r.registrant_id) ?? "Player",
      type: r.team_id ? "Team" : "Individual",
      division: r.division_id ? divName.get(r.division_id) ?? null : null,
      status: r.status,
      paymentStatus: r.payment_status,
      registeredAt: r.created_at ? new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null,
      teamAnswers: Object.fromEntries(perTeamFields.map((f) => [f.id, val(r.team_answers as Record<string, unknown>, f.id)])),
      players,
    };
  });

  const playerCount = entries.reduce((n, e) => n + e.players.length, 0);
  const paidCount = entries.filter((e) => e.paymentStatus === "confirmed").length;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker text-brand-deep">Registration</p>
          <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Registrations</h1>
          <p className="mt-2 text-sm text-mute">
            {entries.length} {entries.length === 1 ? "entry" : "entries"} · {playerCount} {playerCount === 1 ? "player" : "players"} · {paidCount} paid
          </p>
        </div>
        {entries.length ? <RegistrationsToolbar entries={entries} perPlayerFields={perPlayerFields} perTeamFields={perTeamFields} title={t.title} /> : null}
      </div>

      {entries.length === 0 ? (
        <div className="rounded-3xl border border-rule bg-surface p-8 text-center text-sm text-mute">No registrations yet. Entries will appear here as people sign up.</div>
      ) : (
        <div className="grid gap-4">
          {entries.map((e, i) => (
            <div key={i} className="overflow-hidden rounded-3xl border border-rule bg-surface p-5">
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
        </div>
      )}
    </div>
  );
}
