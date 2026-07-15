"use client";

import { useActionState } from "react";
import { Loader2, Send } from "lucide-react";
import { sendBroadcastState } from "./actions";

const field = "w-full rounded-[12px] border border-rule-2 bg-surface px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand";

export function BroadcastForm() {
  const [state, formAction, pending] = useActionState(sendBroadcastState, null);

  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-rule bg-surface p-5 shadow-e1">
      <label className="grid gap-1.5">
        <span className="text-xs font-bold text-ink">Audience</span>
        <select name="audience" className={field} defaultValue="all">
          <option value="all">All members</option>
          <option value="organizers">Event Organizers</option>
          <option value="tournament_directors">Tournament Directors</option>
          <option value="providers">Verified pros (coaches &amp; health)</option>
        </select>
      </label>
      <label className="grid gap-1.5">
        <span className="text-xs font-bold text-ink">Subject</span>
        <input name="subject" required maxLength={140} placeholder="An update to our Terms of Service" className={field} />
      </label>
      <label className="grid gap-1.5">
        <span className="text-xs font-bold text-ink">Message</span>
        <textarea name="body" required rows={9} maxLength={8000} placeholder={"Write the announcement in plain language.\n\nBlank lines become paragraphs."} className={`${field} resize-y`} />
        <span className="text-[11px] text-faint">Sent from notifications@klimr.com with the standard Klimr shell — no formatting needed, blank lines become paragraphs.</span>
      </label>
      <div className="flex flex-wrap items-end gap-3 border-t border-rule-soft pt-4">
        <label className="grid gap-1.5">
          <span className="text-xs font-bold text-ink">Type <span className="font-mono">SEND</span> to confirm</span>
          <input name="confirm" required placeholder="SEND" className={`${field} w-36 font-mono uppercase`} autoComplete="off" />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="press inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-flame transition-[filter] hover:brightness-[1.06] disabled:opacity-60"
          style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}
        >
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {pending ? "Sending…" : "Send broadcast"}
        </button>
      </div>
      {state && !state.ok ? <p className="rounded-[12px] border border-[#f0c2b0] bg-[#fbeee7] px-3.5 py-2.5 text-[13px] font-semibold text-[#b91c1c]">{state.error}</p> : null}
      {state && state.ok ? (
        <p className="rounded-[12px] border border-[#CFE8CF] bg-[#EFF8F0] px-3.5 py-2.5 text-[13px] font-semibold text-[#217A34]">
          Sent to {state.sent} of {state.matched} recipients.
        </p>
      ) : null}
    </form>
  );
}
