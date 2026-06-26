"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Check, Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { signOutAction, recordLogin } from "@/app/auth/actions";
import { factorName } from "@/lib/mfa";

type Phase = "loading" | "enroll" | "challenge" | "done" | "error";

export function MfaFlow({ next }: { next: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [phase, setPhase] = useState<Phase>("loading");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const factorIdRef = useRef<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/login");
          return;
        }
        const { data: list, error: lErr } = await supabase.auth.mfa.listFactors();
        if (lErr) throw lErr;
        const all = list?.all ?? [];
        const verified = all.find((f) => f.factor_type === "totp" && f.status === "verified");
        if (verified) {
          factorIdRef.current = verified.id;
          setPhase("challenge");
          return;
        }
        // No verified factor → enroll. Clear any stale unverified TOTP factors first.
        for (const f of all.filter((x) => x.factor_type === "totp" && x.status !== "verified")) {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
        const { data: en, error: eErr } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: factorName(),
        });
        if (eErr) throw eErr;
        factorIdRef.current = en.id;
        setQr(en.totp.qr_code);
        setSecret(en.totp.secret);
        setPhase("enroll");
      } catch {
        setErr("Couldn't start two-factor setup. Reload the page to try again.");
        setPhase("error");
      }
    })();
  }, [supabase, router]);

  async function submit() {
    const factorId = factorIdRef.current;
    const clean = code.replace(/\D/g, "");
    if (!factorId || clean.length < 6) {
      setErr("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
      if (cErr) throw cErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: ch.id,
        code: clean,
      });
      if (vErr) {
        setErr("That code didn't match. Check your authenticator app and try again.");
        setBusy(false);
        return;
      }
      await recordLogin().catch(() => {});
      setPhase("done");
      router.refresh();
      router.replace(next);
    } catch {
      setErr("Something went wrong verifying that code. Try again.");
      setBusy(false);
    }
  }

  const CodeInput = (
    <div className="space-y-3">
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="000000"
        aria-label="6-digit code"
        className="w-full rounded-xl border border-rule bg-surface px-3.5 py-3 text-center font-mono text-2xl tracking-[0.4em] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand"
      />
      <button
        onClick={submit}
        disabled={busy}
        className="press flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-3.5 py-3 text-[15px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
      >
        {busy ? "Verifying…" : (<><ShieldCheck size={18} aria-hidden /> Verify &amp; continue</>)}
      </button>
      {err ? <p role="alert" className="text-sm text-brand-deep">{err}</p> : null}
    </div>
  );

  return (
    <div>
      <p className="kicker text-brand-deep">Two-factor security</p>

      {phase === "loading" ? (
        <>
          <h1 className="mt-2 font-display text-4xl text-ink">One moment…</h1>
          <div className="mt-7 flex items-center gap-2 text-sm text-mute">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-rule border-t-brand" />
            Setting up two-factor security.
          </div>
        </>
      ) : phase === "error" ? (
        <>
          <h1 className="mt-2 font-display text-4xl text-ink">Hmm.</h1>
          <p className="mt-2 text-sm leading-relaxed text-mute">{err}</p>
        </>
      ) : phase === "done" ? (
        <>
          <h1 className="mt-2 font-display text-4xl text-ink">Verified.</h1>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-success">
            <Check size={15} aria-hidden /> Taking you in…
          </p>
        </>
      ) : phase === "challenge" ? (
        <>
          <h1 className="mt-2 font-display text-4xl text-ink">Enter your code.</h1>
          <p className="mt-2 text-sm leading-relaxed text-mute">
            Open your authenticator app and enter the current 6-digit code for
            Klimr.
          </p>
          <div className="mt-7">{CodeInput}</div>
          <p className="mt-4 text-xs leading-relaxed text-faint">
            Lost access to your authenticator? Write{" "}
            <a href="mailto:hello@klimr.com?subject=Klimr%202FA%20help" className="underline underline-offset-2 hover:text-mute">
              hello@klimr.com
            </a>{" "}
            and we&apos;ll help you back in.
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-2 font-display text-4xl text-ink">Set up 2FA.</h1>
          <p className="mt-2 text-sm leading-relaxed text-mute">
            Two-factor security is required on every Klimr account. You&apos;ll
            use a free <span className="font-semibold text-ink">authenticator app</span>{" "}
            on your phone — it shows a fresh 6-digit code every 30 seconds, works
            offline, and is far safer than codes sent by text.
          </p>

          <ol className="mt-5 space-y-2 text-sm text-ink-soft">
            <li className="flex gap-2.5">
              <span className="font-mono text-[12px] font-bold text-brand">1</span>
              Install an authenticator app on your phone (options below).
            </li>
            <li className="flex gap-2.5">
              <span className="font-mono text-[12px] font-bold text-brand">2</span>
              In the app, tap &ldquo;add&rdquo; and scan the QR code below — or paste the key.
            </li>
            <li className="flex gap-2.5">
              <span className="font-mono text-[12px] font-bold text-brand">3</span>
              Enter the 6-digit code the app shows for Klimr.
            </li>
          </ol>

          <div className="mt-5 flex flex-col items-center gap-4 rounded-2xl border border-rule bg-surface p-5">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="Two-factor QR code" width={176} height={176} className="rounded-lg" />
            ) : null}
            {secret ? (
              <div className="w-full">
                <div className="kicker text-faint">Can&apos;t scan? Enter this key</div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(secret);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="press mt-1.5 flex w-full items-center justify-between gap-2 rounded-xl border border-rule bg-bg px-3 py-2.5 font-mono text-[13px] tracking-wider text-ink"
                >
                  <span className="truncate">{secret}</span>
                  {copied ? (
                    <span className="flex shrink-0 items-center gap-1 text-success"><Check size={13} /> Copied</span>
                  ) : (
                    <Copy size={14} className="shrink-0 text-mute" aria-hidden />
                  )}
                </button>
              </div>
            ) : null}
          </div>

          <details className="mt-4 rounded-2xl border border-rule bg-bg px-4 py-3 text-sm">
            <summary className="cursor-pointer font-semibold text-ink">
              Don&apos;t have an authenticator app?
            </summary>
            <div className="mt-3 space-y-3 text-mute">
              <p className="leading-relaxed">
                Install one of these free apps, then come back and scan the code.
                Any authenticator app works.
              </p>
              <div className="space-y-2.5">
                <div>
                  <div className="font-semibold text-ink">Google Authenticator</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                    <a className="text-brand-deep underline underline-offset-2" href="https://apps.apple.com/app/google-authenticator/id388497605" target="_blank" rel="noopener noreferrer">iPhone · App Store</a>
                    <a className="text-brand-deep underline underline-offset-2" href="https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2" target="_blank" rel="noopener noreferrer">Android · Google Play</a>
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-ink">Microsoft Authenticator</div>
                  <div className="mt-0.5 text-[13px]">
                    <a className="text-brand-deep underline underline-offset-2" href="https://support.microsoft.com/en-us/authenticator/download-microsoft-authenticator" target="_blank" rel="noopener noreferrer">Download for iPhone &amp; Android</a>
                  </div>
                </div>
              </div>
              <p className="text-[12px] text-faint">
                Already use 1Password or Authy? Those work as authenticator apps too.
              </p>
            </div>
          </details>

          <div className="mt-5">{CodeInput}</div>
        </>
      )}

      {phase !== "loading" && phase !== "done" ? (
        <form action={signOutAction} className="mt-6">
          <button className="press text-sm text-mute underline underline-offset-2 transition-colors hover:text-ink">
            Sign out
          </button>
        </form>
      ) : null}
    </div>
  );
}
