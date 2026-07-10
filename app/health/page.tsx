import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HeartPulse, BookOpen, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PROFESSIONAL_ROLES } from "@/lib/professional-roles";
import { HEALTH_ARTICLES } from "@/lib/health-content";
import { ProviderCard, type ProviderCardData } from "@/components/provider-card";
import type { ReviewItem } from "@/components/provider-reviews";

export const metadata: Metadata = { title: "Health & Nutrition — Klimr" };

const HEALTH_KEYS = new Set(PROFESSIONAL_ROLES.filter((r) => r.category === "health").map((r) => r.key));

export default async function HealthPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/health");

  // Approved professionals with at least one health-category role.
  const { data: provs } = await supabase
    .from("class_providers")
    .select("user_id, roles, headline, bio, rating_avg, rating_count")
    .eq("status", "approved")
    .or(`credential_expires_at.is.null,credential_expires_at.gt.${new Date().toISOString()}`);
  const healthProviders = (provs ?? []).filter((p) => (p.roles ?? []).some((r) => HEALTH_KEYS.has(r)));

  const ids = healthProviders.map((p) => p.user_id);
  const nameById = new Map<string, { name: string; hue: number; avatarUrl: string | null }>();
  const reviewsByProvider = new Map<string, ReviewItem[]>();
  if (ids.length) {
    const { data: profiles } = await supabase.from("profiles").select("id, display_name, avatar_hue, avatar_path").in("id", ids);
    for (const p of profiles ?? []) {
      nameById.set(p.id, {
        name: p.display_name ?? "Professional",
        hue: p.avatar_hue ?? 200,
        avatarUrl: p.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null,
      });
    }
    const { data: reviews } = await supabase
      .from("provider_reviews")
      .select("id, provider_user_id, reviewer_id, rating, body, created_at")
      .in("provider_user_id", ids)
      .order("created_at", { ascending: false })
      .limit(400);
    const reviewerIds = [...new Set((reviews ?? []).map((r) => r.reviewer_id))];
    const reviewerName = new Map<string, string>();
    if (reviewerIds.length) {
      const { data: rn } = await supabase.from("profiles").select("id, display_name").in("id", reviewerIds);
      for (const x of rn ?? []) reviewerName.set(x.id, x.display_name ?? "Member");
    }
    for (const r of reviews ?? []) {
      const item: ReviewItem = { id: r.id, reviewerId: r.reviewer_id, reviewerName: reviewerName.get(r.reviewer_id) ?? "Member", rating: r.rating, body: r.body, createdAt: r.created_at };
      if (!reviewsByProvider.has(r.provider_user_id)) reviewsByProvider.set(r.provider_user_id, []);
      reviewsByProvider.get(r.provider_user_id)!.push(item);
    }
  }

  const cards: ProviderCardData[] = healthProviders
    .map((p) => ({
      userId: p.user_id,
      name: nameById.get(p.user_id)?.name ?? "Professional",
      avatarUrl: nameById.get(p.user_id)?.avatarUrl ?? null,
      hue: nameById.get(p.user_id)?.hue ?? 200,
      roles: p.roles ?? [],
      headline: p.headline,
      bio: p.bio,
      ratingAvg: p.rating_avg != null ? Number(p.rating_avg) : null,
      ratingCount: p.rating_count ?? 0,
      reviews: reviewsByProvider.get(p.user_id) ?? [],
    }))
    .sort((a, b) => (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0) || b.ratingCount - a.ratingCount || a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-flame-text">Discover — Health &amp; Nutrition</p>
          <h1 className="mt-1.5 font-display text-[40px] font-bold leading-none tracking-[-0.025em] text-ink">Health &amp; Nutrition</h1>
          <p className="mt-1 max-w-2xl text-sm text-mute">
            Credential-verified sports-health professionals — rated by the members who work with them — plus a practical library built for racquet and beach athletes.
          </p>
        </div>
        <Link href="/settings/professional" className="press flex shrink-0 items-center gap-1.5 rounded-full border border-rule-2 bg-surface px-4 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:text-ink">
          <HeartPulse size={15} /> Offer your services
        </Link>
      </div>

      <section>
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          Verified professionals
          {cards.length ? <span className="rounded-full bg-tint-brand px-2 py-0.5 text-[11px] font-semibold text-brand-deep">{cards.length}</span> : null}
        </h2>
        <p className="mt-1 text-xs text-mute">Every credential is checked against its issuing body before a pro appears here. Sessions and payment are arranged directly with the professional.</p>
        {cards.length ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {cards.map((p) => (
              <ProviderCard key={p.userId} p={p} viewerId={user.id} roleFilter={(k) => HEALTH_KEYS.has(k)} />
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-3xl border border-dashed border-rule-2 bg-surface p-8 text-center">
            <p className="text-sm font-semibold text-ink">No health professionals yet — be the first.</p>
            <p className="mt-1 text-sm text-mute">Dietitians, physical therapists, athletic trainers, sports massage, and mental-performance pros can apply in minutes.</p>
            <Link href="/settings/professional" className="press mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep">
              Apply as a professional <ArrowRight size={15} />
            </Link>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <BookOpen size={15} className="text-brand-deep" /> The Training Table
        </h2>
        <p className="mt-1 text-xs text-mute">Short, practical reads for players — fueling, recovery, and staying on court.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {HEALTH_ARTICLES.map((a) => (
            <details key={a.slug} className="group rounded-3xl border border-rule bg-surface shadow-e1 p-5 open:pb-6">
              <summary className="cursor-pointer list-none">
                <p className="font-mono text-[9px] font-bold uppercase tracking-[.18em] text-flame-text">{a.kicker} · {a.minutes} min</p>
                <h3 className="mt-1 font-display text-lg font-bold leading-snug text-ink group-open:text-brand-deep">{a.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-mute">{a.summary}</p>
                <span className="mt-2 inline-block text-xs font-semibold text-brand-deep group-open:hidden">Read →</span>
              </summary>
              <div className="mt-4 grid gap-3 border-t border-rule-soft pt-4">
                {a.sections.map((s) => (
                  <div key={s.h}>
                    <p className="text-[13px] font-bold text-ink">{s.h}</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-ink-soft">{s.body}</p>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-faint">
          The Training Table is general education for healthy athletes, not medical or dietetic advice. For anything personal — injuries, conditions, medications, or individual nutrition plans — work with one of the verified professionals above or your own clinician.
        </p>
      </section>
    </div>
  );
}
