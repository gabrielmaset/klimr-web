"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

const FORMATS = [
  { value: "", label: "All formats" },
  { value: "inperson", label: "In-person" },
  { value: "virtual", label: "Virtual" },
];
const SORTS = [
  { value: "top", label: "Top rated" },
  { value: "reviewed", label: "Most reviewed" },
  { value: "price", label: "Price: low to high" },
  { value: "near", label: "Nearest first" },
];

/** Directory controls — format segmented, pro search (debounced), sort.
 *  All state lives in URL searchParams; specialty chips are server links. */
export function ProControls() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const first = useRef(true);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("pro");
    router.replace(`/health?${next.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => setParam("q", q.trim()), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const format = params.get("format") ?? "";
  const sort = params.get("sort") ?? "top";

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="flex rounded-[11px] p-[3px]" style={{ background: "rgba(32,27,18,.05)" }} role="tablist" aria-label="Session format">
        {FORMATS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={format === f.value}
            onClick={() => setParam("format", f.value)}
            className={`press rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${format === f.value ? "border border-rule-2 bg-white text-ink shadow-[0_1px_2px_rgba(80,60,30,.08)]" : "text-mute hover:text-ink"}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="relative min-w-[220px] flex-1">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search pros — name, credentials, specialty, area…"
          aria-label="Search professionals"
          className="h-[34px] w-full rounded-[11px] border border-rule-soft bg-[#FDFBF7] pl-9 pr-3 text-[13px] text-ink outline-none placeholder:text-faint focus:border-brand"
        />
      </div>
      <select
        value={sort}
        onChange={(e) => setParam("sort", e.target.value === "top" ? "" : e.target.value)}
        aria-label="Sort professionals"
        className="h-[34px] rounded-[11px] border border-rule-2 bg-surface px-2.5 text-[13px] font-semibold text-ink outline-none"
      >
        {SORTS.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
    </div>
  );
}
