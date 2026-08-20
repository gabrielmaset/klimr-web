import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { buildAccounting, usd, FREED } from "../accounting";
import { PrintButton } from "@/components/print-button";

export const metadata: Metadata = { title: "Payments statement — Klimr" };

const REG_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  waitlisted: "Waitlisted",
  under_review: "Under review",
  withdrawn: "Withdrawn",
  cancelled: "Cancelled (fee forfeited)",
  disqualified: "Disqualified",
};
const PAY_LABEL: Record<string, string> = { unpaid: "Unpaid", proof_submitted: "Proof submitted", confirmed: "Paid", denied: "Declined", refunded: "Refunded" };

export default async function PaymentsStatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/tournament/${id}/payments/statement`);

  const { data: t } = await supabase.from("tournaments").select("id, title, starts_at, code").eq("id", id).maybeSingle();
  if (!t) notFound();

  const { rows, totals, byDivision, waitlistedCount } = await buildAccounting(supabase, id);
  const generated = new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
  const sorted = [...rows].sort((a, b) => (a.division ?? "").localeCompare(b.division ?? "") || a.name.localeCompare(b.name));

  const th = "border-b border-[#d8d2c6] py-1.5 pr-3 text-left text-[10px] font-bold uppercase tracking-wider text-[#6b6355]";
  const td = "border-b border-[#eee8dc] py-1.5 pr-3 align-top";

  return (
    <div className="mx-auto max-w-page px-5 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/tournament/${id}/payments`} className="press inline-flex items-center gap-1.5 text-sm text-mute transition-colors hover:text-ink">
          <ArrowLeft size={15} /> Payments
        </Link>
        <PrintButton />
      </div>

      <div className="rounded-3xl border border-rule bg-surface shadow-e1 p-6 print:rounded-none print:border-0 print:bg-white print:p-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule pb-4">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-flame-text print:text-black">Klimr — Registration payments statement</p>
            <h1 className="mt-1 font-display text-2xl font-bold leading-tight text-ink">{t.title}</h1>
            <p className="mt-0.5 text-xs text-mute">
              {t.starts_at ? `Event date: ${new Date(t.starts_at).toLocaleDateString("en-US", { dateStyle: "long" })} · ` : ""}
              Generated {generated}
            </p>
          </div>
          <p className="text-right text-xs text-mute">klimr.com/e/{t.code}</p>
        </div>

        <table className="mt-4 w-full text-[13px]">
          <tbody>
            {[
              ["Expected (live entries)", usd(totals.expected)],
              ["Collected", usd(totals.collected)],
              ["Outstanding", usd(totals.outstanding)],
              ["Kept (forfeited fees)", usd(totals.forfeited)],
              ["To refund", usd(totals.toRefund)],
              ["Refunded", usd(totals.refunded)],
            ].map(([label, value]) => (
              <tr key={label}>
                <td className="py-1 pr-6 font-semibold text-ink-soft">{label}</td>
                <td className="py-1 text-right font-bold tabular-nums text-ink">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mt-6 text-sm font-bold text-ink">By division</h2>
        <table className="mt-2 w-full text-[12.5px]">
          <thead>
            <tr>
              {["Division", "Live", "Expected", "Collected", "Outstanding", "Kept", "To refund", "Refunded"].map((h) => (
                <th key={h} className={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...byDivision.entries()].map(([name, l]) => (
              <tr key={name}>
                <td className={`${td} font-semibold text-ink`}>{name}</td>
                <td className={`${td} tabular-nums`}>{l.live}</td>
                <td className={`${td} tabular-nums`}>{usd(l.expected)}</td>
                <td className={`${td} tabular-nums`}>{usd(l.collected)}</td>
                <td className={`${td} tabular-nums`}>{usd(l.outstanding)}</td>
                <td className={`${td} tabular-nums`}>{usd(l.forfeited)}</td>
                <td className={`${td} tabular-nums`}>{usd(l.toRefund)}</td>
                <td className={`${td} tabular-nums`}>{usd(l.refunded)}</td>
              </tr>
            ))}
            <tr className="font-bold text-ink">
              <td className="py-1.5 pr-3">Total</td>
              <td className="py-1.5 pr-3 tabular-nums">{totals.live}</td>
              <td className="py-1.5 pr-3 tabular-nums">{usd(totals.expected)}</td>
              <td className="py-1.5 pr-3 tabular-nums">{usd(totals.collected)}</td>
              <td className="py-1.5 pr-3 tabular-nums">{usd(totals.outstanding)}</td>
              <td className="py-1.5 pr-3 tabular-nums">{usd(totals.forfeited)}</td>
              <td className="py-1.5 pr-3 tabular-nums">{usd(totals.toRefund)}</td>
              <td className="py-1.5 pr-3 tabular-nums">{usd(totals.refunded)}</td>
            </tr>
          </tbody>
        </table>
        {waitlistedCount ? <p className="mt-1.5 text-[11px] text-faint">{waitlistedCount} waitlisted {waitlistedCount === 1 ? "entry is" : "entries are"} not billed until promoted.</p> : null}

        <h2 className="mt-6 text-sm font-bold text-ink" style={{ breakBefore: "auto" }}>All entries</h2>
        <table className="mt-2 w-full text-[12px]">
          <thead>
            <tr>
              {["Entry", "Division", "Entry status", "Payment", "Expected", "Paid"].map((h) => (
                <th key={h} className={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.regId} className={FREED.includes(r.entryStatus) ? "text-mute" : "text-ink-soft"}>
                <td className={`${td} font-semibold`}>{r.name}</td>
                <td className={td}>{r.division ?? "—"}</td>
                <td className={td}>{REG_LABEL[r.entryStatus] ?? r.entryStatus}</td>
                <td className={td}>{PAY_LABEL[r.paymentStatus] ?? r.paymentStatus}</td>
                <td className={`${td} tabular-nums`}>{r.expectedCents ? usd(r.expectedCents) : "—"}</td>
                <td className={`${td} tabular-nums`}>{r.amountCents != null ? usd(r.amountCents) : r.paymentStatus === "confirmed" && r.expectedCents ? usd(r.expectedCents) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-5 text-[10.5px] leading-relaxed text-faint">
          Klimr never processes marketplace or registration payments — amounts on this statement are recorded by the organizer from direct arrangements with entrants. Forfeits follow the event&rsquo;s cancellation policy; refunds are settled directly and marked here when completed.
        </p>
      </div>
    </div>
  );
}
