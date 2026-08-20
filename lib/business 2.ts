// Business Accounts — shared vocabulary for the console and public pages.

export const BUSINESS_KINDS = [
  { key: "professional", label: "Professional", blurb: "Coach, instructor, or other pro" },
  { key: "venue", label: "Venue", blurb: "Courts, clubs with facilities" },
  { key: "shop", label: "Shop", blurb: "Gear, stringing, retail" },
  { key: "club", label: "Club", blurb: "Community or membership club" },
  { key: "brand", label: "Brand", blurb: "Products and sponsors" },
] as const;

export type BusinessKind = (typeof BUSINESS_KINDS)[number]["key"];

export const TIER_LABEL: Record<string, string> = {
  none: "Unverified",
  tier1: "Verified",
  tier2: "Sponsor-ready",
};

export const BUSINESS_STATUS_LABEL: Record<string, string> = {
  draft: "Awaiting review",
  active: "Active",
  suspended: "Suspended",
};

export const SPONSORSHIP_STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting approval",
  active: "Active",
  declined: "Declined",
  ended: "Ended",
};

export function kindLabel(k: string): string {
  return BUSINESS_KINDS.find((x) => x.key === k)?.label ?? k;
}

export function businessSlug(name: string, seed: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "business";
  return `${base}-${seed.replace(/-/g, "").slice(0, 4)}`;
}
