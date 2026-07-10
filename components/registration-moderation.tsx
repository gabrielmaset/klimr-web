"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { setEntryModeration, type ModerationAction } from "@/app/tournament/[id]/registrations/actions";

const ACTIONS: { value: ModerationAction; label: string; destructive: boolean; needsNote?: boolean; noteHint?: string }[] = [
  { value: "under_review", label: "Put under review (needs a fix)", destructive: false, needsNote: true, noteHint: "What must they fix? The player sees this." },
  { value: "cancel_no_penalty", label: "Cancel entry — no penalty", destructive: true, noteHint: "Reason (optional)" },
  { value: "cancel_penalty", label: "Cancel entry — fee forfeited", destructive: true, noteHint: "Reason (optional)" },
  { value: "disqualify", label: "Disqualify", destructive: true, noteHint: "Reason (optional)" },
];

/** Organizer-only row control: review / cancel (±penalty) / disqualify /
 *  reinstate, with a required note for reviews and confirm-before-fire. */
export function RegistrationModeration({ regId, status }: { regId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<ModerationAction | "">("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const closed = ["withdrawn", "cancelled", "disqualified"].includes(status);
  const options = closed ? [] : ACTIONS.filter((a) => !(status === "under_review" && a.value === "under_review"));
  const chosen = ACTIONS.find((a) => a.value === picked) ?? null;

  const run = (action: ModerationAction, n?: string) => {
    setErr(null);
    startTransition(async () => {
      const res = await setEntryModeration(regId, action, n);
      if (!res.ok) setErr(res.error ?? "Couldn't update the entry.");
      else {
        setPicked("");
        setNote("");
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {closed || status === "under_review" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => run("reinstate")}
          className="press h-8 rounded-[9px] border border-rule-2 bg-surface px-3 text-xs font-semibold text-ink-soft transition-colors hover:text-ink disabled:opacity-50"
        >
          Reinstate
        </button>
      ) : null}
      {options.length ? (
        <>
          <select
            value={picked}
            disabled={pending}
            aria-label="Moderate entry"
            onChange={(e) => {
              setPicked(e.target.value as ModerationAction | "");
              setErr(null);
            }}
            className="h-8 rounded-[9px] border border-rule-2 bg-surface px-2 text-xs font-semibold text-ink outline-none disabled:opacity-50"
          >
            <option value="">Moderate…</option>
            {options.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
          {chosen ? (
            <>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={400}
                placeholder={chosen.noteHint}
                aria-label="Moderation note"
                className="h-8 w-56 rounded-[9px] border border-rule-2 bg-surface px-2 text-xs text-ink outline-none placeholder:text-faint"
              />
              <button
                type="button"
                disabled={pending || (chosen.needsNote && !note.trim())}
                onClick={() => run(chosen.value, note)}
                className={`press inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-xs font-bold text-white disabled:opacity-50 ${chosen.destructive ? "bg-[#b91c1c] hover:bg-[#991b1b]" : "bg-ink hover:bg-ink-soft"}`}
              >
                {chosen.destructive ? <ShieldAlert size={13} /> : null} Confirm
              </button>
              <button type="button" disabled={pending} onClick={() => { setPicked(""); setNote(""); }} className="press text-xs font-semibold text-mute hover:text-ink">
                Cancel
              </button>
            </>
          ) : null}
        </>
      ) : null}
      {pending ? <span className="text-[11px] text-faint">Working…</span> : null}
      {err ? <span className="text-[11px] font-semibold text-danger">{err}</span> : null}
    </div>
  );
}
