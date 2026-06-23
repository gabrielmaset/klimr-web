"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { deleteTournament } from "@/app/tournaments/actions";

/** Owner-only "danger zone" deletion. Type-to-confirm guards against accidents;
 *  on success the workspace is gone, so route back to the tournaments hub. */
export function DeleteEvent({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const canDelete = title.trim().length > 0 && confirmText.trim() === title.trim();

  function onDelete() {
    if (!canDelete) return;
    setErr(null);
    start(async () => {
      const res = await deleteTournament(id);
      if (res.ok) router.push("/tournaments");
      else setErr(res.error);
    });
  }

  return (
    <section className="rounded-3xl border border-brand/30 bg-tint-brand/40 p-5 sm:p-6">
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-brand-deep">
        <Trash2 size={15} /> Danger zone
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Deleting an event permanently removes it along with its registrations, divisions, payments, and sign-up form. This cannot be undone.
      </p>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="press mt-4 inline-flex items-center gap-1.5 rounded-xl border border-brand/50 bg-surface px-4 py-2.5 text-sm font-semibold text-brand-deep hover:bg-tint-brand"
        >
          <Trash2 size={15} /> Delete this event
        </button>
      ) : (
        <div className="mt-4 rounded-2xl border border-rule bg-surface p-4">
          <label className="block text-sm text-ink">
            Type <span className="font-semibold">{title}</span> to confirm.
          </label>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={title}
            autoComplete="off"
            className="mt-2 w-full rounded-xl border border-rule bg-bg px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand"
          />
          {err ? <p className="mt-2 text-xs font-semibold text-brand-deep">{err}</p> : null}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onDelete}
              disabled={!canDelete || pending}
              className="press inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
            >
              {pending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Permanently delete
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirmText("");
                setErr(null);
              }}
              disabled={pending}
              className="press rounded-xl border border-rule px-4 py-2.5 text-sm font-semibold text-mute hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
