import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Mail, KeyRound, Bell, Phone } from "lucide-react";
import { PhoneField } from "@/components/phone-field";
import { updatePhone } from "@/app/settings/actions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Linked email & phone · Settings" };

export default async function EmailSettingsPage({ searchParams }: { searchParams: Promise<{ phone?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/email");
  const phoneFlag = (await searchParams).phone ?? null;
  const { data: prof } = await supabase.from("profiles").select("phone, phone_country").eq("id", user.id).maybeSingle();

  return (
    <div className="mx-auto max-w-page-narrow px-5 py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Settings", href: "/settings" }, { label: "Email & phone" }]} />
      <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Linked email &amp; phone</h1>
      <p className="mt-2 text-sm text-mute">How you sign in and how organizers can reach you when an event requires it.</p>

      <div className="mt-6 rounded-2xl border border-rule bg-surface shadow-e1 p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-bg text-ink"><Mail size={19} /></span>
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

      <div className="mt-4 rounded-2xl border border-rule bg-surface shadow-e1 p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-bg text-ink"><Phone size={19} /></span>
          <div className="min-w-0">
            <div className="kicker text-faint">Phone number</div>
            <p className="mt-0.5 text-xs text-mute">Optional — some tournaments require a contact number at registration.</p>
          </div>
        </div>
        <form action={updatePhone} className="mt-4 max-w-sm">
          <PhoneField defaultDigits={prof?.phone ?? null} defaultCountry={prof?.phone_country ?? "US"} />
          <div className="mt-3 flex items-center gap-3">
            <button type="submit" className="press rounded-[10px] bg-ink px-4 py-2 text-sm font-semibold text-surface hover:bg-ink-soft">Save phone</button>
            {phoneFlag === "saved" ? <span className="text-xs font-semibold text-brand-deep">Saved.</span> : null}
            {phoneFlag === "invalid" ? <span className="text-xs font-semibold text-[#B42318]">Enter a 10-digit US number.</span> : null}
          </div>
        </form>
      </div>

      <div className="mt-4 space-y-2">
        <Link href="/account/security" className="lift flex items-center gap-3 rounded-xl border border-rule bg-surface shadow-e1 p-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-bg text-ink"><KeyRound size={17} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">Sign-in &amp; security</span>
            <span className="block text-xs text-mute">Magic link and two-factor</span>
          </span>
          <ChevronLeft size={16} className="shrink-0 rotate-180 text-faint" />
        </Link>
        <Link href="/settings" className="lift flex items-center gap-3 rounded-xl border border-rule bg-surface shadow-e1 p-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-bg text-ink"><Bell size={17} /></span>
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
