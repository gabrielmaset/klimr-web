"use client";

import { useState } from "react";
import { enterSite, requestAccessCode } from "./actions";
import { Turnstile, CAPTCHA_ENABLED } from "@/components/turnstile";
import { GateError } from "./gate-error";

export function GateForm({ errorMessage, noticeMessage }: { errorMessage: string | null; noticeMessage: string | null }) {
  const [token, setToken] = useState<string | null>(null);
  const blocked = CAPTCHA_ENABLED && !token;

  return (
    <div className="mt-12 w-full max-w-[18rem]">
      {/* Access code (invite, or a one-time code emailed to a member) */}
      <form action={enterSite}>
        <input
          name="code"
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Access code"
          aria-label="Access code"
          className="w-full rounded-xl border border-rule bg-surface shadow-e1 px-4 py-3 text-center font-mono text-sm tracking-wider text-ink outline-none transition-colors placeholder:text-faint focus:border-ink"
        />
        <input type="hidden" name="captchaToken" value={token ?? ""} />
        {errorMessage ? <GateError message={errorMessage} /> : null}
        <button
          type="submit"
          disabled={blocked}
          className="press mt-4 w-full rounded-full bg-ink py-3 text-sm font-bold text-surface transition-colors hover:bg-ink-soft disabled:opacity-60"
        >
          Enter
        </button>
      </form>

      {/* Already a member — get a code by email instead of needing a fresh invite */}
      <div className="mt-8 flex items-center gap-3 text-[11px] uppercase tracking-wider text-faint">
        <span className="h-px flex-1 bg-rule" /> or <span className="h-px flex-1 bg-rule" />
      </div>

      <form action={requestAccessCode} className="mt-6">
        <p className="mb-2 text-center text-[13px] text-mute">Already have a Klimr account?</p>
        <input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="you@email.com"
          aria-label="Email"
          className="w-full rounded-xl border border-rule bg-surface shadow-e1 px-4 py-3 text-center text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-ink"
        />
        <input type="hidden" name="captchaToken" value={token ?? ""} />
        {noticeMessage ? <GateError message={noticeMessage} param="sent" tone="mute" /> : null}
        <button
          type="submit"
          disabled={blocked}
          className="press mt-3 w-full rounded-full border border-rule bg-surface py-3 text-sm font-semibold text-ink transition-colors hover:border-ink disabled:opacity-60"
        >
          Email me a code
        </button>
      </form>

      {CAPTCHA_ENABLED ? (
        <div className="mt-6 flex justify-center">
          <Turnstile onToken={setToken} />
        </div>
      ) : null}
    </div>
  );
}
