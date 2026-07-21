"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Zap } from "lucide-react";
import { togglePostLike, deleteOwnPost } from "@/app/feed/actions";

/** Heart + delete-own controls on a member post card. Optimistic heart. */
export function FeedPostActions({ postId, initialCount, initialLiked, mine }: { postId: string; initialCount: number; initialLiked: boolean; mine: boolean }) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-3 flex items-center gap-4">
      <button
        type="button"
        aria-pressed={liked}
        aria-label={liked ? "Undo ace" : "Ace this post"}
        onClick={() => {
          const next = !liked;
          setLiked(next);
          setCount((c) => c + (next ? 1 : -1));
          startTransition(async () => {
            const res = await togglePostLike(postId);
            if (!res.ok) {
              setLiked(!next);
              setCount((c) => c + (next ? -1 : 1));
            }
          });
        }}
        className="press inline-flex items-center gap-1.5 text-xs font-bold"
      >
        <Zap size={15} className={liked ? "fill-[#E23E0D] text-[#E23E0D]" : "text-mute"} />
        <span className={liked ? "text-[#E23E0D]" : "text-mute"}>{count > 0 ? count : ""}</span>
      </button>
      {mine ? (
        confirming ? (
          <span className="flex items-center gap-2 text-xs">
            <form
              action={(fd) => {
                fd.set("post_id", postId);
                startTransition(async () => {
                  await deleteOwnPost(fd);
                  router.refresh();
                });
              }}
            >
              <button disabled={pending} className="press font-bold text-[#b91c1c]">Delete?</button>
            </form>
            <button type="button" onClick={() => setConfirming(false)} className="press font-semibold text-mute">Keep</button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} aria-label="Delete post" className="press text-mute hover:text-[#b91c1c]">
            <Trash2 size={14} />
          </button>
        )
      ) : null}
    </div>
  );
}
