"use client";

import { useState, useTransition } from "react";
import { Settings2, Loader2, ArrowUpCircle, UserMinus } from "lucide-react";
import { setMemberRole, setMemberDesignation, transferOwnership, removeMember } from "../actions";

const ROLES = [
  { v: "manager", label: "Manager" },
  { v: "staff", label: "Staff" },
  { v: "member", label: "Member" },
];
const DESIGS = [
  { v: "", label: "No designation" },
  { v: "captain", label: "Captain" },
  { v: "co_captain", label: "Co-captain" },
  { v: "sub", label: "Sub" },
];

export function MemberControls({
  teamId,
  userId,
  name,
  role,
  designation,
  viewerIsOwner,
  isPro,
}: {
  teamId: string;
  userId: string;
  name: string;
  role: string;
  designation: string | null;
  viewerIsOwner: boolean;
  isPro: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(action: (fd: FormData) => Promise<void>, extra: Record<string, string>) {
    const fd = new FormData();
    fd.set("teamId", teamId);
    fd.set("userId", userId);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    startTransition(async () => {
      await action(fd);
    });
  }

  const sel = "rounded-lg border border-rule bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-brand";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Manage member"
        className="press grid h-8 w-8 place-items-center rounded-full text-faint hover:bg-bg hover:text-ink"
      >
        {pending ? <Loader2 size={15} className="animate-spin" /> : <Settings2 size={15} />}
      </button>

      {open ? (
        <div className="absolute right-0 top-9 z-10 w-56 rounded-2xl border border-rule bg-surface p-3 shadow-lg">
          <p className="mb-2 truncate text-xs font-bold text-ink">{name}</p>

          {viewerIsOwner && isPro ? (
            <label className="mb-2 block">
              <span className="kicker text-faint">Role</span>
              <select
                defaultValue={role === "owner" ? "manager" : role}
                disabled={pending || role === "owner"}
                onChange={(e) => run(setMemberRole, { role: e.target.value })}
                className={`mt-1 w-full ${sel}`}
              >
                {ROLES.map((r) => (
                  <option key={r.v} value={r.v}>{r.label}</option>
                ))}
              </select>
            </label>
          ) : null}

          {isPro ? (
            <label className="block">
              <span className="kicker text-faint">Designation</span>
              <select
                defaultValue={designation ?? ""}
                disabled={pending}
                onChange={(e) => run(setMemberDesignation, { designation: e.target.value })}
                className={`mt-1 w-full ${sel}`}
              >
                {DESIGS.map((d) => (
                  <option key={d.v} value={d.v}>{d.label}</option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="mt-3 space-y-1.5 border-t border-rule pt-3">
            {viewerIsOwner ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (confirm(`Make ${name} the owner? You'll become a manager.`)) run(transferOwnership, {});
                }}
                className="press flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-ink hover:bg-bg"
              >
                <ArrowUpCircle size={14} /> Make owner
              </button>
            ) : null}
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm(`Remove ${name} from the team?`)) run(removeMember, {});
              }}
              className="press flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-deep hover:bg-tint-brand"
            >
              <UserMinus size={14} /> Remove from team
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
