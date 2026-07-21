import { redirect } from "next/navigation";
import { Handshake } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { withdrawSponsorship } from "../../actions";
import { SponsorshipProposer } from "@/components/sponsorship-proposer";
import { SPONSORSHIP_STATUS_LABEL } from "@/lib/business";

export const metadata = { title: "Sponsorships · Klimr" };
export const dynamic = "force-dynamic";

export default async function BusinessSponsorshipsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/business/${id}/sponsorships`);

  const [{ data: b }, { data: membership }, { data: sponsorships }] = await Promise.all([
    supabase.from("business_accounts").select("id, status, verification_level").eq("id", id).maybeSingle(),
    supabase.from("business_members").select("role").eq("business_id", id).eq("user_id", user.id).maybeSingle(),
    supabase
      .from("sponsorships")
      .select("id, target_kind, label, status, amount_cents, created_at")
      .eq("business_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (!b) redirect("/settings");
  const canManage = membership?.role === "owner" || membership?.role === "manager";
  const sponsorReady = b.status === "active" && b.verification_level === "tier2";
  const list = (sponsorships ?? []) as { id: string; target_kind: string; label: string; status: string; amount_cents: number | null }[];

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <PageHeader
        kicker="Business"
        title="Sponsorships"
        sub="Recorded relationships with events, teams, and — soon — players. No money moves through Klimr."
      />

      <div className="mt-6 max-w-3xl rounded-2xl border border-rule bg-surface p-5 shadow-e1">
        <p className="kicker mb-2 flex items-center gap-1.5"><Handshake size={14} /> Your sponsorships</p>
        {!sponsorReady ? (
          <p className="text-sm text-mute">
            Sponsoring needs the <span className="font-semibold text-ink">Sponsor-ready</span> tier — apply under{" "}
            <span className="font-semibold text-ink">Verification</span> in the menu.
          </p>
        ) : null}
        {list.length === 0 ? (
          <p className="mt-2 text-sm text-faint">No sponsorships yet.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {list.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-rule bg-bg px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-ink">
                  <span className="font-semibold capitalize">{s.target_kind}</span> · {s.label}
                  {s.amount_cents != null ? <span className="text-mute"> · ${(s.amount_cents / 100).toLocaleString("en-US")}</span> : null}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs font-semibold text-mute">{SPONSORSHIP_STATUS_LABEL[s.status] ?? s.status}</span>
                  {s.status === "pending" && canManage ? (
                    <form action={withdrawSponsorship}>
                      <input type="hidden" name="sponsorshipId" value={s.id} />
                      <input type="hidden" name="businessId" value={id} />
                      <button className="press text-[10px] font-bold uppercase tracking-wide text-faint hover:text-danger">
                        Withdraw
                      </button>
                    </form>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        {sponsorReady && canManage ? <SponsorshipProposer businessId={id} /> : null}
      </div>
    </div>
  );
}
