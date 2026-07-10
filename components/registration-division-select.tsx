"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveRegistrationDivision } from "@/app/tournament/[id]/registrations/actions";

export type DivisionOption = { id: string; label: string };

/** Assign / switch / unassign an entry's division, inline on its row. */
export function RegistrationDivisionSelect({ regId, current, options }: { regId: string; current: string | null; options: DivisionOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-[11px] font-bold uppercase tracking-wider text-faint">Division</label>
      <select
        value={current ?? ""}
        disabled={pending}
        aria-label="Move to division"
        onChange={(e) => {
          const next = e.target.value || null;
          setErr(null);
          startTransition(async () => {
            const res = await moveRegistrationDivision(regId, next);
            if (!res.ok) setErr(res.error ?? "Couldn't move the entry.");
            else router.refresh();
          });
        }}
        className="h-8 rounded-[9px] border border-rule-2 bg-surface px-2 text-xs font-semibold text-ink outline-none disabled:opacity-50"
      >
        <option value="">No division (unassigned)</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
      {pending ? <span className="text-[11px] text-faint">Moving…</span> : null}
      {err ? <span className="text-[11px] font-semibold text-danger">{err}</span> : null}
    </div>
  );
}
