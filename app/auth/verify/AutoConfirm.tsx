"use client";

import { useEffect, useRef } from "react";
import { MailCheck, Loader2 } from "lucide-react";
import { confirmSignIn } from "./actions";

/** Auto-submits on mount so a real browser finishes sign-in instantly and lands
 *  on the 2FA step. Email link-scanners that merely GET the page (and don't run
 *  JS) never submit, so the single-use token survives until the human opens it. */
export function AutoConfirm({ token_hash, type, next }: { token_hash: string; type: string; next: string }) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const t = setTimeout(() => ref.current?.requestSubmit(), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <form ref={ref} action={confirmSignIn} className="mt-7">
      <input type="hidden" name="token_hash" value={token_hash} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="next" value={next} />
      <div className="flex items-center gap-2.5 text-sm text-mute">
        <Loader2 size={16} className="animate-spin text-brand" aria-hidden /> Signing you in…
      </div>
      <button
        type="submit"
        className="press mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-3.5 py-3 text-[15px] font-bold text-white transition-colors hover:bg-brand-deep"
      >
        <MailCheck size={18} aria-hidden /> Continue
      </button>
    </form>
  );
}
