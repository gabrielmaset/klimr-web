import { Crown } from "lucide-react";
import { Avatar } from "@/components/avatar";

const DESIG: Record<string, string> = { captain: "Captain", co_captain: "Co-captain", sub: "Reserve" };

/**
 * A collectible "sticker" card for a team player — the team-page signature.
 * Presentational only (server-safe). The hue drives the top band + avatar so
 * each card reads as its own collectible while staying cohesive. Stats are
 * pulled from player_sports for the team's sport; players with no record yet
 * read as "Unranked" rather than showing zeros as if they were real results.
 */
export function TeamSticker({
  name,
  avatarUrl,
  hue,
  role,
  designation,
  city,
  skillLevel,
  points,
  wins,
  matches,
  isMe,
}: {
  name: string;
  avatarUrl: string | null;
  hue: number;
  role: string;
  designation: string | null;
  city: string | null;
  skillLevel: string | null;
  points: number | null;
  wins: number | null;
  matches: number | null;
  isMe?: boolean;
}) {
  const isOwner = role === "owner";
  const topLabel = designation ? DESIG[designation] ?? designation : isOwner ? "Owner" : "Player";
  const losses = matches != null && wins != null ? Math.max(matches - wins, 0) : null;
  const band = `linear-gradient(135deg, hsl(${hue} 85% 92%), hsl(${hue} 78% 84%))`;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-rule bg-[linear-gradient(180deg,#ffffff,#fbfbfc)] shadow-[0_8px_22px_-14px_rgba(10,10,11,0.35)]">
      {/* foil sheen */}
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl bg-[linear-gradient(135deg,rgba(255,255,255,0.55),rgba(255,255,255,0)_30%)]" />
      {/* hue band */}
      <div className="flex h-8 items-center justify-between px-3" style={{ background: band }}>
        <span className="text-[9px] font-extrabold uppercase tracking-[0.07em] text-ink/55">{topLabel}</span>
        {isOwner ? <Crown size={13} className="text-brand-deep" aria-label="Owner" /> : null}
      </div>
      {/* avatar overlapping the band */}
      <div className="-mt-5 flex justify-center">
        <Avatar url={avatarUrl} hue={hue} name={name} size={62} ring />
      </div>
      <p className="mt-2 truncate px-2 text-center text-sm font-bold text-ink">
        {name}
        {isMe ? <span className="font-normal text-faint"> · you</span> : null}
      </p>
      {city ? <p className="truncate px-2 text-center text-[11px] text-mute">{city}</p> : <div className="h-[15px]" />}
      <div className="mt-2 flex min-h-[20px] flex-wrap justify-center gap-1.5 px-2">
        {skillLevel ? (
          <span className="rounded-full border border-rule bg-[#f4f4f5] px-2 py-0.5 text-[9.5px] font-semibold text-ink-soft">{skillLevel}</span>
        ) : null}
      </div>
      <div className="mx-2 mb-3 mt-2.5 flex items-center justify-center gap-2 border-t border-dashed border-rule pt-2.5 text-[11px] font-semibold text-brand-deep">
        {points != null ? <span className="font-mono text-ink-soft">{points.toLocaleString()} pts</span> : <span className="text-faint">Unranked</span>}
        {losses != null && matches ? (
          <>
            <span className="text-faint">·</span>
            <span>
              {wins}–{losses}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
