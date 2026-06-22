import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, BadgeCheck, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { startVerification, approveVerification } from "@/app/account/actions";

export const metadata: Metadata = { title: "Identity verification · Settings" };

export default async function VerificationSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/verification");

  const { data: profile } = await supabase.from("profiles").select("verification_status").eq("id", user.id).maybeSingle();
  const v = profile?.verification_status ?? "unverified";

  return (
    <div className="mx-auto max-w-page-narrow px-5 py-8 sm:py-10">
      <Link href="/settings" className="press mb-4 inline-flex items-center gap-1 text-sm font-semibold text-mute transition-colors hover:text-ink">
        <ChevronLeft size={16} /> Settings
      </Link>
      <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Identity verification</h1>
      <p className="mt-2 text-sm text-mute">Every Klimr player is verified — it&rsquo;s the trust floor for rankings and matches, and it keeps the community real.</p>

      <div className="mt-6 rounded-2xl border border-rule bg-surface p-6">
        <div className="kicker text-faint">Status</div>
        <div className="mt-3">
          {v === "verified" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-tint-success px-3 py-1.5 text-sm font-bold text-success">
              <BadgeCheck size={15} aria-hidden /> Verified
            </span>
          ) : v === "pending" ? (
            <div className="space-y-3">
              <span className="inline-flex items-center rounded-full bg-pop px-3 py-1.5 text-sm font-bold text-ink">Under review</span>
              <p className="text-sm text-mute">We&rsquo;ll let you know as soon as your verification is approved.</p>
              <form action={approveVerification}>
                <button className="block text-xs font-semibold text-faint underline underline-offset-2 transition-colors hover:text-mute">
                  Demo only: approve (admin)
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f4f4f5] px-3 py-1.5 text-sm font-semibold text-mute">Not verified yet</span>
              <p className="text-sm text-mute">Start verification to unlock your rankings and join matches.</p>
              <form action={startVerification}>
                <button className="press rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep">
                  Start verification
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-faint">
        <ShieldCheck size={13} /> Klimr is invite-only and identity-verified. We never sell your data.
      </p>
    </div>
  );
}
