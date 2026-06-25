"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export type SettingsSection = { key: string; label: string; content: ReactNode };

/**
 * Two-column settings layout: a sticky vertical sub-nav (desktop) / horizontally
 * scrollable tab strip (mobile) beside the full stack of sections. All sections
 * stay on one page; the nav smooth-scrolls to a section and scroll-spy highlights
 * whichever section is currently in view. Reusable anywhere a page has many
 * grouped settings.
 */
export function SettingsShell({ sections, ariaLabel }: { sections: SettingsSection[]; ariaLabel?: string }) {
  const [active, setActive] = useState(sections[0]?.key ?? "");
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const clickLock = useRef(false);
  const sectionKeys = sections.map((s) => s.key).join("|");

  // Scroll-spy: highlight the section nearest the top of the viewport.
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        if (clickLock.current) return; // hold during a click-scroll
        const vis = entries.filter((e) => e.isIntersecting);
        if (!vis.length) return;
        const topmost = vis.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
        const key = topmost.target.getAttribute("data-key");
        if (key) setActive(key);
      },
      { rootMargin: "-12% 0px -72% 0px", threshold: 0 },
    );
    for (const s of sections) {
      const el = refs.current[s.key];
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKeys]);

  function go(key: string) {
    setActive(key);
    clickLock.current = true;
    refs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      clickLock.current = false;
    }, 800);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
      <nav aria-label={ariaLabel ?? "Settings"} className="pb-1 lg:sticky lg:top-20 lg:self-start lg:pb-0">
        <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {sections.map((s) => {
            const on = s.key === active;
            return (
              <li key={s.key} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  onClick={() => go(s.key)}
                  aria-current={on ? "true" : undefined}
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
      <div className="grid min-w-0 gap-4">
        {sections.map((s) => (
          <div
            key={s.key}
            data-key={s.key}
            ref={(el) => {
              refs.current[s.key] = el;
            }}
            className="scroll-mt-24"
          >
            {s.content}
          </div>
        ))}
      </div>
    </div>
  );
}
