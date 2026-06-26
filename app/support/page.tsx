import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { createClient } from "@/lib/supabase/server";
import { SupportForm } from "./SupportForm";

export const metadata: Metadata = { title: "Contact support" };

export default async function SupportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/support");

  return (
    <div className="mx-auto max-w-page-narrow px-5 py-8 sm:py-10">
      <BackButton fallback="/settings" label="Settings" className="press mb-5 inline-flex items-center gap-1 text-sm font-semibold text-mute hover:text-ink" size={15} />

      <div className="mb-6 flex items-start gap-3">
        <span className="mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-tint-brand text-brand-deep">
          <LifeBuoy size={20} />
        </span>
        <div>
          <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Contact support</h1>
          <p className="mt-2 text-sm text-mute">
            Questions, bugs, or a player to report? Send us a note and we&rsquo;ll get back to you by email.
          </p>
        </div>
      </div>

      <SupportForm email={user.email ?? ""} />
    </div>
  );
}
