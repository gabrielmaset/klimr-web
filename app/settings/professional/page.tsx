import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BadgeCheck, Clock, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { roleLabel } from "@/lib/professional-roles";
import { ProfessionalStatusForm } from "@/components/professional-status-form";
import { withdrawProfessionalApplication } from "./actions";

export const metadata: Metadata = { title: "Professional status · Settings" };

type App = {
  id: string;
  role: string;
  status: string;
  credential_id: string | null;
  review_note: string | null;
  created_at: string;
};

const VLEVEL: Record<string, string> = {
  basic: "Credential-verified",
  id_verified: "ID-verified",
  background_checked: "Background-checked",
};

export default async function ProfessionalSettingsPage({ searchParams }: { searchParams: Promise<{ submitted?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/professional");

  const [{ data: providerRow }, { data: appRows }] = await Promise.all([
    supabase.from("class_providers").select("status, roles, verification_level").eq("user_id", user.id).maybeSingle(),
    supabase.from("provider_applications").select("id, role, status, credential_id, review_note, created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);
  const approvedRoles = providerRow?.status === "approved" ? providerRow.roles ?? [] : [];
  const apps = (appRows as App[] | null) ?? [];

  const errorMsg =
    sp.error === "credential"
      ? "That role needs a credential number to verify."
      : sp.error === "duplicate"
        ? "You already have a pending request for that role."
        : sp.error === "role"
          ? "Please choose a valid role."
          : null;

  return (
    <div className="mx-auto max-w-page-narrow px-5 py-8 sm:py-10">
      <Link href="/settings" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-mute transition-colors hover:text-ink">
        <ArrowLeft size={16} /> Settings
      </Link>
      <div className="mb-6">
        <p className="kicker text-brand-deep">Account</p>
        <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Professional status</h1>
        <p className="mt-2 text-sm text-mute">
          Get recognized as a coach, trainer, health professional, or event organizer — and unlock the ability to create classes and clinics.
        </p>
      </div>

      {sp.submitted ? (
        <div className="mb-5 flex items-center gap-2 rounded-2xl border border-success/30 bg-success/5 px-4 py-3 text-sm text-success">
          <CheckCircle2 size={16} /> Request submitted — our team will review it and follow up.
        </div>
      ) : null}
      {errorMsg ? (
        <div className="mb-5 rounded-2xl border border-brand/30 bg-tint-brand px-4 py-3 text-sm text-brand-deep">{errorMsg}</div>
      ) : null}

      {/* Current status */}
      {approvedRoles.length > 0 ? (
        <section className="mb-6 rounded-2xl border border-rule bg-surface p-5">
          <div className="flex items-center gap-2">
            <BadgeCheck size={18} className="text-brand-deep" />
            <h2 className="text-base font-bold text-ink">Your professional roles</h2>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {approvedRoles.map((r) => (
              <span key={r} className="rounded-full bg-tint-brand px-3 py-1 text-sm font-semibold text-brand-deep">
                {roleLabel(r)}
              </span>
            ))}
          </div>
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-mute">
            <ShieldCheck size={13} /> Verification level: <span className="font-semibold text-ink">{VLEVEL[providerRow?.verification_level ?? "basic"]}</span>
          </p>
        </section>
      ) : null}

      {/* Pending / past applications */}
      {apps.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-mute">Your requests</h2>
          <div className="space-y-2">
            {apps.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rule bg-surface p-4">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-ink">{roleLabel(a.role)}</div>
                  <div className="mt-0.5 text-xs text-mute">
                    {a.credential_id ? `Credential ${a.credential_id} · ` : ""}
                    {new Date(a.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                  {a.review_note ? <div className="mt-1 text-xs text-faint">Reviewer: {a.review_note}</div> : null}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={a.status} />
                  {a.status === "pending" ? (
                    <form action={withdrawProfessionalApplication}>
                      <input type="hidden" name="applicationId" value={a.id} />
                      <button className="press rounded-full border border-rule px-3 py-1.5 text-xs font-semibold text-mute transition-colors hover:text-ink">Withdraw</button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <ProfessionalStatusForm existingRoles={approvedRoles} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "approved")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
        <CheckCircle2 size={13} /> Approved
      </span>
    );
  if (status === "rejected")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand-deep">
        <XCircle size={13} /> Not approved
      </span>
    );
  if (status === "withdrawn") return <span className="rounded-full bg-bg px-2.5 py-1 text-xs font-semibold text-mute">Withdrawn</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-bg px-2.5 py-1 text-xs font-semibold text-mute">
      <Clock size={13} /> Pending review
    </span>
  );
}
