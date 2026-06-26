"use client";

import { useActionState, useRef, useEffect } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { sendSupportMessage } from "./actions";

const field = "w-full rounded-xl border border-rule bg-surface px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand";

export function SupportForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(sendSupportMessage, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state?.ok]);

  if (state?.ok) {
    return (
      <div className="rounded-2xl border border-rule bg-surface p-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-tint-success">
          <CheckCircle2 size={20} className="text-success" aria-hidden />
        </div>
        <h2 className="mt-4 font-display text-2xl text-ink">Message sent.</h2>
        <p className="mt-2 text-sm leading-relaxed text-mute">
          Thanks — our team will reply to <span className="font-mono text-[13px] text-ink">{email}</span> as soon as we can.
        </p>
      </div>
    );
  }

  return (
    <form ref={formRef} action={action} className="rounded-2xl border border-rule bg-surface p-4 sm:p-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="kicker text-faint">Topic</span>
          <select name="category" defaultValue="question" className={`mt-1 ${field}`}>
            <option value="question">General question</option>
            <option value="bug">Something&rsquo;s broken</option>
            <option value="account">Account &amp; access</option>
            <option value="safety">Safety or a player report</option>
            <option value="feedback">Feedback / idea</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="block">
          <span className="kicker text-faint">Your email</span>
          <input value={email} disabled className={`mt-1 ${field} cursor-not-allowed text-mute`} />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="kicker text-faint">Subject</span>
        <input name="subject" required maxLength={120} className={`mt-1 ${field}`} placeholder="A short summary" />
      </label>

      <label className="mt-3 block">
        <span className="kicker text-faint">How can we help?</span>
        <textarea name="message" required rows={6} maxLength={4000} className={`mt-1 resize-none ${field}`} placeholder="Share as much detail as you can." />
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="press inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft disabled:opacity-60"
        >
          {pending ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Sending…
            </>
          ) : (
            <>
              <Send size={14} /> Send message
            </>
          )}
        </button>
        {state?.error ? <span className="text-sm text-brand-deep">{state.error}</span> : null}
      </div>
    </form>
  );
}
