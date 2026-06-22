"use client";

import { useState } from "react";
import { enterSite } from "./actions";
import { Turnstile, CAPTCHA_ENABLED } from "@/components/turnstile";
import { GateError } from "./gate-error";

export function GateForm({ errorMessage }: { errorMessage: string | null }) {
  const [token, setToken] = useState<string | null>(null);

  return (
    <form action={enterSite} className="mt-12 w-full max-w-[18rem]">
      <input
        name="code"
        autoFocus
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Access code"
        aria-label="Access code"
        className="w-full rounded-xl border border-rule bg-surface px-4 py-3 text-center font-mono text-sm tracking-wider text-ink outline-none transition-colors placeholder:text-faint focus:border-ink"
      />
      <input type="hidden" name="captchaToken" value={token ?? ""} />
      {errorMessage ? <GateError message={errorMessage} /> : null}
      {CAPTCHA_ENABLED ? (
        <div className="mt-4 flex justify-center">
          <Turnstile onToken={setToken} />
        </div>
      ) : null}
      <button
        type="submit"
        disabled={CAPTCHA_ENABLED && !token}
        className="press mt-4 w-full rounded-full bg-ink py-3 text-sm font-bold text-surface transition-colors hover:bg-ink-soft disabled:opacity-60"
      >
        Enter
      </button>
    </form>
  );
}
