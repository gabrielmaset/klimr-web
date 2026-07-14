"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Share2, Ban, Flag, Check } from "lucide-react";
import { blockUser, reportUser } from "@/app/profile/[id]/actions";

const REASONS = [
  { value: "harassment", label: "Harassment or bullying" },
  { value: "cheating", label: "Cheating / false results" },
  { value: "no_show", label: "No-show" },
  { value: "inappropriate", label: "Inappropriate behavior" },
  { value: "fake_profile", label: "Fake profile" },
  { value: "other", label: "Something else" },
];

/** The ··· menu — Message, Share, and (only here, per the design) Block & Report. */
export function ProfileMenu({ userId, name, alreadyReported }: { userId: string; name: string; alreadyReported: boolean }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "block" | "report">("menu");
  const [copied, setCopied] = useState(false);
  const [reason, setReason] = useState("harassment");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "press flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-semibold";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="More actions"
        aria-expanded={open}
        onClick={() => setOpen((v) => { if (v) return false; setMode("menu"); return true; })}
        className="press grid h-9 w-9 place-items-center rounded-full border border-rule-2 bg-surface text-ink-soft transition-colors hover:text-ink"
      >
        <MoreHorizontal size={16} />
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-30 w-64 rounded-2xl border border-rule bg-surface p-2 shadow-e2">
          {mode === "menu" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(window.location.href).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  });
                }}
                className={`${item} text-ink hover:bg-bg`}
              >
                {copied ? <Check size={15} className="text-success" /> : <Share2 size={15} />} {copied ? "Link copied" : "Share profile"}
              </button>
              <div className="my-1.5 border-t border-rule-soft" />
              <button type="button" onClick={() => setMode("block")} className={`${item} text-[#D92D20] hover:bg-[#FDECEA]`}>
                <Ban size={15} /> Block
              </button>
              <button type="button" disabled={alreadyReported} onClick={() => setMode("report")} className={`${item} text-[#D92D20] hover:bg-[#FDECEA] disabled:opacity-50`}>
                <Flag size={15} /> {alreadyReported ? "Reported" : "Report"}
              </button>
            </>
          ) : mode === "block" ? (
            <div className="p-2">
              <p className="text-[13px] font-bold text-ink">Block {name.split(" ")[0]}?</p>
              <p className="mt-1 text-xs leading-relaxed text-mute">They disappear from your feed, invites, and matching — and any connection or follows are removed. They aren&rsquo;t told.</p>
              <div className="mt-3 flex gap-2">
                <form action={blockUser} className="flex-1">
                  <input type="hidden" name="userId" value={userId} />
                  <button className="press w-full rounded-full bg-[#D92D20] px-3 py-2 text-xs font-bold text-white hover:brightness-105">Block</button>
                </form>
                <button type="button" onClick={() => setMode("menu")} className="press rounded-full border border-rule-2 px-3 py-2 text-xs font-semibold text-ink-soft">Cancel</button>
              </div>
            </div>
          ) : (
            <form action={reportUser} className="p-2">
              <input type="hidden" name="userId" value={userId} />
              <p className="text-[13px] font-bold text-ink">Report {name.split(" ")[0]}</p>
              <select name="reason" value={reason} onChange={(e) => setReason(e.target.value)} className="mt-2 h-9 w-full rounded-[10px] border border-rule-2 bg-bg px-2 text-xs font-semibold text-ink outline-none">
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <textarea name="context" rows={2} maxLength={500} placeholder="Anything our team should know (optional)" className="mt-2 w-full resize-y rounded-[10px] border border-rule-2 bg-bg px-3 py-2 text-xs text-ink outline-none placeholder:text-faint" />
              <div className="mt-2 flex gap-2">
                <button className="press flex-1 rounded-full bg-[#D92D20] px-3 py-2 text-xs font-bold text-white hover:brightness-105">Send report</button>
                <button type="button" onClick={() => setMode("menu")} className="press rounded-full border border-rule-2 px-3 py-2 text-xs font-semibold text-ink-soft">Back</button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
