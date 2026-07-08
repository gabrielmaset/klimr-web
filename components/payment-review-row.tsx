"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, X, ExternalLink } from "lucide-react";
import { confirmPayment, denyPayment } from "@/app/tournaments/actions";

const money = (c: number | null) => (c == null ? null : `$${(c / 100).toFixed(2)}`);
const PAY_LABEL: Record<string, string> = { unpaid: "No proof yet", proof_submitted: "Awaiting review", confirmed: "Confirmed", denied: "Declined" };

export function PaymentReviewRow({
  regId,
  name,
  division,
  paymentStatus,
  amountCents,
  proofUrl,
  denyReason,
}: {
  regId: string;
  name: string;
  division: string | null;
  paymentStatus: string;
  amountCents: number | null;
  proofUrl: string | null;
  denyReason: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "confirm" | "deny">(null);
  const [showDeny, setShowDeny] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function doConfirm() {
    setBusy("confirm");
    setErr(null);
    const res = await confirmPayment(regId);
    if (res.ok) router.refresh();
    else {
      setErr(res.error ?? "Failed.");
      setBusy(null);
    }
  }

  async function doDeny() {
    setBusy("deny");
    setErr(null);
    const res = await denyPayment(regId, reason);
    if (res.ok) router.refresh();
    else {
      setErr(res.error ?? "Failed.");
      setBusy(null);
    }
  }

  const amt = money(amountCents);
  return (
    <div className="rounded-2xl border border-rule bg-surface shadow-e1 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{name}</p>
          <p className="text-xs text-mute">{[division, amt].filter(Boolean).join(" · ") || "—"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {proofUrl ? (
            <a href={proofUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-rule bg-bg px-3 py-2 text-xs font-semibold text-ink hover:border-faint">
              <ExternalLink size={13} /> View proof
            </a>
          ) : null}
          {paymentStatus === "confirmed" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-tint-success px-2.5 py-1 text-xs font-semibold text-success">
              <Check size={13} /> Confirmed
            </span>
          ) : paymentStatus === "proof_submitted" ? (
            <>
              <button type="button" onClick={doConfirm} disabled={!!busy} className="press inline-flex items-center gap-1.5 rounded-lg bg-success px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {busy === "confirm" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Confirm
              </button>
              <button type="button" onClick={() => setShowDeny((v) => !v)} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg border border-rule bg-bg px-3 py-2 text-xs font-semibold text-ink hover:border-faint disabled:opacity-50">
                <X size={13} /> Decline
              </button>
            </>
          ) : paymentStatus === "denied" ? (
            <span className="rounded-full bg-tint-brand px-2.5 py-1 text-xs font-semibold text-brand-deep">Declined</span>
          ) : (
            <span className="text-xs font-medium text-mute">{PAY_LABEL[paymentStatus] ?? paymentStatus}</span>
          )}
        </div>
      </div>

      {paymentStatus === "denied" && denyReason ? <p className="mt-2 text-xs text-mute">Reason given: {denyReason}</p> : null}

      {showDeny && paymentStatus === "proof_submitted" ? (
        <div className="mt-3 border-t border-rule pt-3">
          <label className="mb-1.5 block text-xs font-semibold text-ink">Reason for declining (shared with the entrant)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="e.g. The amount doesn't match, or the receipt is unreadable."
            className="w-full resize-y rounded-xl border border-rule bg-bg px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
          />
          <div className="mt-2 flex items-center gap-3">
            <button type="button" onClick={doDeny} disabled={busy === "deny"} className="press inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-deep disabled:opacity-50">
              {busy === "deny" ? <Loader2 size={13} className="animate-spin" /> : null} Decline payment
            </button>
            <button type="button" onClick={() => setShowDeny(false)} className="text-xs font-medium text-mute hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {err ? <p className="mt-2 text-xs font-semibold text-brand-deep">{err}</p> : null}
    </div>
  );
}
