import type { createClient } from "@/lib/supabase/server";

export type AccountingRow = {
  regId: string;
  name: string;
  division: string | null;
  entryStatus: string;
  paymentStatus: string;
  amountCents: number | null;
  expectedCents: number;
  proofPath: string | null;
  denyReason: string | null;
};
export type Ledger = { live: number; expected: number; collected: number; outstanding: number; forfeited: number; toRefund: number; refunded: number };

export const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const OCCUPYING = ["pending", "confirmed", "under_review"];
export const FREED = ["withdrawn", "cancelled", "disqualified"];

const zero = (): Ledger => ({ live: 0, expected: 0, collected: 0, outstanding: 0, forfeited: 0, toRefund: 0, refunded: 0 });

/** The single source of truth for tournament fee accounting — consumed by the
 *  Payments page and the printable statement. Expected = division fee
 *  (per-player × rostered players); collected uses recorded paid amounts. */
export async function buildAccounting(supabase: Awaited<ReturnType<typeof createClient>>, tournamentId: string) {
  const { data: regs } = await supabase
    .from("tournament_registrations")
    .select("id, status, payment_status, team_id, registrant_id, division_id")
    .eq("tournament_id", tournamentId)
    .not("status", "in", "(declined)")
    .order("created_at");
  const list = regs ?? [];
  const regIds = list.map((r) => r.id);

  const payByReg = new Map<string, { proof_path: string | null; amount_cents: number | null; deny_reason: string | null }>();
  if (regIds.length) {
    const { data: pays } = await supabase
      .from("tournament_payments")
      .select("registration_id, proof_path, amount_cents, deny_reason, created_at")
      .in("registration_id", regIds)
      .order("created_at", { ascending: false });
    for (const p of pays ?? []) if (!payByReg.has(p.registration_id)) payByReg.set(p.registration_id, p);
  }

  const playerCount = new Map<string, number>();
  if (regIds.length) {
    const { data: players } = await supabase.from("tournament_registration_players").select("registration_id").in("registration_id", regIds);
    for (const p of players ?? []) playerCount.set(p.registration_id, (playerCount.get(p.registration_id) ?? 0) + 1);
  }

  const teamIds = [...new Set(list.filter((r) => r.team_id).map((r) => r.team_id as string))];
  const teamName = new Map<string, string>();
  if (teamIds.length) {
    const { data } = await supabase.from("teams").select("id, name").in("id", teamIds);
    for (const x of data ?? []) teamName.set(x.id, x.name);
  }
  const indivIds = [...new Set(list.filter((r) => !r.team_id).map((r) => r.registrant_id))];
  const personName = new Map<string, string>();
  if (indivIds.length) {
    const { data } = await supabase.from("profiles").select("id, display_name").in("id", indivIds);
    for (const x of data ?? []) personName.set(x.id, x.display_name ?? "Player");
  }

  const divInfo = new Map<string, { name: string; fee: number; basis: string }>();
  {
    const { data } = await supabase.from("tournament_divisions").select("id, name, fee_cents, fee_basis").eq("tournament_id", tournamentId).order("sort_order");
    for (const d of data ?? []) divInfo.set(d.id, { name: d.name, fee: d.fee_cents ?? 0, basis: d.fee_basis ?? "per_team" });
  }

  const expectedFor = (r: { division_id: string | null; id: string }): number => {
    const d = r.division_id ? divInfo.get(r.division_id) : null;
    if (!d || !d.fee) return 0;
    return d.basis === "per_player" ? d.fee * Math.max(1, playerCount.get(r.id) ?? 1) : d.fee;
  };

  const rows: AccountingRow[] = list.map((r) => {
    const p = payByReg.get(r.id);
    return {
      regId: r.id,
      name: r.team_id ? teamName.get(r.team_id) ?? "Team" : personName.get(r.registrant_id) ?? "Player",
      division: r.division_id ? divInfo.get(r.division_id)?.name ?? null : null,
      entryStatus: r.status,
      paymentStatus: r.payment_status,
      amountCents: p?.amount_cents ?? null,
      expectedCents: expectedFor(r),
      proofPath: p?.proof_path ?? null,
      denyReason: p?.deny_reason ?? null,
    };
  });

  const paidAmount = (r: AccountingRow) => r.amountCents ?? r.expectedCents;
  const tally = (acc: Ledger, r: AccountingRow) => {
    if (OCCUPYING.includes(r.entryStatus)) {
      acc.live += 1;
      acc.expected += r.expectedCents;
      if (r.paymentStatus === "confirmed") acc.collected += paidAmount(r);
      else if (r.paymentStatus === "refunded") acc.refunded += paidAmount(r);
      else acc.outstanding += r.expectedCents;
    } else if (FREED.includes(r.entryStatus)) {
      if (r.paymentStatus === "refunded") acc.refunded += paidAmount(r);
      else if (r.paymentStatus === "confirmed") {
        if (r.entryStatus === "withdrawn") acc.toRefund += paidAmount(r);
        else acc.forfeited += paidAmount(r);
      }
    }
    return acc;
  };
  const totals = rows.reduce(tally, zero());
  const byDivision = new Map<string, Ledger>();
  for (const r of rows) {
    const key = r.division ?? "No division";
    if (!byDivision.has(key)) byDivision.set(key, zero());
    tally(byDivision.get(key)!, r);
  }
  const waitlistedCount = rows.filter((r) => r.entryStatus === "waitlisted").length;

  return { rows, totals, byDivision, waitlistedCount };
}
