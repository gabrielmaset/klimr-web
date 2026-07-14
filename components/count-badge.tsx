/** The house count bubble — flame gradient, optically centered tabular
 *  digits, crisp at 17px. Use `className="ring-2 ring-surface"` (or ring-bg)
 *  when it overlaps an icon so the edge stays sharp on any background. */
export function CountBadge({ count, max = 9, className = "" }: { count: number; max?: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={`inline-flex h-[17px] min-w-[17px] shrink-0 items-center justify-center rounded-full px-[5px] pb-px text-[10px] font-bold leading-none tracking-tight text-white tabular-nums shadow-[0_1px_2px_rgba(226,62,13,.4)] ${className}`}
      style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}
    >
      {count > max ? `${max}+` : count}
    </span>
  );
}
