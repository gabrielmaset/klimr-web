/** The house count bubble — the Facebook/iOS spec: a flat solid-red perfect
 *  circle (gradients read muddy at this size), 18px tall, white 11px
 *  semibold digits grid-centered (no baseline tricks needed), pill only past
 *  one digit, "9+" overflow. Add `ring-2 ring-surface` (or ring-bg) via
 *  className when it floats over an icon. */
export function CountBadge({ count, max = 9, className = "" }: { count: number; max?: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={`grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-[#E7350F] px-[5px] text-[11px] font-semibold leading-none text-white ${className}`}
      aria-hidden
    >
      {count > max ? `${max}+` : count}
    </span>
  );
}
