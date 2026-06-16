"use client";
import { useActionState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { requestPasswordReset, type ForgotState } from "./actions";

const initial: ForgotState = {};

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  return (
    <div className="mx-auto max-w-sm px-5 py-16">
      <p className="kicker text-brand-deep">Account recovery</p>
      <h1 className="mt-2 font-display text-4xl text-ink">Reset password.</h1>

      {state.sent ? (
        <div className="rise mt-7 rounded-2xl border border-rule bg-surface p-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-tint-success">
            <MailCheck size={20} className="text-success" aria-hidden />
          </div>
          <h2 className="mt-4 font-display text-2xl text-ink">Check your inbox.</h2>
          <p className="mt-2 text-sm leading-relaxed text-mute">
            If an account exists for{" "}
            <span className="font-mono text-[13px] text-ink">{state.email}</span>, a
            reset link is on its way. Open it on this device to set a new
            password.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm leading-relaxed text-mute">
            Enter your email and we&apos;ll send a link to set a new password.
          </p>
          <form action={action} className="mt-7 space-y-3">
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
              {pending ? "Sending…" : "Send reset link"}
            </button>
            {state.error ? (
              <p role="alert" className="text-sm text-brand-deep">{state.error}</p>
            ) : null}
          </form>
        </>
      )}

      <p className="mt-6 text-sm text-mute">
        <Link href="/login" className="font-semibold text-ink underline underline-offset-2 transition-colors hover:text-brand-deep">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
