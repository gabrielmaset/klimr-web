"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { SPORTS } from "@/lib/sports";
import { createFeedPost } from "@/app/feed/actions";

/** Share something with players nearby — posts land on the regional wire. */
export function FeedComposer() {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [sport, setSport] = useState("");
  const [pending, startTransition] = useTransition();

  const post = () => {
    if (body.trim().length < 2 || pending) return;
    const fd = new FormData();
    fd.set("body", body.trim());
    fd.set("sport", sport);
    startTransition(async () => {
      await createFeedPost(fd);
      setBody("");
      setSport("");
      router.refresh();
    });
  };

  return (
    <div className="mt-3 rounded-[18px] border border-rule bg-surface p-3.5 shadow-e1">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={body ? 3 : 1}
        maxLength={500}
        placeholder="Share something with players nearby…"
        aria-label="Write a post"
        className="w-full resize-y rounded-[12px] border border-rule-soft bg-[#FDFBF7] px-3.5 py-2.5 text-[13.5px] text-ink outline-none placeholder:text-faint focus:border-brand"
      />
      {body ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <select value={sport} onChange={(e) => setSport(e.target.value)} aria-label="Tag a sport" className="h-8 rounded-[10px] border border-rule-2 bg-surface px-2 text-xs font-semibold text-ink outline-none">
            <option value="">No sport tag</option>
            {SPORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-[10px] text-faint">{body.length}/500</span>
            <button type="button" onClick={post} disabled={pending || body.trim().length < 2} className="press inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold text-white disabled:opacity-50" style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Post
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
