"use client";
import { useActionState, useState } from "react";
import { MailCheck } from "lucide-react";
import { sendMagicLink, type LoginState } from "./actions";

const initial: LoginState = {};

export function LoginForm({ next, linkError }: { next: string; linkError: boolean }) {
  const [email, setEmail] = useState("");
  const [state, action, pending] = useActionState(sendMagicLink, initial);

  // Magic link dispatched — uniform confirmation (never reveals if the account exists).
  if (state.sent) {
    return (
      <div className="rise">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-tint-success">
          <MailCheck size={20} className="text-success" aria-hidden />
        </div>
        <h2 className="mt-4 font-display text-2xl text-ink">Check your inbox.</h2>
        <p className="mt-2 text-sm leading-relaxed text-mute">
          If an account exists for{" "}
          <span className="font-mono text-[13px] text-ink">{state.email}</span>, a sign-in link is on its way.
          Open it on this device. If it doesn&apos;t arrive in a minute, check spam.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      {linkError ? (
        <div role="alert" className="rounded-xl border border-pop bg-pop/25 px-3.5 py-3 text-sm leading-snug text-ink">
          That sign-in link expired or was already used. Request a fresh one below.
        </div>
      ) : null}
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="kicker text-faint">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-rule bg-surface px-3.5 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="press w-full rounded-xl bg-brand px-3.5 py-3 text-[15px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
      >
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
      {state.error ? <p role="alert" className="text-sm text-brand-deep">{state.error}</p> : null}
      <p className="text-xs leading-relaxed text-mute">
        No password needed. You&apos;ll do a quick two-factor check right after the link.
      </p>
    </form>
  );
}
