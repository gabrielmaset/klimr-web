"use client";
import { useState, type FormEvent } from "react";
import { MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { precheckInvite } from "./signup-actions";
import { Turnstile, CAPTCHA_ENABLED } from "@/components/turnstile";

export function SignupForm({ initialCode = "" }: { initialCode?: string }) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [code, setCode] = useState(initialCode);
  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const f = first.trim().slice(0, 40);
    const l = last.trim().slice(0, 40);
    const c = code.trim().toUpperCase();
    const em = email.trim();
    if (!f || !l) {
      setError("Enter your first and last name.");
      return;
    }
    if (!/^[A-Z0-9-]{8,40}$/.test(c)) {
      setError("Enter your invite code.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setError("Enter a valid email address.");
      return;
    }
    if (CAPTCHA_ENABLED && !captchaToken) {
      setError("Please complete the verification challenge.");
      return;
    }
    setPending(true);
    setError(null);

    const pre = await precheckInvite(c);
    if (!pre.ok) {
      setError(pre.error);
      setPending(false);
      return;
    }

    const supabase = createClient();
    const origin = window.location.origin;
    // The invite + name ride in the signup metadata (the trigger consumes them).
    const { error: err } = await supabase.auth.signInWithOtp({
      email: em,
      options: {
        shouldCreateUser: true,
        data: { invite_code: c, first_name: f, last_name: l, display_name: f },
        emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent("/onboarding")}`,
        ...(captchaToken ? { captchaToken } : {}),
      },
    });
    if (err) {
      if (/captcha/i.test(err.message)) setError("Verification failed. Please try the challenge again.");
      else if (/invite|database error/i.test(err.message)) setError("We couldn't complete signup with that invite — it may have just been used. Write hello@klimr.com.");
      else setError("We couldn't start your signup. Try again in a moment.");
      setPending(false);
      return;
    }
    setSentEmail(em);
    setSent(true);
    setPending(false);
  }

  if (sent) {
    return (
      <div className="rise rounded-2xl border border-rule bg-surface p-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-tint-success">
          <MailCheck size={20} className="text-success" aria-hidden />
        </div>
        <h2 className="mt-4 font-display text-2xl text-ink">Check your email.</h2>
        <p className="mt-2 text-sm leading-relaxed text-mute">
          We sent a confirmation link to{" "}
          <span className="font-mono text-[13px] text-ink">{sentEmail}</span>.
          Open it on this device to confirm your address — then you&apos;ll set up
          two-factor security and build your profile. If it does not arrive in a
          minute, check spam.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="kicker text-faint">First name</span>
          <input
            required
            autoComplete="given-name"
            maxLength={40}
            placeholder="Alex"
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-rule bg-surface px-3.5 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand"
          />
        </label>
        <label className="block">
          <span className="kicker text-faint">Last name</span>
          <input
            required
            autoComplete="family-name"
            maxLength={40}
            placeholder="Rivera"
            value={last}
            onChange={(e) => setLast(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-rule bg-surface px-3.5 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand"
          />
        </label>
      </div>
      <label className="block">
        <span className="kicker text-faint">Invite code</span>
        <input
          required
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="X7QM-K2NF-B9G3"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="mt-1.5 w-full rounded-xl border border-rule bg-surface px-3.5 py-3 font-mono text-[15px] uppercase tracking-[0.12em] text-ink outline-none transition-colors placeholder:normal-case placeholder:tracking-normal placeholder:text-faint focus:border-brand"
        />
      </label>
      <label className="block">
        <span className="kicker text-faint">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-rule bg-surface px-3.5 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand"
        />
      </label>
      <Turnstile onToken={setCaptchaToken} />
      <button
        type="submit"
        disabled={pending}
        className="press w-full rounded-xl bg-brand px-3.5 py-3 text-[15px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
      >
        {pending ? "Checking…" : "Send my confirmation link"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-brand-deep">
          {error}
        </p>
      ) : null}
      <p className="pt-1 text-xs leading-relaxed text-mute">
        After confirming your email you&apos;ll set up two-factor security. Klimr is
        invite-only during the Mar Vista beta.
      </p>
    </form>
  );
}
