"use client";

import { useEffect, useState, useTransition } from "react";
import { CornerDownRight, Loader2, Send, Trash2 } from "lucide-react";
import { addPostComment, deleteOwnComment, listPostComments, type ThreadComment } from "@/app/feed/actions";

function timeShort(iso: string): string {
  const m = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** The comment thread under a Wire post: flat roots, exactly one reply level
 *  (the confirmed shape — the 0132 trigger backs it at the database). Loads
 *  lazily on first expand; after posting, the list re-fetches so what you see
 *  is exactly what everyone sees — the moderation pipeline already ran. */
export function PostThread({ postId, onCountChange }: { postId: string; onCountChange?: (n: number) => void }) {
  const [comments, setComments] = useState<ThreadComment[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ThreadComment | null>(null);
  const [pending, start] = useTransition();

  async function refresh() {
    const res = await listPostComments(postId);
    if (res.error) setErr(res.error);
    else {
      setComments(res.comments);
      onCountChange?.(res.comments.length);
    }
  }
  useEffect(() => {
    let live = true;
    void listPostComments(postId).then((res) => {
      if (!live) return;
      if (res.error) setErr(res.error);
      else setComments(res.comments);
    });
    return () => {
      live = false;
    };
  }, [postId]);

  function submit() {
    const body = draft.trim();
    if (!body) return;
    setErr(null);
    start(async () => {
      const res = await addPostComment({ postId, body, parentId: replyTo?.id ?? null });
      if (res.error) setErr(res.error);
      else {
        setDraft("");
        setReplyTo(null);
        await refresh();
      }
    });
  }

  function remove(id: string) {
    start(async () => {
      const res = await deleteOwnComment(id);
      if (res.error) setErr(res.error);
      else await refresh();
    });
  }

  const roots = (comments ?? []).filter((c) => !c.parentId);
  const repliesFor = (rootId: string) => (comments ?? []).filter((c) => c.parentId === rootId);

  return (
    <div className="border-t border-rule-soft bg-bg/50 px-4 py-3 pl-9">
      {comments === null && !err ? (
        <p className="flex items-center gap-1.5 text-xs text-faint">
          <Loader2 size={12} className="animate-spin" /> Loading comments…
        </p>
      ) : null}

      {roots.map((c) => (
        <div key={c.id} className="mb-2 last:mb-0">
          <div className="group flex items-start gap-2 text-[13px] leading-snug">
            <span className="min-w-0 flex-1">
              <span className="font-bold text-ink">{c.authorName}</span>{" "}
              <span className="text-mute">{c.body}</span>
            </span>
            <span className="shrink-0 font-mono text-[10px] font-semibold uppercase text-faint">{timeShort(c.createdAt)}</span>
            <button
              type="button"
              onClick={() => {
                setReplyTo(c);
                setErr(null);
              }}
              className="press shrink-0 text-[10px] font-bold uppercase tracking-wide text-faint hover:text-ink"
            >
              Reply
            </button>
            {c.mine ? (
              <button
                type="button"
                aria-label="Delete comment"
                onClick={() => remove(c.id)}
                className="press shrink-0 text-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
              >
                <Trash2 size={12} />
              </button>
            ) : null}
          </div>
          {repliesFor(c.id).map((r) => (
            <div key={r.id} className="group mt-1.5 flex items-start gap-2 pl-5 text-[13px] leading-snug">
              <CornerDownRight size={12} className="mt-0.5 shrink-0 text-faint" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="font-bold text-ink">{r.authorName}</span>{" "}
                <span className="text-mute">{r.body}</span>
              </span>
              <span className="shrink-0 font-mono text-[10px] font-semibold uppercase text-faint">{timeShort(r.createdAt)}</span>
              {r.mine ? (
                <button
                  type="button"
                  aria-label="Delete reply"
                  onClick={() => remove(r.id)}
                  className="press shrink-0 text-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                >
                  <Trash2 size={12} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ))}

      {comments !== null && roots.length === 0 && !err ? (
        <p className="text-xs text-faint">No comments yet — start the conversation.</p>
      ) : null}
      {err ? <p className="mt-1 text-xs font-semibold text-danger">{err}</p> : null}

      <div className="mt-2.5">
        {replyTo ? (
          <p className="mb-1 flex items-center gap-1.5 text-[11px] text-faint">
            <CornerDownRight size={11} /> Replying to <span className="font-bold text-mute">{replyTo.authorName}</span>
            <button type="button" onClick={() => setReplyTo(null)} className="press font-bold uppercase tracking-wide hover:text-ink">
              · cancel
            </button>
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            maxLength={500}
            placeholder={replyTo ? "Write a reply…" : "Add a comment…"}
            className="w-full rounded-full border border-rule bg-surface px-3.5 py-1.5 text-[13px] text-ink placeholder:text-faint focus:outline-none"
          />
          <button
            type="button"
            onClick={submit}
            disabled={pending || !draft.trim()}
            aria-label="Post comment"
            className="press inline-flex shrink-0 items-center justify-center rounded-full bg-ink p-2 text-cream disabled:opacity-40"
          >
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          </button>
        </div>
      </div>
    </div>
  );
}
