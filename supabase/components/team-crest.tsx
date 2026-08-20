import { teamKit } from "@/lib/team-kit";

/** A team's club badge: a square in the team's generated colours with its initials.
 *  Pure/presentational, so it renders in both server and client components. */
export function TeamCrest({ name, size = 44, className = "", radius = 16 }: { name: string; size?: number; className?: string; radius?: number }) {
  const kit = teamKit(name);
  const initials = (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("") || name.slice(0, 2)
  ).toUpperCase();
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center overflow-hidden ${className}`}
      style={{ width: size, height: size, borderRadius: radius, background: `linear-gradient(135deg, ${kit.deep}, ${kit.primary})` }}
    >
      <span className="font-athletic font-bold uppercase leading-none text-white" style={{ fontSize: Math.round(size * 0.4) }}>
        {initials}
      </span>
    </span>
  );
}
