import { Handshake } from "lucide-react";
import { respondSponsorshipAction } from "@/app/business/actions";

export type SponsorshipRequestItem = {
  id: string;
  businessName: string;
  label: string;
  amountCents: number | null;
  description: string | null;
};

/** Consent card for a target's controller (organizer / team manager): pending
 *  sponsorship proposals with one-tap Approve/Decline through the audited
 *  0136 RPC. Nothing appears anywhere until approval — and the card says so. */
export function SponsorshipRequests({ items, backPath }: { items: SponsorshipRequestItem[]; backPath: string }) {
  if (!items.length) return null;
  return (
    <div className="mt-4 rounded-3xl border border-brand/40 bg-tint-brand/40 p-4">
      <p className="kicker mb-3 flex items-center gap-1.5 text-brand-deep">
        <Handshake size={14} /> Sponsorship requests · {items.length}
      </p>
      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.id} className="rounded-2xl border border-rule bg-surface px-3 py-2.5 shadow-e1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 flex-1 text-sm leading-snug text-ink">
                <span className="font-semibold">{it.businessName}</span> proposes{" "}
                <span className="font-semibold">{it.label}</span>
                {it.amountCents != null ? (
                  <span className="text-mute"> · ${(it.amountCents / 100).toLocaleString("en-US")} on record</span>
                ) : null}
                {it.description ? <span className="mt-0.5 block text-[12px] text-mute">{it.description}</span> : null}
              </p>
              <span className="flex shrink-0 items-center gap-1.5">
                <form action={respondSponsorshipAction}>
                  <input type="hidden" name="sponsorshipId" value={it.id} />
                  <input type="hidden" name="decision" value="approve" />
                  <input type="hidden" name="back" value={backPath} />
                  <button className="press rounded-full bg-success px-3 py-1.5 text-xs font-semibold text-white hover:brightness-95">
                    Approve
                  </button>
                </form>
                <form action={respondSponsorshipAction}>
                  <input type="hidden" name="sponsorshipId" value={it.id} />
                  <input type="hidden" name="decision" value="decline" />
                  <input type="hidden" name="back" value={backPath} />
                  <button className="press rounded-full border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:border-faint">
                    Decline
                  </button>
                </form>
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-faint">Nothing shows anywhere until you approve. Recorded only — no money moves through Klimr.</p>
    </div>
  );
}
