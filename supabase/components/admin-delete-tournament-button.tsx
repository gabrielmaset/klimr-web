"use client";

import { useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { adminDeleteTournament } from "@/app/admin/actions";

export function AdminDeleteTournamentButton({ id, title }: { id: string; title: string }) {
  const [pending, start] = useTransition();
  function onClick() {
    if (!confirm(`Permanently delete "${title}"? This removes the event and all of its registrations, divisions, and payments. This cannot be undone.`)) return;
    const fd = new FormData();
    fd.set("tournamentId", id);
    start(() => adminDeleteTournament(fd));
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-lg border border-rule px-2.5 py-1.5 text-xs font-semibold text-mute transition-colors hover:border-brand hover:text-brand-deep disabled:opacity-50"
    >
      {pending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete
    </button>
  );
}
