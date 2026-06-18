"use client";

import { useState } from "react";
import { Archive } from "lucide-react";
import { archiveUser } from "../../actions";

export function ArchiveUserButton({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press inline-flex items-center gap-1.5 rounded-full border border-rule px-3.5 py-2 text-sm font-semibold text-mute transition-colors hover:border-brand/40 hover:text-brand-deep"
      >
        <Archive size={14} /> Archive account…
      </button>
    );
  }

  return (
    <form action={archiveUser} className="rounded-xl border border-brand/30 bg-surface p-3.5">
      <input type="hidden" name="userId" value={userId} />
      <p className="text-sm text-ink">
        Hides this account and starts a 30-day countdown. You can recover it from Archived accounts until
        then — after that it&apos;s permanently deleted.
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="press rounded-full px-3.5 py-2 text-sm font-semibold text-white transition-colors"
          style={{ background: "#d63a0f" }}
        >
          Archive account
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
