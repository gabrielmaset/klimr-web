/**
 * Presentational avatar. Renders the uploaded photo when present, otherwise a
 * deterministic hue-gradient with the player's initials. No client hooks, so it
 * works inside server components (header, etc.). The interactive uploader on the
 * account page is a separate client component.
 */
export function Avatar({
  url,
  hue,
  name,
  size = 32,
  ring = false,
  className = "",
}: {
  url: string | null;
  hue: number;
  name: string;
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  const initials =
    (name?.trim() || "K")
      .split(/\s+/)
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "K";

  const ringClass = ring ? "ring-2 ring-surface" : "";

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 rounded-full object-cover ${ringClass} ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full font-display leading-none text-surface ${ringClass} ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        background: `linear-gradient(145deg, hsl(${hue},85%,62%) 0%, hsl(${(hue + 22) % 360},80%,48%) 100%)`,
      }}
    >
      {initials}
    </span>
  );
}
