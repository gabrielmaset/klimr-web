"use client";

import { useActionState, useState } from "react";
import { deleteAccount } from "./actions";

export function DeleteAccount() {
  const [state, action, pending] = useActionState(deleteAccount, undefined);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press rounded-full border border-brand/40 px-4 py-2 text-sm font-semibold text-brand-deep transition-colors hover:bg-tint-brand"
      >
        Delete my account
      </button>
    );
  }

  return (
    <form action={action} className="rounded-xl border border-brand/30 bg-tint-brand p-4">
      <p className="text-sm font-semibold text-ink">This permanently deletes your account.</p>
      <p className="mt-1 text-xs text-mute">
        Your profile, rankings, matches, posts, and history are erased. This can&apos;t be undone. Type{" "}
        <span className="font-bold text-ink">DELETE</span> to confirm.
      </p>
      <input
        name="confirm"
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoComplete="off"
        placeholder="DELETE"
        className="mt-3 w-full rounded-[10px] border border-rule-2 bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
      />
      {state?.error ? <p className="mt-2 text-xs text-brand-deep">{state.error}</p> : null}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={pending || text.trim().toUpperCase() !== "DELETE"}
          className="press rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-40"
        >
          {pending ? "Deleting…" : "Permanently delete"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setText("");
          }}
          className="press rounded-full px-4 py-2 text-sm font-semibold text-mute transition-colors hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
