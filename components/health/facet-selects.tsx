"use client";

import { useRouter, useSearchParams } from "next/navigation";

/** Mobile facets — the rail's specialty & format as two native selects. */
export function FacetSelects({ specialties }: { specialties: { key: string; label: string; count: number }[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("pro");
    router.replace(`/health?${next.toString()}`, { scroll: false });
  };
  const cls = "h-9 min-w-0 flex-1 rounded-[11px] border border-rule-2 bg-surface px-2.5 text-[13px] font-semibold text-ink outline-none";
  return (
    <div className="flex gap-2 md:hidden">
      <select value={params.get("spec") ?? ""} onChange={(e) => setParam("spec", e.target.value)} aria-label="Specialty" className={cls}>
        <option value="">All specialties</option>
        {specialties.map((s) => (
          <option key={s.key} value={s.key}>{s.label} ({s.count})</option>
        ))}
      </select>
      <select value={params.get("format") ?? ""} onChange={(e) => setParam("format", e.target.value)} aria-label="Session format" className={cls}>
        <option value="">All formats</option>
        <option value="inperson">In-person</option>
        <option value="virtual">Virtual</option>
      </select>
    </div>
  );
}
