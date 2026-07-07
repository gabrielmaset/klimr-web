import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Gift, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Invite a friend" };

// Invite-a-friend is built but intentionally disabled for now. The functional
// version lives in ./actions.ts + ./invite-share.tsx and can be re-enabled later.
export default async function InvitePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/invite");

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-tint-brand">
          <Gift size={22} className="text-brand-deep" />
        </span>
        <div>
          <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Invite a friend</h1>
          <p className="mt-1 text-sm text-mute">Bring players who&apos;ll make the local boards better.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-rule bg-surface p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-bg">
          <Clock size={22} className="text-mute" />
        </span>
        <p className="mt-3 text-base font-bold text-ink">Coming soon</p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-mute">
          Personal invite links aren&apos;t available just yet. We&apos;re finishing this so every invite keeps Klimr high-trust.
          In the meantime, if you know someone who should be on here, point them to{" "}
          <a href="mailto:hello@klimr.com?subject=Klimr%20invite%20request" className="font-semibold text-brand-deep hover:text-brand">
            hello@klimr.com
          </a>
          .
        </p>
        <Link
          href="/discover"
          className="press mt-5 inline-block rounded-full border border-rule px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-bg"
        >
          Find players to play
        </Link>
      </div>
    </div>
  );
}
