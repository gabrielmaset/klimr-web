// Second Serve (gear marketplace) — shared constants + helpers.
// Palette per KLIMR-MARKETPLACE-HANDOFF §1; house tokens where roles match.

import { lookupZip } from "@/lib/us-places";

export const CATEGORIES = [
  { key: "racquets", label: "Racquets & paddles" },
  { key: "balls", label: "Balls & training" },
  { key: "footwear", label: "Footwear" },
  { key: "bags", label: "Bags" },
  { key: "court", label: "Nets & court gear" },
] as const;
export type CategoryKey = (typeof CATEGORIES)[number]["key"];

export const MODES = ["sale", "trade", "free"] as const;
export type Mode = (typeof MODES)[number];

export const CONDITIONS = ["New", "Like new", "Good", "Well used"] as const;

// Page-local status colors (handoff): trade=sun, free=grass (distinct from token success by design).
export const TRADE_TONE = { fg: "#B45309", bg: "#FDF3DD", bd: "#F1E0B6" };
export const FREE_TONE = { fg: "#217A34", bg: "#EFF8F0", bd: "#CFE8D5" };
export const PENDING_TONE = { fg: "#8A8069", bg: "#F4EFE5", bd: "#E4DCCB" };
export const MULTI_TONE = { fg: "#6E6555", bg: "#F4EFE5", bd: "#E4DCCB" };

export const RADII_MI = [5, 10, 25, 50] as const;
export const LISTING_LIFESPAN_DAYS = 30;

/** Neighborhood-level distance between two ZIP centroids (miles, 1dp). */
export function zipDistanceMi(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const za = lookupZip(a);
  const zb = lookupZip(b);
  if (!za || !zb) return null;
  const R = 3958.8;
  const dLat = ((zb.lat - za.lat) * Math.PI) / 180;
  const dLng = ((zb.lng - za.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((za.lat * Math.PI) / 180) * Math.cos((zb.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)) * 10) / 10;
}

export function daysAgo(iso: string, nowMs: number) {
  return Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 86400000));
}

export function isExpired(l: { expires_at: string; status: string }, nowMs: number) {
  return l.status === "active" && new Date(l.expires_at).getTime() < nowMs;
}

/** Sold listings keep a 48h SOLD grace in browse, then disappear. */
export function soldGraceOver(l: { sold_at: string | null }, nowMs: number) {
  return !!l.sold_at && nowMs - new Date(l.sold_at).getTime() > 48 * 3600 * 1000;
}

export function priceLabel(l: { mode: string; priceCents: number | null }) {
  if (l.mode === "trade") return "TRADE";
  if (l.mode === "free") return "FREE";
  if (l.priceCents == null) return "$—";
  return `$${Math.round(l.priceCents / 100).toLocaleString("en-US")}`;
}
