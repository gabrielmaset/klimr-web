"use client";

import { useActionState } from "react";
import { Mail, Check, Loader2 } from "lucide-react";
import { sendSignInLink } from "../../actions";

export function SendSignInLinkButton({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(sendSignInLink, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        disabled={pending || state?.ok}
        className="press inline-flex items-center gap-1.5 rounded-full border border-rule px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:border-faint disabled:opacity-60"
      >
        {pending ? (
          <Loader2 size={14} className="animate-spin" />
        ) : state?.ok ? (
          <Check size={14} style={{ color: "var(--color-success)" }} />
        ) : (
          <Mail size={14} />
        )}
        {state?.ok ? "Sign-in link sent" : "Send sign-in link"}
      </button>
      {state?.error ? <span className="text-xs" style={{ color: "var(--color-brand-deep)" }}>{state.error}</span> : null}
    </form>
  );
}
