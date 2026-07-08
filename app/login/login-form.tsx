"use client";
import { useState, type FormEvent } from "react";
import { MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Turnstile, CAPTCHA_ENABLED } from "@/components/turnstile";

export function LoginForm({ next, linkError }: { next: string; linkError: boolean }) {
  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Enter a valid email address.");
      return;
    }
    if (CAPTCHA_ENABLED && !captchaToken) {
      setError("Please complete the verification challenge.");
      return;
    }
    setPending(true);
    setError(null);

    const supabase = createClient();
    const origin = window.location.origin;
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/account";
    // shouldCreateUser:false — sign-IN only; new accounts go through /signup with an invite.
    const { error: err } = await supabase.auth.signInWithOtp({
      email: value,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(safeNext)}`,
        ...(captchaToken ? { captchaToken } : {}),
      },
    });
    // Only surface a CAPTCHA failure; otherwise respond uniformly whether or not the
    // account exists (never reveal which emails are registered).
    if (err && /captcha/i.test(err.message)) {
      setError("Verification failed. Please try the challenge again.");
      setPending(false);
      return;
    }
    setSentEmail(value);
    setSent(true);
    setPending(false);
  }

  if (sent) {
    return (
      <div className="rise">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-tint-success">
          <MailCheck size={20} className="text-success" aria-hidden />
        </div>
        <h2 className="mt-4 font-display text-2xl text-ink">Check your inbox.</h2>
        <p className="mt-2 text-sm leading-relaxed text-mute">
          If an account exists for{" "}
          <span className="font-mono text-[13px] text-ink">{sentEmail}</span>, a sign-in link is on its way.
          Open it on this device. If it doesn&apos;t arrive in a minute, check spam.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {linkError ? (
        <div role="alert" className="rounded-xl border border-pop bg-pop/25 px-3.5 py-3 text-sm leading-snug text-ink">
          That sign-in link expired or was already used. Request a fresh one below.
        </div>
      ) : null}
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
          className="mt-1.5 w-full rounded-[10px] border border-rule-2 bg-surface px-3.5 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15"
        />
      </label>
      <Turnstile onToken={setCaptchaToken} />
      <button
        type="submit"
        disabled={pending}
        className="press w-full rounded-xl bg-brand px-3.5 py-3 text-[15px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
      >
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
      {error ? <p role="alert" className="text-sm text-brand-deep">{error}</p> : null}
      <p className="text-xs leading-relaxed text-mute">
        No password needed. You&apos;ll do a quick two-factor check right after the link.
      </p>
    </form>
  );
}
