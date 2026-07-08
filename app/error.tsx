"use client";

import { useEffect } from "react";
import Link from "next/link";
import { reportClientError } from "@/lib/client-diagnostics";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError({
      message: `Route error: ${error.message}${error.digest ? ` (digest ${error.digest})` : ""}`,
      detail: error.stack,
    });
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-flame-text">Something slipped</p>
      <h1 className="mt-2 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink">
        That didn&rsquo;t go as planned.
      </h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-mute">
        The error has been reported automatically. You can try again — if it keeps happening, we&rsquo;re already looking at it.
      </p>
      <div className="mt-5 flex items-center gap-2.5">
        <button
          type="button"
          onClick={reset}
          className="press inline-flex h-[34px] items-center rounded-[10px] px-3.5 text-[13px] font-bold text-white shadow-flame transition-[filter] hover:brightness-[1.06]"
          style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}
        >
          Try again
        </button>
        <Link href="/feed" className="press inline-flex h-[34px] items-center rounded-[10px] border border-rule-2 bg-surface px-3.5 text-[13px] font-semibold text-mute hover:text-ink">
          Go home
        </Link>
      </div>
    </div>
  );
}
