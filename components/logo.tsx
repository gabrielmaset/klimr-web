/**
 * The Klimr mark — "The Climb": one staircase, one rising dot.
 * The dot is the period from the wordmark, elevated: the player at the top
 * of their block. Steps render in currentColor so the mark adapts to any
 * surface; the dot stays brand orange unless dot="current".
 */
export function KlimrMark({
  size = 24,
  dot = "brand",
  className,
}: {
  size?: number;
  dot?: "brand" | "current";
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      aria-hidden
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M 64,438 L 64,382 A 22 22 0 0 1 86,360 L 182,360 A 10 10 0 0 0 192,350 L 192,282 A 22 22 0 0 1 214,260 L 310,260 A 10 10 0 0 0 320,250 L 320,182 A 22 22 0 0 1 342,160 L 426,160 A 22 22 0 0 1 448,182 L 448,438 A 22 22 0 0 1 426,460 L 86,460 A 22 22 0 0 1 64,438 Z"
      />
      <circle cx="384" cy="96" r="46" fill={dot === "brand" ? "#FF4E1B" : "currentColor"} />
    </svg>
  );
}

/** Horizontal lockup: mark + "klimr". The mark's dot is the period. */
export function KlimrLogo({
  markSize = 26,
  textClassName = "text-[26px]",
}: {
  markSize?: number;
  textClassName?: string;
}) {
  return (
    <span className="inline-flex items-end gap-2">
      <KlimrMark size={markSize} className="text-ink" />
      <span className={`logotype leading-none text-ink ${textClassName}`}>
        klimr
      </span>
    </span>
  );
}
