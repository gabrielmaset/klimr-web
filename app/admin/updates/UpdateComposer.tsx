"use client";

import { useActionState, useEffect, useRef } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { createFeedItem } from "../actions";
import { SPORTS } from "@/lib/sports";

const field = "w-full rounded-xl border border-rule bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-brand";

export function UpdateComposer() {
  const [state, action, pending] = useActionState(createFeedItem, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state?.ok]);

  return (
    <form ref={formRef} action={action} className="mt-5 rounded-2xl border border-rule bg-surface p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="kicker text-faint">Type</span>
          <select name="kind" defaultValue="announcement" className={`mt-1 ${field}`}>
            <option value="announcement">Announcement</option>
            <option value="news">News</option>
            <option value="result">Match result</option>
            <option value="update">Product update</option>
          </select>
        </label>
        <label className="block">
          <span className="kicker text-faint">Sport (optional)</span>
          <select name="sport_key" defaultValue="" className={`mt-1 ${field}`}>
            <option value="">None</option>
            {SPORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.emoji} {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-3 block">
        <span className="kicker text-faint">Title (optional)</span>
        <input name="title" maxLength={120} className={`mt-1 ${field}`} placeholder="Headline" />
      </label>

      <label className="mt-3 block">
        <span className="kicker text-faint">Body</span>
        <textarea name="body" rows={4} maxLength={2000} required className={`mt-1 resize-none ${field}`} placeholder="What's the update?" />
      </label>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="kicker text-faint">Link URL (optional)</span>
          <input name="link_url" className={`mt-1 ${field}`} placeholder="/rankings or https://…" />
        </label>
        <label className="block">
          <span className="kicker text-faint">Link label (optional)</span>
          <input name="link_label" maxLength={40} className={`mt-1 ${field}`} placeholder="View rankings" />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="press inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft disabled:opacity-60"
        >
          {pending ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Publishing…
            </>
          ) : (
            "Publish"
          )}
        </button>
        {state?.ok ? (
          <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: "#16a34a" }}>
            <CheckCircle2 size={15} /> Published — it&rsquo;s live in the feed for all members.
          </span>
        ) : null}
        {state?.error ? <span className="text-sm" style={{ color: "#d63a0f" }}>{state.error}</span> : null}
      </div>
    </form>
  );
}
