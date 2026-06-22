import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PaymentReviewRow } from "@/components/payment-review-row";

type Row = {
  regId: string;
  name: string;
  division: string | null;
  paymentStatus: string;
  amountCents: number | null;
  proofUrl: string | null;
  denyReason: string | null;
};

export default async function PaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/tournament/${id}/payments`);

  const { data: t } = await supabase.from("tournaments").select("id, title").eq("id", id).maybeSingle();
  if (!t) notFound();

  const { data: regs } = await supabase
    .from("tournament_registrations")
    .select("id, status, payment_status, team_id, registrant_id, division_id")
    .eq("tournament_id", id)
    .not("status", "in", "(withdrawn,declined)")
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

  const divName = new Map<string, string>();
  {
    const { data } = await supabase.from("tournament_divisions").select("id, name").eq("tournament_id", id);
    for (const d of data ?? []) divName.set(d.id, d.name);
  }

  // Mint short-lived signed URLs for each proof (private bucket, admin client).
  const admin = createAdminClient();
  const proofUrl = new Map<string, string>();
  for (const [regId, p] of payByReg) {
    if (p.proof_path) {
      const { data: signed } = await admin.storage.from("tournament-payments").createSignedUrl(p.proof_path, 60 * 30);
      if (signed?.signedUrl) proofUrl.set(regId, signed.signedUrl);
    }
  }

  const rows: Row[] = list.map((r) => {
    const p = payByReg.get(r.id);
    return {
      regId: r.id,
      name: r.team_id ? teamName.get(r.team_id) ?? "Team" : personName.get(r.registrant_id) ?? "Player",
      division: r.division_id ? divName.get(r.division_id) ?? null : null,
      paymentStatus: r.payment_status,
      amountCents: p?.amount_cents ?? null,
      proofUrl: proofUrl.get(r.id) ?? null,
      denyReason: p?.deny_reason ?? null,
    };
  });
  const needsReview = rows.filter((r) => r.paymentStatus === "proof_submitted");
  const others = rows.filter((r) => r.paymentStatus !== "proof_submitted");

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:py-10">
      <div className="mb-6">
        <p className="kicker text-brand-deep">Registration</p>
        <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Payments</h1>
        <p className="mt-2 text-sm text-mute">Review the proofs entrants upload, then confirm or decline. Proof files open in a new tab through a private link that expires.</p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-3xl border border-rule bg-surface p-8 text-center text-sm text-mute">No entries yet — payments will appear here once people sign up.</div>
      ) : (
        <div className="grid gap-7">
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
              <p className="rounded-2xl border border-rule bg-surface px-4 py-5 text-sm text-mute">Nothing waiting — you&rsquo;re all caught up.</p>
            )}
          </section>

          {others.length ? (
            <section>
              <h2 className="mb-3 text-sm font-bold text-ink">Everyone else</h2>
              <div className="grid gap-2.5">
                {others.map((r) => (
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
