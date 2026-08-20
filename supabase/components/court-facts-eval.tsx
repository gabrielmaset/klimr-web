"use client";

import { useState, useTransition } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { aiEvaluateCourtFacts } from "@/app/courts/actions";

/** Admin tool: run the AI facts evaluator now and show what it wrote. */
export function CourtFactsEval({ courtId }: { courtId: string }) {
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() =>
          start(async () => {
            const res = await aiEvaluateCourtFacts(courtId);
            setNote(res.note);
          })
        }
        className="press inline-flex items-center gap-1.5 rounded-[9px] border border-rule-2 bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-mute hover:text-ink"
      >
        {pending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
        Evaluate facts with AI
      </button>
      {note ? <span className="text-[11.5px] font-medium text-mute">{note}</span> : null}
    </span>
  );
}
