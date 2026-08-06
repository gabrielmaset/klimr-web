import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MapPin } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { createClient } from "@/lib/supabase/server";
import { updateLocation } from "@/app/settings/actions";

export const metadata: Metadata = { title: "Home ZIP & neighborhood · Settings" };

/** Dedicated page (the hub previously sent this row to Profile & bio — a
 *  duplicate destination). One field, one job: the ZIP that anchors local
 *  rankings, region challenges, and nearby discovery. */
export default async function LocationSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; err?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/location");
  const flags = await searchParams;
  const { data: prof } = await supabase.from("profiles").select("home_zip, neighborhood, city, state").eq("id", user.id).maybeSingle();
  const place = [prof?.neighborhood, prof?.city, prof?.state].filter(Boolean).join(", ");

  return (
    <div className="mx-auto max-w-page-narrow px-5 py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Settings", href: "/settings" }, { label: "Home ZIP & neighborhood" }]} />
      <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Home ZIP &amp; neighborhood</h1>
      <p className="mt-2 text-sm text-mute">Anchors your local rankings, region challenges, and what counts as nearby.</p>

      <div className="mt-6 rounded-2xl border border-rule bg-surface shadow-e1 p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-bg text-ink"><MapPin size={19} /></span>
          <div className="min-w-0">
            <div className="kicker text-faint">Current area</div>
            <div className="mt-0.5 text-sm font-semibold text-ink">{place || "Not set yet"}{prof?.home_zip ? <span className="ml-2 font-mono text-xs font-bold text-faint">ZIP {prof.home_zip}</span> : null}</div>
          </div>
        </div>
        <form action={updateLocation} className="mt-5 max-w-xs">
          <label className="block">
            <span className="text-[13px] font-bold uppercase tracking-[.08em] text-faint">Home ZIP</span>
            <input
              name="zip"
              defaultValue={prof?.home_zip ?? ""}
              inputMode="numeric"
              pattern="\d{5}"
              maxLength={5}
              placeholder="90066"
              className="mt-1.5 w-full rounded-xl border border-rule-2 bg-surface px-3.5 py-3 font-mono text-[16px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15"
            />
          </label>
          <div className="mt-3 flex items-center gap-3">
            <button type="submit" className="press rounded-[10px] bg-ink px-4 py-2 text-sm font-semibold text-surface hover:bg-ink-soft">Save area</button>
            {flags.saved ? <span className="text-xs font-semibold text-brand-deep">Saved — neighborhood updated.</span> : null}
            {flags.err === "zip" ? <span className="text-xs font-semibold text-[#B42318]">Enter a 5-digit ZIP.</span> : null}
            {flags.err === "us" ? <span className="text-xs font-semibold text-[#B42318]">That ZIP doesn&rsquo;t match a U.S. location.</span> : null}
          </div>
        </form>
        <p className="mt-4 border-t border-rule pt-4 text-xs text-faint">
          Your neighborhood and city are derived from the ZIP automatically. Ranking points you&rsquo;ve already earned stay where they were earned.
        </p>
      </div>
    </div>
  );
}
