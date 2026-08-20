"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

const SORTS = [
  { value: "new", label: "Newest first" },
  { value: "read", label: "Most read" },
  { value: "az", label: "A–Z" },
];

/** Library index controls — full-text search (debounced) + sort.
 *  Any change resets pagination; state lives in the URL. */
export function LibraryControls() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("lq") ?? "");
  const first = useRef(true);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.replace(`/health?${next.toString()}#library`, { scroll: false });
  };

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => setParam("lq", q.trim()), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const sort = params.get("lsort") ?? "new";

  return (
    <>
      <div className="relative min-w-[240px] flex-1">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search thousands of reads — cramping, tennis elbow, match-day meals…"
          aria-label="Search the library"
          className="h-9 w-full rounded-[11px] border border-rule-soft bg-[#FDFBF7] pl-9 pr-3 text-[13px] text-ink outline-none placeholder:text-faint focus:border-brand"
        />
      </div>
      <select
        value={sort}
        onChange={(e) => setParam("lsort", e.target.value === "new" ? "" : e.target.value)}
        aria-label="Sort reads"
        className="h-9 rounded-[11px] border border-rule-2 bg-surface px-2.5 text-[13px] font-semibold text-ink outline-none"
      >
        {SORTS.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
    </>
  );
}
