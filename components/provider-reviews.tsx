"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, Loader2, Trash2 } from "lucide-react";
import { upsertProviderReview, deleteProviderReview } from "@/app/health/review-actions";

export type ReviewItem = { id: string; reviewerId: string; reviewerName: string; rating: number; body: string | null; createdAt: string };

export function Stars({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} className={i <= Math.round(value) ? "fill-[#E9A23B] text-[#E9A23B]" : "text-rule-2"} />
      ))}
    </span>
  );
}

/** Uber-style member reviews for a verified professional: aggregate stars,
 *  the list, and the viewer's own editable review (never for themselves). */
export function ProviderReviews({
  providerUserId,
  ratingAvg,
  ratingCount,
  reviews,
  viewerId,
}: {
  providerUserId: string;
  ratingAvg: number | null;
  ratingCount: number;
  reviews: ReviewItem[];
  viewerId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const mine = reviews.find((r) => r.reviewerId === viewerId) ?? null;
  const [stars, setStars] = useState<number>(mine?.rating ?? 0);
  const [body, setBody] = useState(mine?.body ?? "");
  const [err, setErr] = useState<string | null>(null);
  const isSelf = viewerId === providerUserId;

  const save = () => {
    setErr(null);
    startTransition(async () => {
      const res = await upsertProviderReview(providerUserId, stars, body);
      if (!res.ok) setErr(res.error ?? "Couldn't save your review.");
      else router.refresh();
    });
  };
  const remove = () => {
    setErr(null);
    startTransition(async () => {
      const res = await deleteProviderReview(providerUserId);
      if (!res.ok) setErr(res.error ?? "Couldn't remove your review.");
      else {
        setStars(0);
        setBody("");
        router.refresh();
      }
    });
  };

  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="press inline-flex items-center gap-2 text-xs font-semibold text-ink-soft hover:text-ink" aria-expanded={open}>
        {ratingCount > 0 ? (
          <>
            <Stars value={ratingAvg ?? 0} />
            <span className="text-ink">{(ratingAvg ?? 0).toFixed(1)}</span>
            <span className="text-mute">({ratingCount} {ratingCount === 1 ? "review" : "reviews"})</span>
          </>
        ) : (
          <span className="text-mute">No reviews yet — be the first</span>
        )}
        <span className="text-brand-deep">{open ? "Hide" : isSelf ? "View" : "Read & write"}</span>
      </button>

      {open ? (
        <div className="mt-3 grid gap-3 border-t border-rule-soft pt-3">
          {reviews.filter((r) => r.reviewerId !== viewerId).map((r) => (
            <div key={r.id} className="rounded-xl border border-rule-soft bg-bg p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-bold text-ink">{r.reviewerName}</p>
                <Stars value={r.rating} size={11} />
                <span className="text-[10px] text-faint">{new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              </div>
              {r.body ? <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{r.body}</p> : null}
            </div>
          ))}
          {reviews.length === 0 ? <p className="text-xs text-mute">No written reviews yet.</p> : null}

          {!isSelf ? (
            <div className="rounded-xl border border-rule bg-surface p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-faint">{mine ? "Your review" : "Write a review"}</p>
              <div className="mt-1.5 flex items-center gap-1" role="radiogroup" aria-label="Your rating">
                {[1, 2, 3, 4, 5].map((i) => (
                  <button key={i} type="button" role="radio" aria-checked={stars === i} aria-label={`${i} star${i > 1 ? "s" : ""}`} onClick={() => setStars(i)} className="press">
                    <Star size={20} className={i <= stars ? "fill-[#E9A23B] text-[#E9A23B]" : "text-rule-2 hover:text-[#E9A23B]"} />
                  </button>
                ))}
              </div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="How was working with this pro? (optional)"
                className="mt-2 w-full resize-y rounded-[10px] border border-rule-2 bg-bg px-3 py-2 text-[13px] text-ink outline-none placeholder:text-faint focus:border-brand"
              />
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button type="button" onClick={save} disabled={pending || stars === 0} className="press inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-xs font-bold text-surface hover:bg-ink-soft disabled:opacity-50">
                  {pending ? <Loader2 size={13} className="animate-spin" /> : null} {mine ? "Update review" : "Post review"}
                </button>
                {mine ? (
                  <button type="button" onClick={remove} disabled={pending} className="press inline-flex items-center gap-1 text-xs font-semibold text-mute hover:text-danger">
                    <Trash2 size={12} /> Remove
                  </button>
                ) : null}
                {err ? <span className="text-xs font-semibold text-danger">{err}</span> : null}
              </div>
              <p className="mt-2 text-[10px] text-faint">Reviews come from Klimr members and are tied to your real name — one per pro, editable anytime.</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
