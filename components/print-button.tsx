"use client";

import { Printer } from "lucide-react";

/** Opens the browser print dialog — the reliable, zero-dependency route to a
 *  clean PDF ("Save as PDF" is a destination in every modern browser). */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="press inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-surface transition hover:bg-ink-soft print:hidden"
    >
      <Printer size={15} /> Print / Save as PDF
    </button>
  );
}
