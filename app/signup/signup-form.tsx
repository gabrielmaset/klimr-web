"use client";
import { useActionState, useState } from "react";
import { MailCheck, Eye, EyeOff } from "lucide-react";
import { signUpWithInvite, type SignupState } from "./signup-actions";

const initial: SignupState = {};
const MIN_PASSWORD = 10;

export function SignupForm() {
  const [state, action, pending] = useActionState(signUpWithInvite, initial);
  const [show, setShow] = useState(false);

  if (state.ok) {
    return (
      <div className="rise rounded-2xl border border-rule bg-surface p-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-tint-success">
          <MailCheck size={20} className="text-success" aria-hidden />
        </div>
        <h2 className="mt-4 font-display text-2xl text-ink">Confirm your email.</h2>
        <p className="mt-2 text-sm leading-relaxed text-mute">
          We sent a confirmation link to{" "}
          <span className="font-mono text-[13px] text-ink">{state.email}</span>.
          Open it on this device to activate your account. Next you&apos;ll set
          up two-factor security, then your profile. If it does not arrive in a
          minute, check spam.
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
          defaultValue={state.code}
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
      <label className="block">
        <span className="kicker text-faint">Password</span>
        <div className="relative mt-1.5">
          <input
            type={show ? "text" : "password"}
            name="password"
            required
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            placeholder={`At least ${MIN_PASSWORD} characters`}
            className="w-full rounded-xl border border-rule bg-surface px-3.5 py-3 pr-11 text-[15px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center text-faint transition-colors hover:text-ink"
          >
            {show ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
          </button>
        </div>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="press w-full rounded-xl bg-brand px-3.5 py-3 text-[15px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create my account"}
      </button>
      {state.error ? (
        <p role="alert" className="text-sm text-brand-deep">
          {state.error}
        </p>
      ) : null}
      <p className="pt-1 text-xs leading-relaxed text-mute">
        After you confirm your email, Klimr asks you to set up an authenticator
        app — two-factor security is required for every account.
      </p>
    </form>
  );
}
