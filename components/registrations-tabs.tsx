"use client";

import { useState } from "react";
import type { ReactNode } from "react";

export function RegistrationsTabs({
  regCount,
  waitCount,
  registrations,
  waitlist,
}: {
  regCount: number;
  waitCount: number;
  registrations: ReactNode;
  waitlist: ReactNode;
}) {
  const [tab, setTab] = useState<"regs" | "wait">("regs");
  const tabCls = (active: boolean) => `rounded-lg px-4 py-1.5 text-sm font-semibold transition ${active ? "bg-ink text-white" : "text-mute hover:text-ink"}`;
  return (
    <>
      <div className="mb-5 inline-flex rounded-xl border border-rule bg-surface p-1">
        <button type="button" onClick={() => setTab("regs")} className={tabCls(tab === "regs")}>
          Registrations <span className="opacity-70">{regCount}</span>
        </button>
        <button type="button" onClick={() => setTab("wait")} className={tabCls(tab === "wait")}>
          Waitlist <span className="opacity-70">{waitCount}</span>
        </button>
      </div>
      <div>{tab === "regs" ? registrations : waitlist}</div>
    </>
  );
}
