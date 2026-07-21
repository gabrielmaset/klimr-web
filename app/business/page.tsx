import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Briefcase, ChevronRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { kindLabel, TIER_LABEL, BUSINESS_STATUS_LABEL } from "@/lib/business";

export const metadata = { title: "Your businesses · Klimr" };
export const dynamic = "force-dynamic";

/** Console index — dark behind `business_publication`: one flag lights the
 *  console and the public pages together, no half-visible states. */
export default async function BusinessIndex() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/business");

  const { data: flag } = await supabase.from("feature_flags").select("enabled").eq("key", "business_publication").maybeSingle();
  if (!flag?.enabled) notFound();

  const { data: memberships } = await supabase
    .from("business_members")
    .select("business_id, role")
    .eq("user_id", user.id);
  const ids = (memberships ?? []).map((m) => m.business_id);
  const roleOf = new Map((memberships ?? []).map((m) => [m.business_id, m.role]));
  const { data: businesses } = ids.length
    ? await supabase
        .from("business_accounts")
        .select("id, kind, name, headline, verification_level, status, published")
        .in("id", ids)
        .order("created_at", { ascending: false })
    : { data: [] as never[] };

  const list = (businesses ?? []) as {
    id: string; kind: string; name: string; headline: string | null;
    verification_level: string; status: string; published: boolean;
  }[];

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <PageHeader
        kicker="Business"
        title="Your businesses"
        sub="Professional profiles, venues, shops, clubs, and brands — managed in one place."
      />

      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="text-sm text-mute">{list.length ? `${list.length} business${list.length === 1 ? "" : "es"}` : "Nothing here yet."}</p>
        <Link
          href="/business/new"
          className="press inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-cream hover:opacity-90"
        >
          <Plus size={15} /> New business
        </Link>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {list.map((b) => (
          <Link
            key={b.id}
            href={`/business/${b.id}`}
            className="group flex items-center gap-3 rounded-2xl border border-rule bg-surface p-4 shadow-e1 transition-colors hover:border-faint"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-tint-brand text-brand-deep">
              <Briefcase size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-ink">{b.name}</span>
              <span className="block truncate text-xs text-mute">
                {kindLabel(b.kind)} · {TIER_LABEL[b.verification_level] ?? b.verification_level} ·{" "}
                {BUSINESS_STATUS_LABEL[b.status] ?? b.status}
                {b.published ? " · Listed" : ""} · you&rsquo;re {roleOf.get(b.id)}
              </span>
              {b.headline ? <span className="mt-0.5 block truncate text-xs text-faint">{b.headline}</span> : null}
            </span>
            <ChevronRight size={16} className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </div>
  );
}
