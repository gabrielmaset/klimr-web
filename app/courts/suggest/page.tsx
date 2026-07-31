import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SuggestCourtForm } from "./suggest-form";

export const metadata: Metadata = { title: "Suggest a court" };

/** Suggest a court (reworked per Gabriel): a structured submission — name,
 *  address, phone, website, maps link, notes — that lands in an admin
 *  review queue for verification. Automatic Google-powered coverage lives
 *  in the background scan; this page is for what the scan missed. */
export default async function SuggestCourtPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/courts/suggest");

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <p className="kicker text-brand-deep">Discover — Courts</p>
      <h1 className="mt-1 font-display text-3xl font-bold text-ink">Suggest a court</h1>
      <p className="mt-1 max-w-xl text-sm text-mute">
        Know a spot the finder is missing? Send it in — a Klimr admin verifies every suggestion before it appears, so include enough for us to find it.
      </p>
      <div className="mt-6 max-w-xl">
        <SuggestCourtForm />
      </div>
    </div>
  );
}
