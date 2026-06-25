"use client";

import { useState } from "react";
import type { ReactNode } from "react";

export type SettingsSection = { key: string; label: string; content: ReactNode };

/**
 * Two-column settings layout with a sticky vertical sub-nav (desktop) that
 * collapses to a horizontally scrollable tab strip on mobile. One section shows
 * at a time, which keeps long settings pages easy to scan and navigate.
 * Reusable anywhere a page has many grouped settings.
 */
export function SettingsShell({ sections, ariaLabel }: { sections: SettingsSection[]; ariaLabel?: string }) {
  const [active, setActive] = useState(sections[0]?.key ?? "");
  const current = sections.find((s) => s.key === active) ?? sections[0];

  return (
    <div className="grid gap-5 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
      <nav aria-label={ariaLabel ?? "Settings"} className="lg:sticky lg:top-20 lg:self-start">
        <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
          {sections.map((s) => {
            const on = s.key === current?.key;
            return (
              <li key={s.key} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  onClick={() => setActive(s.key)}
                  aria-current={on ? "page" : undefined}
                  className={`w-full whitespace-nowrap rounded-xl px-3.5 py-2 text-left text-sm font-semibold transition lg:whitespace-normal ${
                    on ? "bg-tint-brand text-brand-deep" : "text-mute hover:bg-bg hover:text-ink"
                  }`}
                >
                  {s.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-w-0">{current?.content}</div>
    </div>
  );
}
