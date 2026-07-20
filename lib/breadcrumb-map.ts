/**
 * The site-wide breadcrumb REGISTRY — the "zero configuration" tier.
 *
 * AutoBreadcrumbs (mounted once in the app shell) derives a location trail for
 * ANY in-shell page from this map, so new pages get breadcrumbs by default
 * with no per-page wiring. Pages that know richer truth (real entity titles,
 * data-driven parents like Events > {Event} > Live queue) render their own
 * <Breadcrumbs/> server-side — and a global CSS rule hides the auto trail
 * whenever a hand-wired one is present, so the two tiers can never collide.
 *
 * Standalone surfaces (/q, /e, tournament & team workspaces, onboarding) never
 * see the auto tier because it lives inside the shell they opt out of.
 */

export const SEGMENT_LABELS: Record<string, string> = {
  events: "Events",
  tournaments: "Tournaments",
  teams: "Teams",
  classes: "Classes & Coaching",
  marketplace: "Marketplace",
  discover: "Players",
  profile: "Players",
  courts: "Courts",
  network: "Network",
  invites: "Invites",
  challenges: "Challenges",
  play: "Play",
  rankings: "Rankings",
  resources: "Playbook",
  health: "Health & Nutrition",
  sponsorships: "Sponsorships",
  settings: "Settings",
  account: "Account",
  admin: "Admin",
  queue: "Live Queue",
  support: "Support",
  notifications: "Notifications",
  calendar: "Calendar",
  archive: "Archive",
  // common tails
  past: "Past",
  new: "New",
  edit: "Edit",
  mine: "My listings",
  "review-policy": "Review policy",
  // settings sections
  availability: "Availability",
  blocked: "Blocked players",
  diagnostics: "Diagnostics",
  email: "Email",
  professional: "Professional status",
  "profile-page": "Profile page",
  sports: "Sports",
  verification: "Verification",
  export: "Export",
  // admin sections
  moderation: "Moderation",
  users: "Users",
  providers: "Providers",
  broadcast: "Broadcast",
  codes: "Codes",
  feed: "Post to Feed",
};

/** Label for a dynamic segment (id/slug), keyed by its PARENT segment. */
export const DYNAMIC_LEAF: Record<string, string> = {
  events: "Event",
  tournaments: "Tournament",
  teams: "Team",
  classes: "Class",
  marketplace: "Listing",
  discover: "Player",
  profile: "Player",
  courts: "Court",
  challenges: "Challenge",
  play: "Match",
  resources: "Guide",
  read: "Article",
  queue: "Live queue",
  support: "Ticket",
  sponsorships: "Sponsorship",
  chats: "Conversation",
  users: "User",
  providers: "Provider",
};

/** Structural segments that add nothing to the trail. */
const SKIP = new Set(["read"]);

/** Section roots whose crumb should link somewhere other than /<segment>. */
const ROOT_HREF: Record<string, string> = {
  profile: "/discover",
};

export type AutoCrumb = { label: string; href?: string };

const looksDynamic = (seg: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(seg) || /^\d+$/.test(seg) || (seg.length > 14 && !SEGMENT_LABELS[seg]);

const titleCase = (seg: string): string =>
  seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Build the location trail for a pathname, or null when no trail applies. */
export function buildAutoTrail(pathname: string): AutoCrumb[] | null {
  const raw = pathname.split("?")[0].split("/").filter(Boolean);
  if (raw.length < 2) return null;

  const items: AutoCrumb[] = [];
  let href = "";
  let prev = "";
  for (const seg of raw) {
    href += `/${seg}`;
    if (SKIP.has(seg)) {
      prev = seg;
      continue;
    }
    const dynamic = looksDynamic(seg) || (!!DYNAMIC_LEAF[prev] && !SEGMENT_LABELS[seg]);
    const label = dynamic ? (DYNAMIC_LEAF[prev] ?? "Details") : (SEGMENT_LABELS[seg] ?? titleCase(seg));
    const crumbHref = items.length === 0 ? (ROOT_HREF[seg] ?? href) : href;
    items.push({ label, href: crumbHref });
    prev = seg;
  }
  if (items.length < 2) return null;
  delete items[items.length - 1].href; // current page is never a link
  return items;
}
