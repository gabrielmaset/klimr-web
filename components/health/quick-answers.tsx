"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { QuickAnswer } from "@/lib/health-content";

/** Accordion — one open at a time; every answer links its source read and,
 *  where the pattern is personal, points to the pro directory. */
export function QuickAnswers({ items }: { items: QuickAnswer[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="divide-y divide-rule-soft">
      {items.map((qa) => {
        const isOpen = open === qa.id;
        return (
          <div key={qa.id}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : qa.id)}
              className="press flex min-h-[44px] w-full items-center justify-between gap-3 py-3 text-left"
            >
              <span className="text-[13.5px] font-semibold text-ink">{qa.question}</span>
              <ChevronDown size={15} className={`shrink-0 text-faint transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen ? (
              <div className="pb-4">
                <p className="text-[13px] leading-relaxed text-ink-soft">{qa.answer}</p>
                <p className="mt-2 text-xs">
                  <Link href={`/health/read/${qa.sourceSlug}`} className="font-semibold text-brand-deep hover:underline">Read the full piece →</Link>
                  {qa.suggestPro ? (
                    <>
                      {" · "}
                      <Link href="/health" className="font-semibold text-brand-deep hover:underline">Find a verified pro</Link>
                    </>
                  ) : null}
                </p>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
