import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { SportIcon } from "@/components/sport-icons";
import { createBusiness } from "../actions";
import { BUSINESS_KINDS } from "@/lib/business";
import { SPORT_KEYS, sportMeta } from "@/lib/sports";

export const metadata = { title: "New business · Klimr" };
export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-[10px] border border-rule-2 bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15";

export default async function NewBusiness() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/business/new");
  const { data: flag } = await supabase.from("feature_flags").select("enabled").eq("key", "business_publication").maybeSingle();
  if (!flag?.enabled) notFound();

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <PageHeader
        kicker="Business"
        title="Start a business profile"
        sub="Drafts are private. Klimr reviews new businesses before they go live — verification tiers come after."
      />

      <form action={createBusiness} className="mt-6 max-w-2xl space-y-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-faint">What is it?</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {BUSINESS_KINDS.map((k, i) => (
              <label
                key={k.key}
                className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-rule bg-surface p-3 transition-colors has-[:checked]:border-brand has-[:checked]:bg-tint-brand/40"
              >
                <input type="radio" name="kind" value={k.key} defaultChecked={i === 0} className="mt-0.5 accent-[var(--color-brand)]" />
                <span>
                  <span className="block text-sm font-semibold text-ink">{k.label}</span>
                  <span className="block text-[11.5px] leading-snug text-mute">{k.blurb}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-faint" htmlFor="biz-name">Name</label>
          <input id="biz-name" name="name" required minLength={2} maxLength={80} placeholder="Westside Racquet Shop" className={`mt-1.5 ${inputCls}`} />
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-faint" htmlFor="biz-headline">Headline</label>
          <input id="biz-headline" name="headline" maxLength={120} placeholder="Stringing, demos, and same-day grips" className={`mt-1.5 ${inputCls}`} />
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-faint" htmlFor="biz-area">Area</label>
          <input id="biz-area" name="area_text" maxLength={80} placeholder="Mar Vista, Los Angeles" className={`mt-1.5 ${inputCls}`} />
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-faint">Sports</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SPORT_KEYS.map((s) => (
              <label
                key={s}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-rule bg-surface px-3 py-1.5 text-sm text-ink transition-colors has-[:checked]:border-brand has-[:checked]:bg-tint-brand/50"
              >
                <input type="checkbox" name={`sport_${s}`} className="accent-[var(--color-brand)]" />
                <SportIcon sport={s} variant="badge" size={15} /> {sportMeta(s).name}
              </label>
            ))}
          </div>
        </div>

        <button className="press rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-cream hover:opacity-90">
          Create draft
        </button>
      </form>
    </div>
  );
}
