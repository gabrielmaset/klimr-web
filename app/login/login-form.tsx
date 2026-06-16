"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { MailCheck, Eye, EyeOff } from "lucide-react";
import { signInPassword, sendMagicLink, type LoginState } from "./actions";

const initial: LoginState = {};

export function LoginForm({ next, linkError }: { next: string; linkError: boolean }) {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [show, setShow] = useState(false);
  const [pwState, pwAction, pwPending] = useActionState(signInPassword, initial);
  const [mlState, mlAction, mlPending] = useActionState(sendMagicLink, initial);

  // Magic link dispatched — uniform confirmation.
  if (mlState.sent) {
    return (
      <div className="rise rounded-2xl border border-rule bg-surface p-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-tint-success">
          <MailCheck size={20} className="text-success" aria-hidden />
        </div>
        <h2 className="mt-4 font-display text-2xl text-ink">Check your inbox.</h2>
        <p className="mt-2 text-sm leading-relaxed text-mute">
          If an account exists for{" "}
          <span className="font-mono text-[13px] text-ink">{mlState.email}</span>, a
          sign-in link is on its way. Open it on this device. If it doesn&apos;t
          arrive in a minute, check spam.
        </p>
      </div>
    );
  }

  const expired = linkError ? (
    <div role="alert" className="rounded-xl border border-pop bg-pop/25 px-3.5 py-3 text-sm leading-snug text-ink">
      That sign-in link expired or was already used. Sign in below for a fresh one.
    </div>
  ) : null;

  if (mode === "magic") {
    return (
      <form action={mlAction} className="space-y-3">
        {expired}
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
          disabled={mlPending}
          className="press w-full rounded-xl bg-brand px-3.5 py-3 text-[15px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
        >
          {mlPending ? "Sending…" : "Email me a sign-in link"}
        </button>
        {mlState.error ? (
          <p role="alert" className="text-sm text-brand-deep">{mlState.error}</p>
        ) : null}
        <button
          type="button"
          onClick={() => setMode("password")}
          className="press block w-full pt-1 text-center text-sm font-semibold text-ink underline underline-offset-2 transition-colors hover:text-brand-deep"
        >
          Use a password instead
        </button>
        <p className="text-xs leading-relaxed text-mute">
          You&apos;ll still complete two-factor verification after the link.
        </p>
      </form>
    );
  }

  return (
    <form action={pwAction} className="space-y-3">
      {expired}
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
      <label className="block">
        <div className="flex items-baseline justify-between">
          <span className="kicker text-faint">Password</span>
          <Link href="/forgot-password" className="text-xs font-semibold text-mute underline underline-offset-2 transition-colors hover:text-ink">
            Forgot?
          </Link>
        </div>
        <div className="relative mt-1.5">
          <input
            type={show ? "text" : "password"}
            name="password"
            required
            autoComplete="current-password"
            placeholder="Your password"
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
        disabled={pwPending}
        className="press w-full rounded-xl bg-brand px-3.5 py-3 text-[15px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
      >
        {pwPending ? "Signing in…" : "Sign in"}
      </button>
      {pwState.error ? (
        <p role="alert" className="text-sm text-brand-deep">{pwState.error}</p>
      ) : null}
      <button
        type="button"
        onClick={() => setMode("magic")}
        className="press block w-full pt-1 text-center text-sm font-semibold text-ink underline underline-offset-2 transition-colors hover:text-brand-deep"
      >
        Email me a sign-in link instead
      </button>
    </form>
  );
}
