import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Mail, KeyRound, Bell } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Linked email · Settings" };

export default async function EmailSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/email");

  return (
    <div className="mx-auto max-w-page-narrow px-5 py-8 sm:py-10">
      <BackButton fallback="/settings" label="Settings" className="press mb-4 inline-flex items-center gap-1 text-sm font-semibold text-mute transition-colors hover:text-ink" />
      <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Linked email</h1>
      <p className="mt-2 text-sm text-mute">This is the email you use to sign in to Klimr and where we send match and ranking updates.</p>

      <div className="mt-6 rounded-2xl border border-rule bg-surface p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#f4f4f5] text-ink"><Mail size={19} /></span>
          <div className="min-w-0">
            <div className="kicker text-faint">Email address</div>
            <div className="mt-0.5 truncate font-mono text-sm text-ink">{user.email}</div>
          </div>
        </div>
        <p className="mt-4 border-t border-rule pt-4 text-xs text-faint">
          Klimr signs you in with a one-time magic link — there&rsquo;s no password to manage. To change the email on your account, contact{" "}
          <a href="mailto:hello@klimr.com" className="font-semibold text-brand-deep hover:underline">hello@klimr.com</a>.
        </p>
      </div>

      <div className="mt-4 space-y-2">
        <Link href="/account/security" className="lift flex items-center gap-3 rounded-xl border border-rule bg-surface p-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f4f4f5] text-ink"><KeyRound size={17} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">Sign-in &amp; security</span>
            <span className="block text-xs text-mute">Magic link and two-factor</span>
          </span>
          <ChevronLeft size={16} className="shrink-0 rotate-180 text-faint" />
        </Link>
        <Link href="/settings" className="lift flex items-center gap-3 rounded-xl border border-rule bg-surface p-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f4f4f5] text-ink"><Bell size={17} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">Email notifications</span>
            <span className="block text-xs text-mute">Choose your email digest in Settings</span>
          </span>
          <ChevronLeft size={16} className="shrink-0 rotate-180 text-faint" />
        </Link>
      </div>
    </div>
  );
}
