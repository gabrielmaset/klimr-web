import Link from "next/link";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

const nowMs = () => Date.now();
import { KlimrLogo } from "@/components/logo";
import { confirmHandoff } from "./actions";
import { VerificationDataPanel } from "@/components/verification-privacy";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verify · Klimr" };

/** The phone side of the desktop → phone handoff (Persona/Stripe pattern).
 *  No login required: the single-use, 30-minute token is the credential for
 *  this one low-risk action — filing the verification request. When the IDV
 *  partner goes live, this page becomes the document-scan entry point. */
export default async function VerifyContinue({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const admin = createAdminClient();

  let state: "ready" | "invalid" = "invalid";
  let firstName = "";
  if (token && /^[0-9a-f-]{36}$/i.test(token)) {
    const { data: h } = await admin
      .from("verification_handoffs")
      .select("token, user_id, expires_at, consumed_at")
      .eq("token", token)
      .maybeSingle();
    if (h && !h.consumed_at && new Date(h.expires_at).getTime() > nowMs()) {
      const { data: p } = await admin.from("profiles").select("first_name").eq("id", h.user_id).maybeSingle();
      firstName = p?.first_name ?? "";
      state = "ready";
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
      <div className="flex justify-center">
        <KlimrLogo />
      </div>
      {state === "ready" ? (
        <div className="mt-10 rounded-3xl border border-rule bg-surface p-6 shadow-e1">
          <p className="flex items-center gap-2 text-lg font-bold text-ink">
            <ShieldCheck size={20} className="text-[#1F6B33]" aria-hidden /> {firstName ? `Hi ${firstName} —` : "Hi —"} let&rsquo;s verify
          </p>
          <p className="mt-2 text-[14.5px] leading-relaxed text-mute">
            You&rsquo;re picking up verification from your other device. Automated ID checks are in preview, so confirming below files your request with our review
            team — most clear within a day, and you&rsquo;ll get an email when yours does.
          </p>
          <form action={confirmHandoff}>
            <input type="hidden" name="token" value={token} />
            <button type="submit" className="press mt-5 w-full rounded-xl px-4 py-3 text-[15px] font-bold text-white shadow-flame" style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}>
              Confirm — it&rsquo;s me
            </button>
          </form>
          <div className="mt-4">
            <VerificationDataPanel compact />
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-mute">
            By continuing you consent to identity processing as described in our{" "}
            <Link href="/legal#privacy" className="font-semibold underline decoration-rule-2 underline-offset-2">Privacy Policy</Link>.
          </p>
        </div>
      ) : (
        <div className="mt-10 rounded-3xl border border-rule bg-surface p-6 text-center shadow-e1">
          <ShieldAlert size={22} className="mx-auto text-brand-deep" aria-hidden />
          <p className="mt-2 text-lg font-bold text-ink">That link has expired</p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-mute">Handoff links work once and for 30 minutes. Grab a fresh one from the signup wizard or Settings → Verification on your other device.</p>
        </div>
      )}
    </div>
  );
}
