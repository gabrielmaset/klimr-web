import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PaymentReviewRow } from "@/components/payment-review-row";
import { FileText } from "lucide-react";
import { buildAccounting, usd, FREED, type Ledger } from "./accounting";

export default async function PaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/tournament/${id}/payments`);

  const { data: t } = await supabase.from("tournaments").select("id, title").eq("id", id).maybeSingle();
  if (!t) notFound();

  const { rows: acctRows, totals, byDivision, waitlistedCount } = await buildAccounting(supabase, id);

  // Signed proof URLs stay page-local (short-lived; the statement doesn't need them).
  const admin = createAdminClient();
  const proofUrl = new Map<string, string>();
  for (const r of acctRows) {
    if (r.proofPath) {
      const { data: signed } = await admin.storage.from("tournament-payments").createSignedUrl(r.proofPath, 60 * 30);
      if (signed?.signedUrl) proofUrl.set(r.regId, signed.signedUrl);
    }
  }
  const rows = acctRows.map((r) => ({ ...r, proofUrl: proofUrl.get(r.regId) ?? null }));
  void (0 as unknown as Ledger);

  const needsReview = rows.filter((r) => r.paymentStatus === "proof_submitted" && !FREED.includes(r.entryStatus));
  const liveOthers = rows.filter((r) => r.paymentStatus !== "proof_submitted" && !FREED.includes(r.entryStatus));
  const closed = rows.filter((r) => FREED.includes(r.entryStatus));

  const stat = (label: string, value: string, tone?: string) => (
    <div className="rounded-2xl border border-rule bg-bg px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-faint">{label}</p>
      <p className={`mt-0.5 font-display text-xl leading-none ${tone ?? "text-ink"}`}>{value}</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-6">
        <p className="kicker text-brand-deep">Registration</p>
        <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Payments</h1>
        <p className="mt-2 text-sm text-mute">Review proofs, confirm or decline, record refunds — and see the full fee accounting for the event. Expected amounts come from each division&rsquo;s fee (per-player fees × rostered players).</p>
        <Link href={`/tournament/${id}/payments/statement`} className="press mt-3 inline-flex items-center gap-1.5 rounded-full border border-rule-2 bg-surface px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:text-ink">
          <FileText size={14} /> Print statement
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-3xl border border-rule bg-surface shadow-e1 p-8 text-center text-sm text-mute">No entries yet — payments will appear here once people sign up.</div>
      ) : (
        <div className="grid gap-7">
          <section className="rounded-3xl border border-rule bg-surface shadow-e1 p-5 sm:p-6">
            <h2 className="text-sm font-bold text-ink">Fee accounting</h2>
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              {stat("Expected (live)", usd(totals.expected))}
              {stat("Collected", usd(totals.collected), "text-success")}
              {stat("Outstanding", usd(totals.outstanding), totals.outstanding ? "text-[#B45309]" : "text-ink")}
              {stat("Kept (forfeits)", usd(totals.forfeited))}
              {stat("To refund", usd(totals.toRefund), totals.toRefund ? "text-[#b91c1c]" : "text-ink")}
              {stat("Refunded", usd(totals.refunded))}
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-rule text-[10px] font-bold uppercase tracking-wider text-faint">
                    <th className="py-2 pr-3 font-bold">Division</th>
                    <th className="py-2 pr-3 font-bold">Live</th>
                    <th className="py-2 pr-3 font-bold">Expected</th>
                    <th className="py-2 pr-3 font-bold">Collected</th>
                    <th className="py-2 pr-3 font-bold">Outstanding</th>
                    <th className="py-2 pr-3 font-bold">Kept</th>
                    <th className="py-2 font-bold">Refunds (owed · done)</th>
                  </tr>
                </thead>
                <tbody>
                  {[...byDivision.entries()].map(([name, l]) => (
                    <tr key={name} className="border-b border-rule-soft last:border-0">
                      <td className="py-2 pr-3 font-semibold text-ink">{name}</td>
                      <td className="py-2 pr-3 text-ink-soft">{l.live}</td>
                      <td className="py-2 pr-3 text-ink-soft">{usd(l.expected)}</td>
                      <td className="py-2 pr-3 text-ink-soft">{usd(l.collected)}</td>
                      <td className="py-2 pr-3 text-ink-soft">{usd(l.outstanding)}</td>
                      <td className="py-2 pr-3 text-ink-soft">{usd(l.forfeited)}</td>
                      <td className="py-2 text-ink-soft">{usd(l.toRefund)} · {usd(l.refunded)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-rule font-bold text-ink">
                    <td className="py-2 pr-3">Total</td>
                    <td className="py-2 pr-3">{totals.live}</td>
                    <td className="py-2 pr-3">{usd(totals.expected)}</td>
                    <td className="py-2 pr-3">{usd(totals.collected)}</td>
                    <td className="py-2 pr-3">{usd(totals.outstanding)}</td>
                    <td className="py-2 pr-3">{usd(totals.forfeited)}</td>
                    <td className="py-2">{usd(totals.toRefund)} · {usd(totals.refunded)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {waitlistedCount ? <p className="mt-2 text-xs text-faint">{waitlistedCount} waitlisted {waitlistedCount === 1 ? "entry isn't" : "entries aren't"} billed until promoted.</p> : null}
          </section>

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
              Needs review
              {needsReview.length ? <span className="rounded-full bg-tint-brand px-2 py-0.5 text-[11px] font-semibold text-brand-deep">{needsReview.length}</span> : null}
            </h2>
            {needsReview.length ? (
              <div className="grid gap-2.5">
                {needsReview.map((r) => (
                  <PaymentReviewRow key={r.regId} {...r} />
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-rule bg-surface shadow-e1 px-4 py-5 text-sm text-mute">Nothing waiting — you&rsquo;re all caught up.</p>
            )}
          </section>

          {liveOthers.length ? (
            <section>
              <h2 className="mb-3 text-sm font-bold text-ink">Everyone else</h2>
              <div className="grid gap-2.5">
                {liveOthers.map((r) => (
                  <PaymentReviewRow key={r.regId} {...r} />
                ))}
              </div>
            </section>
          ) : null}

          {closed.length ? (
            <section>
              <h2 className="mb-3 text-sm font-bold text-ink">Closed entries — forfeits &amp; refunds</h2>
              <div className="grid gap-2.5">
                {closed.map((r) => (
                  <PaymentReviewRow key={r.regId} {...r} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
