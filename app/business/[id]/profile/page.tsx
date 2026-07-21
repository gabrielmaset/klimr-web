import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { SportIcon } from "@/components/sport-icons";
import { updateBusiness } from "../../actions";
import { SPORT_KEYS, sportMeta } from "@/lib/sports";

export const metadata = { title: "Business profile · Klimr" };
export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-[10px] border border-rule-2 bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15";

export default async function BusinessProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/business/${id}/profile`);

  const [{ data: b }, { data: membership }] = await Promise.all([
    supabase
      .from("business_accounts")
      .select("id, name, headline, bio, website, contact_email, phone, area_text, sports")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("business_members").select("role").eq("business_id", id).eq("user_id", user.id).maybeSingle(),
  ]);
  if (!b) redirect("/settings");
  const canManage = membership?.role === "owner" || membership?.role === "manager";

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <PageHeader kicker="Business" title="Profile" sub="What players and sponsors see about this business." />

      {canManage ? (
        <form action={updateBusiness} className="mt-6 max-w-3xl rounded-2xl border border-rule bg-surface p-5 shadow-e1">
          <input type="hidden" name="businessId" value={b.id} />
          <input type="hidden" name="sports_present" value="1" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-faint" htmlFor="b-name">Name</label>
              <input id="b-name" name="name" defaultValue={b.name} minLength={2} maxLength={80} className={`mt-1.5 ${inputCls}`} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-faint" htmlFor="b-head">Headline</label>
              <input id="b-head" name="headline" defaultValue={b.headline ?? ""} maxLength={120} className={`mt-1.5 ${inputCls}`} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-faint" htmlFor="b-bio">About</label>
              <textarea id="b-bio" name="bio" defaultValue={b.bio ?? ""} maxLength={1200} rows={4} className={`mt-1.5 ${inputCls}`} />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-faint" htmlFor="b-web">Website</label>
              <input id="b-web" name="website" defaultValue={b.website ?? ""} maxLength={160} className={`mt-1.5 ${inputCls}`} />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-faint" htmlFor="b-mail">Contact email</label>
              <input id="b-mail" name="contact_email" defaultValue={b.contact_email ?? ""} maxLength={160} className={`mt-1.5 ${inputCls}`} />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-faint" htmlFor="b-phone">Phone</label>
              <input id="b-phone" name="phone" defaultValue={b.phone ?? ""} maxLength={40} className={`mt-1.5 ${inputCls}`} />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-faint" htmlFor="b-area">Area</label>
              <input id="b-area" name="area_text" defaultValue={b.area_text ?? ""} maxLength={80} className={`mt-1.5 ${inputCls}`} />
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-bold uppercase tracking-wider text-faint">Sports</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {SPORT_KEYS.map((s) => (
                  <label key={s} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-rule bg-surface px-3 py-1.5 text-sm text-ink transition-colors has-[:checked]:border-brand has-[:checked]:bg-tint-brand/50">
                    <input type="checkbox" name={`sport_${s}`} defaultChecked={b.sports.includes(s)} className="accent-[var(--color-brand)]" />
                    <SportIcon sport={s} variant="badge" size={15} /> {sportMeta(s).name}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <button className="press mt-4 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-cream hover:opacity-90">
            Save changes
          </button>
        </form>
      ) : (
        <p className="mt-6 rounded-2xl border border-rule bg-surface p-5 text-sm text-mute shadow-e1">
          Only owners and managers can edit the profile.
        </p>
      )}
    </div>
  );
}
