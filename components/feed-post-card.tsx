"use client";

import { useState, useTransition } from "react";
import { BadgeCheck, MessagesSquare, Send, Link2, MessageCircle, Play, Trophy, Loader2 } from "lucide-react";
import { SportIcon } from "@/components/sport-icons";
import { sportMeta } from "@/lib/sports";
import { togglePostLike, addPostComment, listPostComments, type ThreadComment } from "@/app/feed/actions";

/** Ace = the tennis-ball like. Inline SVG (no lucide equivalent). */
function TennisBall({ size = 16, filled = false }: { size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" />
      <path
        d="M4.2 8.4c3 1.1 5 3.4 5 6.9M19.8 15.6c-3-1.1-5-3.4-5-6.9"
        stroke={filled ? "#FFF0E8" : "currentColor"}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export const POST_TYPE_LABEL: Record<string, { label: string; color: string }> = {
  post: { label: "POST", color: "#6E6555" },
  match: { label: "MATCH REPORT", color: "#C2410C" },
  photo: { label: "PHOTO", color: "#BE185D" },
  video: { label: "HIGHLIGHT", color: "#7C3AED" },
  ask: { label: "QUESTION", color: "#1D4ED8" },
  milestone: { label: "MILESTONE", color: "#A16207" },
};

export type FeedPostView = {
  id: string;
  type: string;
  authorId: string;
  name: string;
  initials: string;
  hue: number;
  verified: boolean;
  sport: string | null;
  meta: string; // "Mar Vista · 1H AGO"
  text: string | null;
  mediaUrl: string | null;
  durationLabel: string | null;
  match: { winner: string; opponent: string; score: string; court: string } | null;
  milestone: { label?: string; rank?: string; place?: string } | null;
  aces: number;
  aced: boolean;
  comments: number;
};

const disc = (h: number) => `linear-gradient(145deg, hsl(${h},70%,52%), hsl(${(h + 24) % 360},66%,42%))`;
const hueOf = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
};
const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "K";
const SPORT_CHIP: Record<string, string> = {
  tennis: "border-[#DCEBC0] bg-[#F1F8E3] text-[#4D7C0F]",
  pickleball: "border-[#F7D2E2] bg-[#FDEDF4] text-[#BE185D]",
  padel: "border-[#F1E0B6] bg-[#FDF3DD] text-[#B45309]",
  racquetball: "border-[#CDDEFA] bg-[#EAF1FE] text-[#1D4ED8]",
  beach_volleyball: "border-[#F9DAC0] bg-[#FEF0E4] text-[#C2410C]",
};

export function FeedPostCard({ post, viewer }: { post: FeedPostView; viewer: { initials: string; hue: number } }) {
  const t = POST_TYPE_LABEL[post.type] ?? POST_TYPE_LABEL.post;
  const [aced, setAced] = useState(post.aced);
  const [aces, setAces] = useState(post.aces);
  const [pop, setPop] = useState(false);
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<ThreadComment[] | null>(null);
  const [count, setCount] = useState(post.comments);
  const [draft, setDraft] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [sharedNote, setSharedNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ace = () => {
    const next = !aced;
    setAced(next);
    setAces((n) => n + (next ? 1 : -1));
    if (next) {
      setPop(true);
      window.setTimeout(() => setPop(false), 380);
    }
    startTransition(async () => {
      const res = await togglePostLike(post.id);
      if (!res.ok) {
        setAced(!next);
        setAces((n) => n + (next ? -1 : 1));
      }
    });
  };

  const toggleThread = () => {
    const next = !open;
    setOpen(next);
    if (next && thread === null) {
      startTransition(async () => {
        const res = await listPostComments(post.id);
        setThread(res.comments);
        setCount(res.comments.length);
      });
    }
  };

  const reply = () => {
    const text = draft.trim();
    if (!text || pending) return;
    startTransition(async () => {
      const res = await addPostComment({ postId: post.id, body: text });
      if (res.ok) {
        setDraft("");
        const fresh = await listPostComments(post.id);
        setThread(fresh.comments);
        setCount(fresh.comments.length);
      }
    });
  };

  const postUrl = () => `${window.location.origin}/feed?post=${post.id}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(postUrl());
      setSharedNote("LINK COPIED");
    } catch {
      setSharedNote(null);
    }
    setShareOpen(false);
  };
  const sendToChat = async () => {
    try {
      await navigator.clipboard.writeText(postUrl());
    } catch {
      /* clipboard optional */
    }
    setSharedNote("LINK COPIED — PICK A CHAT");
    setShareOpen(false);
    window.location.href = "/chats";
  };

  const sm = post.sport ? sportMeta(post.sport) : null;

  return (
    <article className="rounded-2xl border border-rule bg-surface px-5 pb-2 pt-[17px] shadow-e1">
      <style>{`@keyframes klimrAcePop{0%{transform:scale(1)}40%{transform:scale(1.28) rotate(-8deg)}100%{transform:scale(1)}}@media (prefers-reduced-motion: reduce){.klimr-ace-pop{animation:none!important}}`}</style>

      <div className="flex items-center gap-[11px]">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: disc(post.hue) }}>
          {post.initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold tracking-[-0.01em] text-ink">{post.name}</span>
            {post.verified ? <BadgeCheck size={14} className="shrink-0 text-[#D63A0F]" /> : null}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="font-mono text-[9px] font-bold tracking-[0.13em]" style={{ color: t.color }}>
              {t.label}
            </span>
            <span className="font-mono text-[9.5px] text-faint">{post.meta}</span>
          </div>
        </div>
        {sm && post.sport ? (
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-[9px] border px-2.5 py-1 text-[11px] font-bold ${SPORT_CHIP[post.sport] ?? "border-rule-2 bg-bg text-mute"}`}>
            <SportIcon sport={post.sport} variant="glyph" size={14} /> {sm.name}
          </span>
        ) : null}
      </div>

      {post.text ? <p className="mb-0 mt-3 text-sm leading-relaxed text-[#33302B]">{post.text}</p> : null}

      {post.type === "match" && post.match ? (
        <div className="mt-3 flex items-center gap-4 rounded-[13px] border border-rule-soft bg-bg px-4 py-[13px]">
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-bold text-ink">
              {post.match.winner} <span className="font-mono text-[9px] font-bold tracking-[0.1em] text-[#217A34]">WIN</span>
            </p>
            <p className="mt-0.5 text-[13.5px] font-semibold text-mute">{post.match.opponent}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-[19px] font-bold tracking-[-0.02em] text-ink">{post.match.score}</p>
            <p className="mt-0.5 font-mono text-[9.5px] uppercase text-faint">{post.match.court}</p>
          </div>
        </div>
      ) : null}

      {post.type === "photo" && post.mediaUrl ? (
        <div className="mt-3 overflow-hidden rounded-[13px] border border-rule-soft">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.mediaUrl} alt={post.text ?? "Photo"} className="block max-h-[420px] w-full bg-bg object-cover" loading="lazy" />
        </div>
      ) : null}

      {post.type === "video" && post.mediaUrl ? (
        <div className="relative mt-3 overflow-hidden rounded-[13px] border border-rule-soft">
          <video src={post.mediaUrl} className="block max-h-[420px] w-full bg-ink/90 object-contain" controls playsInline preload="metadata" />
          <span className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2">
            <span className="grid h-[54px] w-[54px] place-items-center rounded-full bg-ink/50">
              <Play size={22} className="ml-0.5 text-white" fill="white" />
            </span>
          </span>
          {post.durationLabel ? (
            <span className="pointer-events-none absolute bottom-2.5 right-2.5 rounded-md bg-ink/60 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
              {post.durationLabel}
            </span>
          ) : null}
        </div>
      ) : null}

      {post.type === "ask" ? (
        <div className="mt-3 flex items-center gap-[11px] rounded-r-[13px] rounded-l-md border border-[#CDDEFA] border-l-[3px] border-l-[#1D4ED8] bg-[#EFF4FE] px-[15px] py-[11px]">
          <MessagesSquare size={18} className="shrink-0 text-[#1D4ED8]" />
          <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-[#1D4ED8]">Asking players nearby — got an answer? Drop it below.</span>
          <span className="shrink-0 font-mono text-[10px] text-[#5A7BC4]">{count} REPLIES</span>
        </div>
      ) : null}

      {post.type === "milestone" && post.milestone?.rank ? (
        <div className="mt-3 flex items-center gap-3.5 rounded-[13px] bg-[linear-gradient(140deg,#FF6A35,#D63A0F)] px-4 py-[13px] text-white">
          <span className="font-display text-[30px] font-bold tracking-[-0.03em]">{post.milestone.rank}</span>
          <div className="flex-1">
            <p className="font-mono text-[9px] font-bold tracking-[0.16em] text-white/75">NEW ALTITUDE</p>
            <p className="mt-0.5 text-[12.5px] font-semibold">{post.milestone.place}</p>
          </div>
          <svg viewBox="0 0 120 40" width="120" height="40" className="shrink-0" aria-hidden>
            <path d="M4,34 L34,26 L58,29 L86,14 L116,6" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="2" strokeLinecap="round" />
            <circle cx="116" cy="6" r="4" fill="#FFE249" />
          </svg>
        </div>
      ) : null}

      {post.type === "milestone" && !post.milestone?.rank ? (
        <div className="mt-3 flex items-center gap-3 rounded-[13px] bg-[linear-gradient(140deg,#F6CD1F,#D9A70B)] px-4 py-3 text-[#4A3708]">
          <Trophy size={22} className="shrink-0" />
          <div className="flex-1">
            <p className="font-mono text-[9px] font-bold tracking-[0.16em]">ACHIEVEMENT</p>
            <p className="mt-px text-[12.5px] font-bold">{post.milestone?.label || "Milestone shared with your courts"}</p>
          </div>
        </div>
      ) : null}

      <div className="relative mt-3.5 flex items-center gap-1 border-t border-rule-soft py-[7px]">
        <button
          type="button"
          onClick={ace}
          className={`press inline-flex h-8 items-center gap-[7px] rounded-[9px] px-3 text-[12.5px] font-bold transition-colors ${
            aced ? "bg-tint-brand text-brand-deep" : "text-mute hover:bg-tint-brand hover:text-brand-deep"
          }`}
        >
          <span className={pop ? "klimr-ace-pop" : ""} style={pop ? { animation: "klimrAcePop .35s ease" } : undefined}>
            <TennisBall size={16} filled={aced} />
          </span>
          Ace <span className="font-mono text-[10.5px] font-semibold">{aces}</span>
        </button>
        <button
          type="button"
          onClick={toggleThread}
          className="press inline-flex h-8 items-center gap-[7px] rounded-[9px] px-3 text-[12.5px] font-bold text-mute transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <MessageCircle size={16} /> Comments <span className="font-mono text-[10.5px] font-semibold">{count}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setShareOpen((o) => !o);
            setSharedNote(null);
          }}
          className="press inline-flex h-8 items-center gap-[7px] rounded-[9px] px-3 text-[12.5px] font-bold text-mute transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <Send size={15} /> Share
        </button>
        {sharedNote ? <span className="font-mono text-[9.5px] text-[#217A34]">{sharedNote}</span> : null}
        {shareOpen ? (
          <div className="absolute bottom-11 left-[170px] z-20 w-[220px] rounded-xl border border-rule-2 bg-surface p-1.5 shadow-e3">
            <button
              type="button"
              onClick={sendToChat}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold text-ink hover:bg-hover"
            >
              <MessageCircle size={15} className="text-brand-deep" /> Send to a chat
            </button>
            <button
              type="button"
              onClick={copyLink}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold text-ink hover:bg-hover"
            >
              <Link2 size={15} className="text-brand-deep" /> Copy link
            </button>
            <p className="mt-1 border-t border-rule-soft px-2.5 pb-1 pt-[7px] text-[10.5px] leading-snug text-faint">
              No reposts on Klimr — sharing is person-to-person.
            </p>
          </div>
        ) : null}
      </div>

      {open ? (
        <div className="flex flex-col gap-[11px] border-t border-rule-soft pb-3.5 pt-3">
          {thread === null ? (
            <p className="flex items-center gap-2 text-xs text-faint">
              <Loader2 size={12} className="animate-spin" /> Loading the thread…
            </p>
          ) : (
            thread.map((c) => (
              <div key={c.id} className="flex gap-2.5">
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10.5px] font-bold text-white"
                  style={{ background: disc(hueOf(c.authorName)) }}
                >
                  {initialsOf(c.authorName)}
                </span>
                <div className="min-w-0 flex-1 rounded-r-xl rounded-bl-xl rounded-tl-[4px] border border-rule-soft bg-bg px-3 py-2">
                  <span className="text-xs font-bold text-ink">{c.authorName}</span>
                  <span className="mt-px block text-[12.5px] leading-normal text-[#4A453C]">{c.body}</span>
                </div>
              </div>
            ))
          )}
          <div className="flex items-center gap-2.5">
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10.5px] font-bold text-white"
              style={{ background: disc(viewer.hue) }}
            >
              {viewer.initials}
            </span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") reply();
              }}
              placeholder="Add a comment…"
              aria-label="Add a comment"
              className="h-[34px] min-w-0 flex-1 rounded-[10px] border border-rule-2 bg-ink/[0.03] px-3 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/10"
            />
            <button
              type="button"
              onClick={reply}
              className="press h-[34px] rounded-[10px] border border-rule-2 bg-surface px-3 text-xs font-bold text-ink hover:bg-hover"
            >
              Reply
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
