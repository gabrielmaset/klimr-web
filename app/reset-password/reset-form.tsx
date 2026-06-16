"use client";
import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { setNewPassword, type ResetState } from "./actions";

const initial: ResetState = {};

export function ResetForm() {
  const [state, action, pending] = useActionState(setNewPassword, initial);
  const [show, setShow] = useState(false);

  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="kicker text-faint">New password</span>
        <div className="relative mt-1.5">
          <input
            type={show ? "text" : "password"}
            name="password"
            required
            minLength={10}
            autoComplete="new-password"
            placeholder="At least 10 characters"
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
      <label className="block">
        <span className="kicker text-faint">Confirm password</span>
        <input
          type={show ? "text" : "password"}
          name="confirm"
          required
          minLength={10}
          autoComplete="new-password"
          placeholder="Re-enter it"
          className="mt-1.5 w-full rounded-xl border border-rule bg-surface px-3.5 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="press w-full rounded-xl bg-brand px-3.5 py-3 text-[15px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
      >
        {pending ? "Saving…" : "Set new password"}
      </button>
      {state.error ? (
        <p role="alert" className="text-sm text-brand-deep">{state.error}</p>
      ) : null}
    </form>
  );
}
