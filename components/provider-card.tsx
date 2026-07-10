import { BadgeCheck } from "lucide-react";
import { PROFESSIONAL_ROLES } from "@/lib/professional-roles";
import { ProviderReviews, type ReviewItem } from "@/components/provider-reviews";

const roleLabel = new Map(PROFESSIONAL_ROLES.map((r) => [r.key, r.label]));

export type ProviderCardData = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  hue: number;
  roles: string[];
  headline: string | null;
  bio: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  reviews: ReviewItem[];
};

/** A verified professional: identity, credential badge, roles, rating,
 *  and the shared review panel. Used on Health & Nutrition and Classes. */
export function ProviderCard({ p, viewerId, roleFilter }: { p: ProviderCardData; viewerId: string; roleFilter?: (key: string) => boolean }) {
  const shownRoles = p.roles.filter((r) => (roleFilter ? roleFilter(r) : true));
  return (
    <div className="rounded-3xl border border-rule bg-surface shadow-e1 p-5">
      <div className="flex items-start gap-3.5">
        {p.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-full border border-rule object-cover" />
        ) : (
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-base font-bold text-white" style={{ background: `oklch(0.62 0.14 ${p.hue})` }}>
            {p.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-[15px] font-bold text-ink">{p.name}</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-tint-success px-2 py-0.5 text-[10px] font-bold text-success">
              <BadgeCheck size={11} /> Credential verified
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {shownRoles.map((r) => (
              <span key={r} className="rounded-full border border-rule bg-bg px-2 py-0.5 text-[10.5px] font-semibold text-ink-soft">
                {roleLabel.get(r) ?? r}
              </span>
            ))}
          </div>
          {p.headline ? <p className="mt-2 text-sm font-semibold text-ink-soft">{p.headline}</p> : null}
          {p.bio ? <p className="mt-1 text-[13px] leading-relaxed text-mute">{p.bio}</p> : null}
          <div className="mt-3">
            <ProviderReviews providerUserId={p.userId} ratingAvg={p.ratingAvg} ratingCount={p.ratingCount} reviews={p.reviews} viewerId={viewerId} />
          </div>
        </div>
      </div>
    </div>
  );
}
