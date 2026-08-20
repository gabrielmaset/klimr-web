import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { createClient } from "@/lib/supabase/server";
import { setDefaultSport } from "@/app/settings/actions";
import { sportMeta } from "@/lib/sports";

export const metadata: Metadata = { title: "Default sport · Settings" };

/** Its own control now — the hub previously sent both "Default sport" and
 *  "Sports & skill levels" to the same page. The default is what opens first
 *  across Klimr: Play, rankings, and discovery all lead with it. */
export default async function DefaultSportPage({ searchParams }: { searchParams: Promise<{ saved?: string; err?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/default-sport");
  const flags = await searchParams;
  const [{ data: mine }, { data: prof }] = await Promise.all([
    supabase.from("player_sports").select("sport_key").eq("user_id", user.id).eq("active", true),
    supabase.from("profiles").select("primary_sport").eq("id", user.id).maybeSingle(),
  ]);
  const sports = (mine ?? []).map((r) => r.sport_key);
  const current = prof?.primary_sport ?? sports[0] ?? null;

  return (
    <div className="mx-auto max-w-page-narrow px-5 py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Settings", href: "/settings" }, { label: "Default sport" }]} />
      <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Default sport</h1>
      <p className="mt-2 text-sm text-mute">What opens first across Klimr — Play, rankings, and discovery lead with it.</p>

      <div className="mt-6 rounded-2xl border border-rule bg-surface shadow-e1 p-6">
        {sports.length === 0 ? (
          <p className="text-sm text-mute">
            You haven&rsquo;t added any sports yet. Pick them in{" "}
            <Link href="/settings/sports" className="font-semibold text-brand-deep hover:underline">Sports &amp; skill levels</Link> first.
          </p>
        ) : (
          <form action={setDefaultSport}>
            <div className="divide-y divide-rule">
              {sports.map((key) => {
                const m = sportMeta(key);
                return (
                  <label key={key} className="press flex cursor-pointer items-center gap-3 py-3">
                    <input
                      type="radio"
                      name="sport"
                      value={key}
                      defaultChecked={key === current}
                      className="h-4 w-4 accent-[var(--color-brand)]"
                    />
                    <span className="text-sm font-semibold text-ink">{m.name}</span>
                  </label>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-3 border-t border-rule pt-4">
              <button type="submit" className="press rounded-[10px] bg-ink px-4 py-2 text-sm font-semibold text-surface hover:bg-ink-soft">Save default</button>
              {flags.saved ? <span className="text-xs font-semibold text-brand-deep">Saved.</span> : null}
              {flags.err === "pick" ? <span className="text-xs font-semibold text-[#B42318]">Pick one of your active sports.</span> : null}
            </div>
          </form>
        )}
        <p className="mt-4 border-t border-rule pt-4 text-xs text-faint">
          Only sports you actively play can be the default. Add or retire sports in{" "}
          <Link href="/settings/sports" className="font-semibold text-brand-deep hover:underline">Sports &amp; skill levels</Link>.
        </p>
      </div>
    </div>
  );
}
