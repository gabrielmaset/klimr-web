// Pure social-graph logic — no IO, fully unit-testable.
// Server code (lib/social-server.ts) and UI both build on these.

import { sportMeta } from "@/lib/sports";

export type FriendStatus = "none" | "requested" | "incoming" | "friends";

/** Map a friendships row (or its absence) to the viewer's relationship state. */
export function mapFriendshipRow(
  viewerId: string,
  row: { requester_id: string; status: string } | null | undefined,
): FriendStatus {
  if (!row) return "none";
  if (row.status === "accepted") return "friends";
  if (row.status === "pending") return row.requester_id === viewerId ? "requested" : "incoming";
  return "none";
}

export type RelationshipContext = {
  mutual_count: number;
  shared_sports: string[];
  same_city: boolean;
  same_neighborhood: boolean;
  played_together: number;
  shared_team: string | null;
  co_tournaments: number;
};

/** Turn the relationship_context RPC row into human chips, most meaningful first.
 *  Only ever states overlaps built from information both profiles already show. */
export function buildContextChips(ctx: RelationshipContext, opts?: { max?: number; areaLabel?: string | null }): string[] {
  const chips: string[] = [];
  if (ctx.mutual_count > 0) chips.push(`${ctx.mutual_count} mutual connection${ctx.mutual_count === 1 ? "" : "s"}`);
  if (ctx.shared_team) chips.push(`Both on ${ctx.shared_team}`);
  if (ctx.played_together > 0) chips.push(`Played together ${ctx.played_together === 1 ? "once" : `${ctx.played_together}×`}`);
  if (ctx.shared_sports.length > 0) {
    const names = ctx.shared_sports.slice(0, 2).map((k) => sportMeta(k).name.toLowerCase());
    chips.push(`You both play ${names.join(" & ")}`);
  }
  if (ctx.co_tournaments > 0) chips.push(`${ctx.co_tournaments} tournament${ctx.co_tournaments === 1 ? "" : "s"} together`);
  if (ctx.same_neighborhood && opts?.areaLabel) chips.push(`Both in ${opts.areaLabel}`);
  else if (ctx.same_city && opts?.areaLabel) chips.push(`Both in ${opts.areaLabel}`);
  return chips.slice(0, opts?.max ?? 3);
}

export type PymkRow = {
  user_id: string;
  display_name: string;
  avatar_hue: number;
  avatar_path: string | null;
  verification_status: string;
  city: string | null;
  neighborhood: string | null;
  primary_sport: string | null;
  score: number;
  mutual_count: number;
  shared_sports: string[];
  played_together: number;
  shared_team: boolean;
  same_area: string | null;
};

/** One-line "why you're seeing this" for a PYMK card. */
export function pymkReason(row: PymkRow): string {
  if (row.mutual_count > 0) return `${row.mutual_count} mutual connection${row.mutual_count === 1 ? "" : "s"}`;
  if (row.shared_team) return "You share a team";
  if (row.played_together > 0) return `Played together ${row.played_together === 1 ? "once" : `${row.played_together}×`}`;
  if (row.shared_sports.length > 0) return `Also plays ${sportMeta(row.shared_sports[0]).name.toLowerCase()}`;
  if (row.same_area === "zip") return `In ${row.neighborhood ?? "your area"}`;
  if (row.same_area === "city") return `In ${row.city ?? "your city"}`;
  return "Active near you";
}

/** Map an RPC request_connection result to what the person should see. */
export function requestResultMessage(result: string): { ok: boolean; message: string | null } {
  switch (result) {
    case "requested":
    case "accepted":
    case "already_connected":
    case "already_requested":
      return { ok: true, message: null };
    case "cooldown":
      return { ok: false, message: "They passed on a recent request — you can try again later." };
    case "rate_limited":
      return { ok: false, message: "You've sent a lot of requests today — take a breather and try tomorrow." };
    case "unavailable":
      return { ok: false, message: "This player isn't available to connect with." };
    default:
      return { ok: false, message: "That didn't go through — try again." };
  }
}
