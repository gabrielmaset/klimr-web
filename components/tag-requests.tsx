import { UserCheck } from "lucide-react";
import { respondToTag } from "@/app/feed/actions";

export type TagRequestItem = {
  tagId: string;
  taggerName: string;
  excerpt: string;
};

/** Consent surface for recap tags (decision #4). Shows only to the tagged
 *  player, only while pending. Your name appears nowhere until you approve —
 *  the card says exactly that, and one tap settles it forever (the 0134
 *  trigger allows a single response). */
export function TagRequests({ items }: { items: TagRequestItem[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-4 rounded-[18px] border border-brand/40 bg-tint-brand/40 p-4">
      <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[.14em] text-brand-deep">
        <UserCheck size={12} /> Tag requests · your call
      </p>
      <div className="mt-2 space-y-2">
        {items.map((it) => (
          <div key={it.tagId} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-rule bg-surface px-3 py-2 shadow-e1">
            <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink">
              <span className="font-semibold">{it.taggerName}</span> tagged you
              {it.excerpt ? <span className="text-mute"> — &ldquo;{it.excerpt}&rdquo;</span> : null}
              <span className="mt-0.5 block text-[11px] text-faint">Your name shows only if you approve.</span>
            </p>
            <span className="flex shrink-0 items-center gap-1.5">
              <form action={respondToTag}>
                <input type="hidden" name="tagId" value={it.tagId} />
                <input type="hidden" name="decision" value="approved" />
                <button className="press rounded-full bg-success px-3 py-1.5 text-xs font-semibold text-white hover:brightness-95">
                  Approve
                </button>
              </form>
              <form action={respondToTag}>
                <input type="hidden" name="tagId" value={it.tagId} />
                <input type="hidden" name="decision" value="declined" />
                <button className="press rounded-full border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:border-faint">
                  Decline
                </button>
              </form>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
