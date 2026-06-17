"use client";
import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { signUpWithInvite, type SignupState } from "./signup-actions";

const initial: SignupState = {};

export function SignupForm({ initialCode = "" }: { initialCode?: string }) {
  const [state, action, pending] = useActionState(signUpWithInvite, initial);

  if (state.ok) {
    return (
      <div className="rise rounded-2xl border border-rule bg-surface p-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-tint-success">
          <MailCheck size={20} className="text-success" aria-hidden />
        </div>
        <h2 className="mt-4 font-display text-2xl text-ink">Check your email.</h2>
        <p className="mt-2 text-sm leading-relaxed text-mute">
          We sent a confirmation link to{" "}
          <span className="font-mono text-[13px] text-ink">{state.email}</span>.
          Open it on this device to confirm your address — then you&apos;ll
          create a password, set up two-factor, and build your profile. If it
          does not arrive in a minute, check spam.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="kicker text-faint">Invite code</span>
        <input
          name="code"
          required
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="X7QM-K2NF-B9G3"
          defaultValue={state.code ?? initialCode}
          className="mt-1.5 w-full rounded-xl border border-rule bg-surface px-3.5 py-3 font-mono text-[15px] uppercase tracking-[0.12em] text-ink outline-none transition-colors placeholder:normal-case placeholder:tracking-normal placeholder:text-faint focus:border-brand"
        />
      </label>
      <label className="block">
        <span className="kicker text-faint">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          defaultValue={state.email}
          className="mt-1.5 w-full rounded-xl border border-rule bg-surface px-3.5 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="press w-full rounded-xl bg-brand px-3.5 py-3 text-[15px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
      >
        {pending ? "Checking…" : "Send my confirmation link"}
      </button>
      {state.error ? (
        <p role="alert" className="text-sm text-brand-deep">
          {state.error}
        </p>
      ) : null}
      <p className="pt-1 text-xs leading-relaxed text-mute">
        You&apos;ll create your password after confirming your email. Klimr is
        invite-only during the Mar Vista beta.
      </p>
    </form>
  );
}
