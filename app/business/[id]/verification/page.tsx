import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { withdrawTierApplication } from "../../actions";
import { TierApplication } from "@/components/tier-application";
import { TIER_LABEL } from "@/lib/business";

export const metadata = { title: "Business verification · Klimr" };
export const dynamic = "force-dynamic";

export default async function BusinessVerificationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/business/${id}/verification`);

  const [{ data: b }, { data: membership }, { data: openApp }] = await Promise.all([
    supabase.from("business_accounts").select("id, status, verification_level").eq("id", id).maybeSingle(),
    supabase.from("business_members").select("role").eq("business_id", id).eq("user_id", user.id).maybeSingle(),
    supabase
      .from("business_tier_applications")
      .select("id, status, domain, docs, created_at")
      .eq("business_id", id)
      .eq("status", "submitted")
      .maybeSingle(),
  ]);
  if (!b) redirect("/settings");
  const canManage = membership?.role === "owner" || membership?.role === "manager";
  const sponsorReady = b.status === "active" && b.verification_level === "tier2";

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <PageHeader
        kicker="Business"
        title="Verification"
        sub={`Current tier: ${TIER_LABEL[b.verification_level] ?? b.verification_level}. Tier 2 unlocks sponsorship proposals.`}
      />

      <div className="mt-6 max-w-3xl rounded-2xl border border-rule bg-surface p-5 shadow-e1">
        {sponsorReady ? (
          <p className="flex items-center gap-2 text-sm text-ink">
            <ShieldCheck size={16} className="text-brand-deep" />
            <span><span className="font-semibold">Sponsor-ready.</span> Proposals and sponsorship tools are unlocked.</span>
          </p>
        ) : openApp ? (
          <div className="rounded-xl border border-brand/40 bg-tint-brand/40 p-3.5">
            <p className="text-sm font-semibold text-ink">Tier-2 review in progress</p>
            <p className="mt-0.5 text-[12.5px] text-mute">
              {(openApp.docs as { name: string }[] | null)?.length ?? 0} document
              {((openApp.docs as { name: string }[] | null)?.length ?? 0) === 1 ? "" : "s"} · {openApp.domain} — submitted{" "}
              {new Date(openApp.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. Review usually
              lands within a few days.
            </p>
            {canManage ? (
              <form action={withdrawTierApplication} className="mt-2">
                <input type="hidden" name="applicationId" value={openApp.id} />
                <input type="hidden" name="businessId" value={id} />
                <button className="press text-[10px] font-bold uppercase tracking-wide text-faint hover:text-danger">
                  Withdraw application
                </button>
              </form>
            ) : null}
          </div>
        ) : canManage && b.status === "active" ? (
          <TierApplication businessId={id} />
        ) : (
          <p className="text-sm text-mute">
            Sponsor-ready (Tier 2) needs the document review — business documents, domain, brand kit, and terms.
            {b.status !== "active" ? " Available once the business passes its first review." : ""}
          </p>
        )}
      </div>
    </div>
  );
}
