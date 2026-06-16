"use client";
import { useActionState, useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { createPassword, type CreatePwState } from "./actions";

const initial: CreatePwState = {};

export function CreatePasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(createPassword, initial);
  const [show, setShow] = useState(false);

  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="kicker text-faint">Email</span>
        <div className="relative mt-1.5">
          <input
            type="email"
            value={email}
            disabled
            readOnly
            aria-label="Your email (locked)"
            className="w-full cursor-not-allowed rounded-xl border border-rule bg-bg px-3.5 py-3 pr-10 text-[15px] text-mute outline-none"
          />
          <span className="absolute inset-y-0 right-0 grid w-10 place-items-center text-faint">
            <Lock size={15} aria-hidden />
          </span>
        </div>
        <span className="mt-1 block text-[11px] text-faint">
          This is the address your invite was sent to — it can&apos;t be changed.
        </span>
      </label>

      <label className="block">
        <span className="kicker text-faint">Password</span>
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
        {pending ? "Saving…" : "Create password & continue"}
      </button>
      {state.error ? (
        <p role="alert" className="text-sm text-brand-deep">{state.error}</p>
      ) : null}
    </form>
  );
}
