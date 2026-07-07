"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { archiveUser } from "../../actions";

export function ArchiveUserButton({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold text-white transition-colors"
        style={{ background: "var(--color-danger)" }}
      >
        <Trash2 size={14} /> Delete account…
      </button>
    );
  }

  return (
    <form action={archiveUser} className="rounded-xl border border-brand/30 bg-surface p-3.5">
      <input type="hidden" name="userId" value={userId} />
      <p className="text-sm text-ink">
        Deletes this account: it&apos;s hidden immediately and permanently removed after 30 days, along with all of its
        data. Recoverable from Archived accounts until then.
      </p>
      <label className="mt-3 block">
        <span className="kicker text-faint">Reason for deletion (required)</span>
        <textarea
          name="reason"
          rows={2}
          required
          maxLength={300}
          placeholder="e.g. test account cleanup, policy violation, user request…"
          className="mt-1.5 w-full resize-none rounded-xl border border-rule bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
        />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="press rounded-full px-3.5 py-2 text-sm font-semibold text-white transition-colors"
          style={{ background: "var(--color-danger)" }}
        >
          Delete account
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="press rounded-full border border-rule px-3.5 py-2 text-sm font-semibold text-mute transition-colors hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
